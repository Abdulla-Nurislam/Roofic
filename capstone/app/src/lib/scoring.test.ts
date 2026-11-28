import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, test } from "node:test";
import { BN } from "@anchor-lang/core";
import { Keypair, PublicKey } from "@solana/web3.js";
import { PYTH_RECEIVER, SOL_USD_FEED, decodePriceUpdateV2 } from "./defi";
import {
  ACC_SCALE,
  bpsOf,
  configPda,
  formatToken,
  investorPda,
  parsePublicKey,
  pendingRent,
  positionPda,
  propertyPda,
  shareMintPda,
  toRawUnits,
  vaultPda,
} from "./program";
import {
  KNOWN_REPORTS_BY_HASH,
  PRESET_CATALOG,
  bytesToHex,
  evaluateProperty,
  hexToBytes,
  sha256Bytes,
  type PropertyInput,
} from "./scoring";

const sampleInput: PropertyInput = PRESET_CATALOG[0].input;

function buildPriceUpdateV2(opts?: {
  level?: number;
  price?: bigint;
  conf?: bigint;
  expo?: number;
  publishTime?: bigint;
  byteLength?: number;
}): Uint8Array {
  const level = opts?.level ?? 1;
  const totalLen = opts?.byteLength ?? (level === 0 ? 118 : 117);
  const buf = new Uint8Array(totalLen);
  const view = new DataView(buf.buffer);
  let o = 8 + 32; // discriminator + write_authority
  if (o < totalLen) view.setUint8(o, level);
  o += level === 0 ? 2 : 1;
  o += 32; // feed_id
  if (o + 44 <= totalLen) {
    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    view.setBigInt64(o, opts?.price ?? 150_00000000n, true);
    view.setBigUint64(o + 8, opts?.conf ?? 50000000n, true);
    view.setInt32(o + 16, opts?.expo ?? -8, true);
    view.setBigInt64(o + 20, opts?.publishTime ?? nowSec, true);
    view.setBigInt64(o + 28, opts?.publishTime ?? nowSec, true);
    view.setBigInt64(o + 36, opts?.price ?? 150_00000000n, true);
  }
  return buf;
}

