import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { evaluateProperty, type PropertyInput } from "@/lib/scoring";

const execFileAsync = promisify(execFile);

async function runPythonScore(pyScript: string, payloadJson: string): Promise<{ raw: string; bin: string }> {
  const candidates =
    process.platform === "win32"
      ? [
          { bin: "python", prefix: [] as string[] },
          { bin: "py", prefix: ["-3"] },
          { bin: "python3", prefix: [] as string[] },
        ]
      : [
          { bin: "python3", prefix: [] as string[] },
          { bin: "python", prefix: [] as string[] },
        ];
  let lastError: unknown;
  for (const { bin, prefix } of candidates) {
    try {
      const { stdout } = await execFileAsync(bin, [...prefix, "-c", pyScript, payloadJson], { timeout: 4000 });
      return { raw: stdout.trim(), bin };
    } catch (e: unknown) {
      lastError = e;
      if ((e as NodeJS.ErrnoException)?.code === "ENOENT") continue;
      throw e;
    }
  }
  throw lastError ?? new Error("Python interpreter not found");
}

/**
 * POST /api/score
 * Runs `capstone/scoring/engine.py` directly via Python 3 to compute and verify
 * the yield scenarios, 4-factor risk score, and SHA-256 `valuation_hash`.
 * Falls back to the identical TypeScript engine if Python is unavailable.
 */
export async function POST(req: Request) {
  try {
    const raw = (await req.json()) as Partial<PropertyInput> | null;
    if (!raw || typeof raw.name !== "string" || typeof raw.city !== "string") {
      return NextResponse.json({ error: "name and city must be strings" }, { status: 400 });
    }
    // Same defaults as `PropertyInput` in engine.py, applied before either engine runs
    const body = {
      ...raw,
      platform_rent_fee_bps: raw.platform_rent_fee_bps ?? 100,
      platform_sale_fee_bps: raw.platform_sale_fee_bps ?? 150,
      building_age_years: raw.building_age_years ?? 5,
    } as PropertyInput;
    const scoringDir = path.resolve(process.cwd(), "..", "scoring");
    const pyScript = `
import json, sys
from dataclasses import asdict
sys.path.insert(0, ${JSON.stringify(scoringDir)})
from engine import PropertyInput, evaluate_property
data = json.loads(sys.argv[1])
inp = PropertyInput(
    property_id=int(data["property_id"]),
    name=str(data["name"]),
    city=str(data["city"]),
    price_usd=float(data["price_usd"]),
    gross_yield=float(data["gross_yield"]),
    vacancy_rate=float(data["vacancy_rate"]),
    opex_ratio=float(data["opex_ratio"]),
    manager_fee_ratio=float(data["manager_fee_ratio"]),
    platform_rent_fee_bps=int(data.get("platform_rent_fee_bps", 100)),
    platform_sale_fee_bps=int(data.get("platform_sale_fee_bps", 150)),
    building_age_years=int(data.get("building_age_years", 5)),
)
rep = evaluate_property(inp)
out = asdict(rep)
out["valuation_hash_bytes"] = list(bytes.fromhex(rep.valuation_hash_hex))
out["engine_source"] = "python3 (capstone/scoring/engine.py)"
print(json.dumps(out))
`;
    try {
      const { raw, bin } = await runPythonScore(pyScript, JSON.stringify(body));
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      parsed.engine_source = `${bin} (capstone/scoring/engine.py)`;
      return NextResponse.json(parsed);
    } catch {
      const fallback = evaluateProperty(body);
      return NextResponse.json({ ...fallback, engine_source: "typescript-fallback" });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