describe("scoring.ts", () => {
  test("sha256Bytes matches node:crypto across block boundaries", () => {
    for (const text of ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "Алматы ".repeat(40)]) {
      assert.equal(bytesToHex(sha256Bytes(text)), createHash("sha256").update(text, "utf8").digest("hex"));
    }
  });

  // Эти значения посчитаны Python-движком: расхождение означает, что хеш в UI не совпадёт с эталоном
  test("produces the same valuation_hash as engine.py for the preset catalog", () => {
    assert.deepEqual(
      PRESET_CATALOG.map((item) => evaluateProperty(item.input).valuation_hash_hex.slice(0, 16)),
      ["65801abf0776d0b4", "5ab5ab049c3c6425", "72cac0027b03ed2a"],
    );
  });

  test("maintains bear <= base <= bull ordering on normal and extreme inputs", () => {
    const cases: Partial<PropertyInput>[] = [
      {},
      { opex_ratio: 0.93, manager_fee_ratio: 0.02 },
      { opex_ratio: 0.01 },
      { vacancy_rate: 0.97 },
    ];
    for (const override of cases) {
      const rep = evaluateProperty({ ...sampleInput, ...override });
      assert.ok(rep.net_yield_bear <= rep.net_yield_base);
      assert.ok(rep.net_yield_base <= rep.net_yield_bull);
      assert.ok(rep.risk_score >= 0 && rep.risk_score <= 100);
    }
  });

  test("matches Python engine.py SHA-256 hash on Cyrillic UTF-8 input", () => {
    const rep = evaluateProperty({
      property_id: 2,
      name: "Тест Алматы",
      city: "Алматы",
      price_usd: 123_456.78,
      gross_yield: 0.0731,
      vacancy_rate: 0.113,
      opex_ratio: 0.271,
      manager_fee_ratio: 0.0615,
      platform_rent_fee_bps: 100,
      platform_sale_fee_bps: 150,
      building_age_years: 27,
    });
    assert.equal(rep.risk_score, 73);
    assert.equal(rep.valuation_hash_hex.slice(0, 16), "46e7f31ddc9d8c3b");
  });

  test("matches Python engine.py SHA-256 hash on boundary and rounding edge cases", () => {
    const cases: Array<{ input: PropertyInput; expectedScore: number; expectedPrefix: string }> = [
      {
        input: {
          property_id: 101,
          name: "Vacancy Stress",
          city: "Almaty",
          price_usd: 150_000,
          gross_yield: 0.095,
          vacancy_rate: 0.16,
          opex_ratio: 0.18,
          manager_fee_ratio: 0.05,
          platform_rent_fee_bps: 100,
          platform_sale_fee_bps: 150,
          building_age_years: 6,
        },
        expectedScore: 51,
        expectedPrefix: "4a740e81bcdd7d13",
      },
      {
        input: {
          property_id: 102,
          name: "Old Heritage",
          city: "Almaty",
          price_usd: 90_000,
          gross_yield: 0.09,
          vacancy_rate: 0.14,
          opex_ratio: 0.22,
          manager_fee_ratio: 0.05,
          platform_rent_fee_bps: 100,
          platform_sale_fee_bps: 150,
          building_age_years: 28,
        },
        expectedScore: 70,
        expectedPrefix: "da0e80a9c23f5a9c",
      },
      {
        input: {
          property_id: 103,
          name: "Extreme Opex",
          city: "Astana",
          price_usd: 100_000,
          gross_yield: 0.08,
          vacancy_rate: 0.85,
          opex_ratio: 0.9,
          manager_fee_ratio: 0.09,
          platform_rent_fee_bps: 100,
          platform_sale_fee_bps: 150,
          building_age_years: 25,
        },
        expectedScore: 95,
        expectedPrefix: "57bec881c120efb8",
      },
      {
        input: {
          property_id: 104,
          name: "Halfway Tie",
          city: "Shymkent",
          price_usd: 100_000,
          gross_yield: 0.125,
          vacancy_rate: 0.25,
          opex_ratio: 0.2,
          manager_fee_ratio: 0.05,
          platform_rent_fee_bps: 0,
          platform_sale_fee_bps: 150,
          building_age_years: 10,
        },
        expectedScore: 58,
        expectedPrefix: "310f439d5a800946",
      },
      {
        input: {
          property_id: 105,
          name: "Near Half Risk",
          city: "Almaty",
          price_usd: 100_000,
          gross_yield: 0.095,
          vacancy_rate: 0.07,
          opex_ratio: 0.16,
          manager_fee_ratio: 0.0816666666666667,
          platform_rent_fee_bps: 100,
          platform_sale_fee_bps: 150,
          building_age_years: 4,
        },
        expectedScore: 38,
        expectedPrefix: "cd7a5f5a9d12b9e8",
      },
    ];
    for (const { input, expectedScore, expectedPrefix } of cases) {
      const rep = evaluateProperty(input);
      assert.equal(rep.risk_score, expectedScore, input.name);
      assert.equal(rep.valuation_hash_hex.slice(0, 16), expectedPrefix, input.name);
    }
  });

  test("rejects NaN, non-finite, negative, and out-of-range inputs", () => {
    const badInputs: Partial<PropertyInput>[] = [
      { price_usd: 0 },
      { vacancy_rate: 1.0 },
      { gross_yield: 0.5 },
      { gross_yield: 0.75 },
      { gross_yield: 0 },
      { gross_yield: -0.05 },
      { price_usd: Number.NaN },
      { price_usd: Number.POSITIVE_INFINITY },
      { building_age_years: Number.NaN },
      { opex_ratio: -0.1, manager_fee_ratio: 0.2 },
      { opex_ratio: 0.8, manager_fee_ratio: 0.2 },
      { platform_rent_fee_bps: 10_001 },
      { platform_sale_fee_bps: -1 },
    ];
    for (const bad of badInputs) {
      assert.throws(() => evaluateProperty({ ...sampleInput, ...bad }));
    }
  });

  test("round-trips bytesToHex/hexToBytes and builds KNOWN_REPORTS_BY_HASH", () => {
    const rep = evaluateProperty(sampleInput);
    const bytes = hexToBytes(`0x${rep.valuation_hash_hex}`);
    assert.equal(bytes.length, 32);
    assert.equal(bytesToHex(bytes), rep.valuation_hash_hex);
    assert.deepEqual(hexToBytes("deadbeef"), new Array(32).fill(0));

    for (const item of PRESET_CATALOG) {
      const r = evaluateProperty(item.input);
      assert.equal(KNOWN_REPORTS_BY_HASH[r.valuation_hash_hex]?.input.name, item.input.name);
    }
  });
});

describe("program.ts helpers", () => {
  test("computes pendingRent without underflow and formats/parses tokens safely", () => {
    const oneShare = new BN(10);
    const acc = ACC_SCALE.mul(new BN(2)); // 2.0 per share
    assert.equal(pendingRent(oneShare, acc, new BN(5), new BN(3)).toString(), "18");
    // Reward debt exceeding accrued clamps to 0 instead of going negative
    assert.equal(pendingRent(oneShare, acc, new BN(999), new BN(4)).toString(), "4");

    assert.equal(bpsOf(new BN(10_000), 150).toString(), "150");
    assert.equal(formatToken(new BN(1_500_000), 6), "1.5");
    assert.equal(formatToken(Number.NaN, 6), "0");
    assert.equal(toRawUnits(12.34, 6).toString(), "12340000");
    assert.equal(toRawUnits(Number.NaN, 6).toString(), "0");
    assert.equal(toRawUnits(-5, 6).toString(), "0");

    const kp = Keypair.generate().publicKey;
    assert.equal(parsePublicKey(` ${kp.toBase58()} `)?.toBase58(), kp.toBase58());
    assert.equal(parsePublicKey("not-a-pubkey"), null);
    assert.equal(parsePublicKey("   "), null);
  });

  test("derives deterministic and distinct PDAs across owners and property IDs", () => {
    const ownerA = Keypair.generate().publicKey;
    const ownerB = Keypair.generate().publicKey;
    assert.equal(configPda().toBase58(), configPda().toBase58());
    assert.notEqual(investorPda(ownerA).toBase58(), investorPda(ownerB).toBase58());

    const prop1 = propertyPda(ownerA, new BN(1));
    const prop2 = propertyPda(ownerA, new BN(2));
    assert.equal(prop1.toBase58(), propertyPda(ownerA, new BN(1)).toBase58());
    assert.notEqual(prop1.toBase58(), prop2.toBase58());
    assert.notEqual(shareMintPda(prop1).toBase58(), vaultPda(prop1).toBase58());
    assert.notEqual(positionPda(prop1, ownerA).toBase58(), positionPda(prop1, ownerB).toBase58());
  });
});

describe("defi.ts Pyth PriceUpdateV2 decoder", () => {
  test("decodes valid Full feed and rejects truncated or wrong-owner accounts", () => {
    const fullData = buildPriceUpdateV2({ level: 1, price: 150_00000000n, conf: 50000000n });
    const snap = decodePriceUpdateV2("SOL/USD", SOL_USD_FEED, PYTH_RECEIVER, fullData);
    assert.ok(snap);
    assert.equal(snap.price, 150);
    assert.equal(snap.conservativePrice, 149.5);
    assert.equal(snap.verifiedFull, true);
    assert.equal(snap.healthy, true);

    assert.equal(
      decodePriceUpdateV2("SOL/USD", SOL_USD_FEED, PYTH_RECEIVER, fullData.slice(0, 116)),
      null,
    );
    assert.equal(
      decodePriceUpdateV2("SOL/USD", SOL_USD_FEED, PYTH_RECEIVER, buildPriceUpdateV2({ level: 0, byteLength: 117 })),
      null,
    );
    assert.equal(
      decodePriceUpdateV2("SOL/USD", SOL_USD_FEED, PublicKey.default, fullData),
      null,
    );

    const zeroPrice = decodePriceUpdateV2(
      "SOL/USD",
      SOL_USD_FEED,
      PYTH_RECEIVER,
      buildPriceUpdateV2({ level: 1, price: 0n, conf: 0n }),
    );
    assert.ok(zeroPrice);
    assert.equal(zeroPrice.healthy, false);
  });

  test("marks stale, wide-conf, and negative Pyth prices as unhealthy", () => {
    const staleSec = BigInt(Math.floor(Date.now() / 1000) - 900);
    const stale = decodePriceUpdateV2(
      "SOL/USD",
      SOL_USD_FEED,
      PYTH_RECEIVER,
      buildPriceUpdateV2({ level: 1, publishTime: staleSec }),
    );
    assert.ok(stale);
    assert.equal(stale.healthy, false);

    const wideConf = decodePriceUpdateV2(
      "SOL/USD",
      SOL_USD_FEED,
      PYTH_RECEIVER,
      buildPriceUpdateV2({ level: 1, price: 100_00000000n, conf: 3_00000000n }),
    );
    assert.ok(wideConf);
    assert.equal(wideConf.healthy, false);

    const negPrice = decodePriceUpdateV2(
      "SOL/USD",
      SOL_USD_FEED,
      PYTH_RECEIVER,
      buildPriceUpdateV2({ level: 1, price: -100_00000000n, conf: 10000000n }),
    );
    assert.ok(negPrice);
    assert.equal(negPrice.healthy, false);
  });
});
