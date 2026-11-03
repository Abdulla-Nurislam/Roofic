"use client";

import { BN, type IdlAccounts, type ProgramAccount } from "@anchor-lang/core";
import {
  ACCOUNT_SIZE,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeAccount3Instruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, SystemProgram, type TransactionInstruction } from "@solana/web3.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Roofic } from "@/idl/roofic";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  PROGRAM_ID,
  SHARE_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  bpsOf,
  configPda,
  explorerAddress,
  explorerTx,
  formatToken,
  investorPda,
  pendingRent,
  positionPda,
  propertyPda,
  shareMintPda,
  shortKey,
  toRawUnits,
  useProgram,
  useReadonlyProgram,
  vaultPda,
} from "@/lib/program";
import {
  KNOWN_REPORTS_BY_HASH,
  PRESET_CATALOG,
  bytesToHex,
  evaluateProperty,
  type PropertyInput,
  type ScoreReport,
} from "@/lib/scoring";

type PlatformConfig = IdlAccounts<Roofic>["platformConfig"];
type Property = ProgramAccount<IdlAccounts<Roofic>["property"]>;
type Position = IdlAccounts<Roofic>["position"];
type InvestorRecord = IdlAccounts<Roofic>["investor"];
type Toast = { kind: "ok" | "error"; text: string; sig?: string } | null;

export default function CapstonePage() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const program = useProgram();
  const reader = useReadonlyProgram();

  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [paymentDecimals, setPaymentDecimals] = useState<number>(6);
  const [paymentTokenProgram, setPaymentTokenProgram] = useState<PublicKey>(TOKEN_PROGRAM_ID);
  const [usdcBalance, setUsdcBalance] = useState<bigint>(BigInt(0));
  const [myKyc, setMyKyc] = useState<InvestorRecord | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const [customReports, setCustomReports] = useState<
    Record<string, { input: PropertyInput; report: ScoreReport }>
  >({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [showAdmin, setShowAdmin] = useState(false);

  // Scoring Engine & Create Property shared state
  const [scoreInput, setScoreInput] = useState<PropertyInput>(PRESET_CATALOG[0].input);
  const [sharesToCreate, setSharesToCreate] = useState<number>(PRESET_CATALOG[0].totalShares);
  const [priceUsdc, setPriceUsdc] = useState<number>(PRESET_CATALOG[0].pricePerShareUsdc);
  const [managerStr, setManagerStr] = useState<string>("");
  const [pyVerifiedHash, setPyVerifiedHash] = useState<string | null>(null);

  // Sync aria-invalid with CSS :user-invalid state (modern-web-guidance: validate-input-after-interaction)
  useEffect(() => {
    const syncAria = (target: EventTarget | null) => {
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
      if (typeof CSS !== "undefined" && CSS.supports("selector(:user-invalid)")) {
        target.setAttribute("aria-invalid", target.matches(":user-invalid") ? "true" : "false");
      } else {
        const valid = target.checkValidity();
        target.classList.toggle("user-invalid-fallback", !valid);
        target.classList.toggle("user-valid-fallback", valid);
        target.setAttribute("aria-invalid", !valid ? "true" : "false");
      }
    };
    const onBlur = (e: Event) => syncAria(e.target);
    const onInput = (e: Event) => {
      if (e.target instanceof HTMLElement && e.target.hasAttribute("aria-invalid")) {
        syncAria(e.target);
      }
    };
    document.addEventListener("blur", onBlur, true);
    document.addEventListener("input", onInput);
    return () => {
      document.removeEventListener("blur", onBlur, true);
      document.removeEventListener("input", onInput);
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      let cfg: PlatformConfig | null = null;
      try {
        cfg = await reader.account.platformConfig.fetch(configPda());
        setConfig(cfg);
      } catch {
        setConfig(null);
      }

      let tokenProg = TOKEN_PROGRAM_ID;
      let decimals = 6;
      if (cfg) {
        const mintInfoAcct = await connection.getAccountInfo(cfg.paymentMint);
        if (mintInfoAcct) {
          tokenProg = mintInfoAcct.owner.equals(TOKEN_2022_PROGRAM_ID)
            ? TOKEN_2022_PROGRAM_ID
            : TOKEN_PROGRAM_ID;
          setPaymentTokenProgram(tokenProg);
          try {
            const mintData = await getMint(connection, cfg.paymentMint, "confirmed", tokenProg);
            decimals = mintData.decimals;
            setPaymentDecimals(decimals);
          } catch {
            // keep default 6
          }
        }
      }

      const allProps = await reader.account.property.all();
      allProps.sort((a, b) => b.account.id.cmp(a.account.id));
      setProperties(allProps);

      if (publicKey) {
        try {
          const rec = await reader.account.investor.fetch(investorPda(publicKey));
          setMyKyc(rec);
        } catch {
          setMyKyc(null);
        }

        const mine = await reader.account.position.all([
          { memcmp: { offset: 8, bytes: publicKey.toBase58() } },
        ]);
        setPositions(Object.fromEntries(mine.map((p) => [p.account.property.toBase58(), p.account])));

        if (cfg) {
          try {
            const ata = getAssociatedTokenAddressSync(cfg.paymentMint, publicKey, false, tokenProg);
            const tokAcct = await getAccount(connection, ata, "confirmed", tokenProg);
            setUsdcBalance(tokAcct.amount);
          } catch {
            setUsdcBalance(BigInt(0));
          }
        }
      } else {
        setMyKyc(null);
        setPositions({});
        setUsdcBalance(BigInt(0));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [reader, connection, publicKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (publicKey && !managerStr) {
      setManagerStr(publicKey.toBase58());
    }
  }, [publicKey, managerStr]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7500);
    return () => clearTimeout(t);
  }, [toast]);

  // Sync platform fees into scoring input whenever config loads
  const effectiveScoreInput = useMemo<PropertyInput>(
    () => ({
      ...scoreInput,
      platform_rent_fee_bps: config?.rentFeeBps ?? scoreInput.platform_rent_fee_bps,
      platform_sale_fee_bps: config?.saleFeeBps ?? scoreInput.platform_sale_fee_bps,
    }),
    [scoreInput, config],
  );

  const liveReport = useMemo<ScoreReport | null>(() => {
    try {
      return evaluateProperty(effectiveScoreInput);
    } catch {
      return null;
    }
  }, [effectiveScoreInput]);

  const run = async (key: string, label: string, fn: () => Promise<string | undefined>) => {
    setBusy(key);
    try {
      const sig = await fn();
      setToast({ kind: "ok", text: label, sig });
      await refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setToast({ kind: "error", text: msg.split("\n")[0].slice(0, 200) });
    } finally {
      setBusy(null);
    }
  };

  const verifyWithPython = async () => {
    if (!liveReport) return;
    await run("py-score", "Verified with Python scoring/engine.py", async () => {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(effectiveScoreInput),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scoring API failed");
      setPyVerifiedHash(data.valuation_hash_hex);
      setCustomReports((prev) => ({
        ...prev,
        [data.valuation_hash_hex]: { input: effectiveScoreInput, report: liveReport },
      }));
      return undefined;
    });
  };

  const requestFaucetUsdc = () => {
    if (!publicKey) return;
    return run("faucet-usdc", "Начислено 1,000 Demo USDC", async () => {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mint_usdc", wallet: publicKey.toBase58(), amount: 1_000 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Faucet error");
      return data.sig;
    });
  };

  const approveWalletKyc = (targetWallet: PublicKey) => {
    const isAdmin = publicKey && config && publicKey.equals(config.admin);
    return run(`kyc-${targetWallet.toBase58()}`, `KYC одобрен: ${shortKey(targetWallet)}`, async () => {
      if (isAdmin && program) {
        return program.methods
          .approveInvestor()
          .accountsPartial({
            config: configPda(),
            investorRecord: investorPda(targetWallet),
            wallet: targetWallet,
            admin: publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }
      // Devnet demo fallback signed by platform admin keypair
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "kyc_approve", wallet: targetWallet.toBase58() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "KYC approval failed");
      return data.sig;
    });
  };

  const stats = useMemo(() => {
    const raised = properties.reduce(
      (s, p) => s + Number(p.account.sharesSold.mul(p.account.pricePerShare).toString()),
      0,
    );
    const rentDeposited = properties.reduce(
      (s, p) => s + Number(p.account.totalRentDeposited.toString()),
      0,
    );
    const rentClaimed = properties.reduce(
      (s, p) => s + Number(p.account.totalRentClaimed.toString()),
      0,
    );
    return {
      count: properties.length,
      raised,
      rentDeposited,
      rentClaimed,
      myPositions: Object.keys(positions).length,
    };
  }, [properties, positions]);

  const isAdmin = Boolean(publicKey && config && publicKey.equals(config.admin));

  return (
    <main className="container">
      <header className="header">
        <div className="logo">
          <div className="logo-mark">R</div>
          Roofic <span className="badge">Capstone · RWA + Token-2022</span>
          {config?.paused && <span className="badge danger">PAUSED (Claim Active)</span>}
        </div>
        <div className="header-actions">
          {publicKey && (
            <>
              <span className={myKyc ? "badge" : "badge warn"}>
                {myKyc ? "✓ KYC Verified" : "⚠ KYC Required"}
              </span>
              <span className="badge violet">
                Balance: {formatToken(usdcBalance, paymentDecimals)} USDC
              </span>
              {!myKyc && (
                <button
                  type="button"
                  className="btn sm teal"
                  disabled={busy !== null}
                  onClick={() => approveWalletKyc(publicKey)}
                >
                  Пройти KYC (Demo)
                </button>
              )}
              {config && (
                <button
                  type="button"
                  className="btn sm ghost"
                  disabled={busy === "faucet-usdc"}
                  onClick={requestFaucetUsdc}
                >
                  +1,000 Demo USDC
                </button>
              )}
            </>
          )}
          <WalletMultiButton />
        </div>
      </header>

      <section className="hero">
        <h1>
          Токенизация <span className="grad-text">арендной недвижимости</span> с KYC, Token-2022 и оценкой риска
        </h1>
        <p>
          Каждая доля объекта — soulbound-токен <b>Token-2022 (`NonTransferable`)</b>. Расчёты и выплата аренды идут в
          стейблкоине (<b>USDC</b>) через `TokenInterface` + `transfer_checked`, а отчёт доходности и риска фиксируется
          on-chain через <b>SHA-256 `valuation_hash`</b>.
        </p>

        <div className="stats">
          <div className="glass stat">
            <div className="stat-label">Объектов в сети</div>
            <div className="stat-value">{stats.count}</div>
            <div className="stat-sub">Program: {shortKey(PROGRAM_ID)}</div>
          </div>
          <div className="glass stat">
            <div className="stat-label">Привлечено капитала</div>
            <div className="stat-value">${formatToken(stats.raised, paymentDecimals)}</div>
            <div className="stat-sub">Sale fee: {((config?.saleFeeBps ?? 150) / 100).toFixed(2)}%</div>
          </div>
          <div className="glass stat">
            <div className="stat-label">Аренда в Vault (Net)</div>
            <div className="stat-value">${formatToken(stats.rentDeposited, paymentDecimals)}</div>
            <div className="stat-sub">
              Выплачено: ${formatToken(stats.rentClaimed, paymentDecimals)} (Rent fee:{" "}
              {((config?.rentFeeBps ?? 100) / 100).toFixed(2)}%)
            </div>
          </div>
          <div className="glass stat">
            <div className="stat-label">Мои позиции</div>
            <div className="stat-value">{stats.myPositions}</div>
            <div className="stat-sub">{myKyc ? "Доступ к покупкам открыт" : "Требуется KYC allow-list"}</div>
          </div>
        </div>
      </section>

      {config && (
        <section className="glass platform-bar" aria-label="Конфигурация платформы">
          <div className="platform-meta">
            <span>
              Admin:{" "}
              <a href={explorerAddress(config.admin)} target="_blank" rel="noreferrer">
                <strong>{shortKey(config.admin)}</strong>
              </a>
            </span>
            <span>·</span>
            <span>
              Payment Mint (USDC):{" "}
              <a href={explorerAddress(config.paymentMint)} target="_blank" rel="noreferrer">
                <strong>{shortKey(config.paymentMint)}</strong>
              </a>
            </span>
            <span>·</span>
            <span>
              Treasury:{" "}
              <a href={explorerAddress(config.treasury)} target="_blank" rel="noreferrer">
                <strong>{shortKey(config.treasury)}</strong>
              </a>
            </span>
            <span>·</span>
            <span>
              Статус:{" "}
              <strong style={{ color: config.paused ? "var(--danger)" : "var(--teal)" }}>
                {config.paused ? "PAUSED (claim_rent работает)" : "ACTIVE"}
              </strong>
            </span>
          </div>
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => setShowAdmin((v) => !v)}
            aria-expanded={showAdmin}
          >
            {showAdmin ? "Скрыть панель Admin / KYC" : "Управление платформой (Admin / KYC)"}
          </button>
        </section>
      )}

      {showAdmin && config && (
        <AdminPanel
          config={config}
          isAdmin={isAdmin}
          busy={busy}
          onApprove={(w) => approveWalletKyc(w)}
          onRevoke={(w) =>
            run(`revoke-${w.toBase58()}`, `KYC отозван: ${shortKey(w)}`, async () => {
              if (!program || !publicKey) throw new Error("Подключите кошелёк администратора");
              return program.methods
                .revokeInvestor()
                .accountsPartial({
                  config: configPda(),
                  investorRecord: investorPda(w),
                  admin: publicKey,
                })
                .rpc();
            })
          }
          onTogglePause={(nextPaused) =>
            run("pause", nextPaused ? "Платформа поставлена на паузу" : "Пауза снята", async () => {
              if (!program || !publicKey) throw new Error("Подключите кошелёк администратора");
              return program.methods
                .setPaused(nextPaused)
                .accountsPartial({ config: configPda(), admin: publicKey })
                .rpc();
            })
          }
          onUpdateFees={(rentBps, saleBps) =>
            run("fees", `Комиссии обновлены: ${rentBps} / ${saleBps} bps`, async () => {
              if (!program || !publicKey) throw new Error("Подключите кошелёк администратора");
              return program.methods
                .setFees(rentBps, saleBps)
                .accountsPartial({ config: configPda(), admin: publicKey })
                .rpc();
            })
          }
        />
      )}

      {/* Scoring Engine + Create Property Workbench */}
      <section className="workbench" aria-label="Модуль оценки доходности и листинг объекта">
        <div className="glass panel">
          <div className="panel-head">
            <div>
              <h2>1. Модуль оценки доходности и риска (`scoring/engine.py`)</h2>
              <p className="panel-sub">
                Рассчитывает сценарии Bear / Base / Bull, 4 фактора риска и SHA-256 `valuation_hash` для записи в блокчейн
              </p>
            </div>
            <div className="preset-row">
              {PRESET_CATALOG.map((item) => (
                <button
                  key={item.input.property_id}
                  type="button"
                  className="btn sm ghost"
                  onClick={() => {
                    setScoreInput(item.input);
                    setSharesToCreate(item.totalShares);
                    setPriceUsdc(item.pricePerShareUsdc);
                    setPyVerifiedHash(null);
                  }}
                >
                  {item.input.city} #{item.input.property_id}
                </button>
              ))}
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              verifyWithPython();
            }}
          >
            <fieldset className="fieldset-reset">
              <legend className="sr-legend">Параметры финансовой модели объекта</legend>
              <div className="form-grid-2">
                <div className="field">
                  <label htmlFor="score-name">Название объекта</label>
                  <input
                    id="score-name"
                    name="name"
                    className="input"
                    required
                    maxLength={48}
                    value={scoreInput.name}
                    onChange={(e) => setScoreInput({ ...scoreInput, name: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="score-city">Город</label>
                  <input
                    id="score-city"
                    name="city"
                    className="input"
                    required
                    value={scoreInput.city}
                    onChange={(e) => setScoreInput({ ...scoreInput, city: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="score-price">Стоимость объекта (USD)</label>
                  <input
                    id="score-price"
                    name="price_usd"
                    className="input"
                    type="number"
                    required
                    min={1000}
                    step="any"
                    value={scoreInput.price_usd}
                    onChange={(e) => setScoreInput({ ...scoreInput, price_usd: Number(e.target.value) })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="score-yield">Валовая аренда (Gross Yield, %)</label>
                  <input
                    id="score-yield"
                    name="gross_yield"
                    className="input"
                    type="number"
                    required
                    min={1}
                    max={49}
                    step={0.1}
                    value={Number((scoreInput.gross_yield * 100).toFixed(2))}
                    onChange={(e) =>
                      setScoreInput({ ...scoreInput, gross_yield: Number(e.target.value) / 100 })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="score-vacancy">Вакантность (%)</label>
                  <input
                    id="score-vacancy"
                    name="vacancy_rate"
                    className="input"
                    type="number"
                    required
                    min={0}
                    max={90}
                    step={0.5}
                    value={Number((scoreInput.vacancy_rate * 100).toFixed(2))}
                    onChange={(e) =>
                      setScoreInput({ ...scoreInput, vacancy_rate: Number(e.target.value) / 100 })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="score-opex">Операционные расходы (OpEx, %)</label>
                  <input
                    id="score-opex"
                    name="opex_ratio"
                    className="input"
                    type="number"
                    required
                    min={0}
                    max={80}
                    step={0.5}
                    value={Number((scoreInput.opex_ratio * 100).toFixed(2))}
                    onChange={(e) =>
                      setScoreInput({ ...scoreInput, opex_ratio: Number(e.target.value) / 100 })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="score-mgr">Комиссия УК (%)</label>
                  <input
                    id="score-mgr"
                    name="manager_fee_ratio"
                    className="input"
                    type="number"
                    required
                    min={0}
                    max={30}
                    step={0.5}
                    value={Number((scoreInput.manager_fee_ratio * 100).toFixed(2))}
                    onChange={(e) =>
                      setScoreInput({
                        ...scoreInput,
                        manager_fee_ratio: Number(e.target.value) / 100,
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="score-age">Возраст здания (лет)</label>
                  <input
                    id="score-age"
                    name="building_age_years"
                    className="input"
                    type="number"
                    required
                    min={0}
                    max={100}
                    value={scoreInput.building_age_years}
                    onChange={(e) =>
                      setScoreInput({ ...scoreInput, building_age_years: Number(e.target.value) })
                    }
                  />
                </div>
              </div>

              {liveReport && (
                <>
                  <div className="scenario-grid">
                    <div className="scenario-box">
                      <div className="scenario-label">Bear (стресс)</div>
                      <div className="scenario-val">{(liveReport.net_yield_bear * 100).toFixed(2)}%</div>
                    </div>
                    <div className="scenario-box base">
                      <div className="scenario-label">Base (базовый)</div>
                      <div className="scenario-val">{(liveReport.net_yield_base * 100).toFixed(2)}%</div>
                    </div>
                    <div className="scenario-box">
                      <div className="scenario-label">Bull (оптимист.)</div>
                      <div className="scenario-val">{(liveReport.net_yield_bull * 100).toFixed(2)}%</div>
                    </div>
                  </div>

                  <div className="risk-summary">
                    <div>
                      <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Итоговый риск-скор</div>
                      <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                        {liveReport.risk_score} / 100{" "}
                        <span style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 400 }}>
                          (0 — мин. риск, 100 — макс.)
                        </span>
                      </div>
                    </div>
                    <div className={`grade-badge grade-${liveReport.risk_grade}`} title="Грейд риска">
                      {liveReport.risk_grade}
                    </div>
                  </div>

                  <div className="factor-list">
                    <FactorBar label="Вакантность" pts={liveReport.factors.vacancy} />
                    <FactorBar label="Расходы (OpEx + УК)" pts={liveReport.factors.operating_costs} />
                    <FactorBar label="Возраст здания" pts={liveReport.factors.building_age} />
                    <FactorBar label="Стресс-доходность" pts={liveReport.factors.downside_yield} />
                  </div>

                  {liveReport.warnings.length > 0 && (
                    <ul className="warn-list">
                      {liveReport.warnings.map((w) => (
                        <li key={w}>⚠ {w}</li>
                      ))}
                    </ul>
                  )}

                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "6px",
                        fontSize: "0.78rem",
                        color: "var(--muted)",
                      }}
                    >
                      <span>On-chain SHA-256 `valuation_hash` ([u8; 32]):</span>
                      {pyVerifiedHash === liveReport.valuation_hash_hex && (
                        <span style={{ color: "var(--teal)", fontWeight: 600 }}>
                          ✓ Совпадает с Python `engine.py`
                        </span>
                      )}
                    </div>
                    <div className="hash-box">0x{liveReport.valuation_hash_hex}</div>
                  </div>
                </>
              )}

              <div className="row">
                <button type="submit" className="btn ghost" disabled={busy === "py-score"}>
                  {busy === "py-score" ? "Проверка…" : "Сверить с Python `scoring/engine.py`"}
                </button>
              </div>
            </fieldset>
          </form>
        </div>

        {/* Create Property Panel */}
        <div className="glass panel">
          <div className="panel-head">
            <div>
              <h2>2. Листинг объекта On-Chain (`create_property`)</h2>
              <p className="panel-sub">
                Создаёт `Property` PDA, `vault` (USDC) и выпускает Token-2022 `share_mint` с расширением{" "}
                <code>NonTransferable</code>
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!program || !publicKey || !config || !liveReport) return;
              const id = new BN(Date.now());
              const propPda = propertyPda(publicKey, id);
              const mgrKey = new PublicKey(managerStr.trim() || publicKey.toBase58());
              const rawPrice = toRawUnits(priceUsdc, paymentDecimals);

              setCustomReports((prev) => ({
                ...prev,
                [liveReport.valuation_hash_hex]: { input: effectiveScoreInput, report: liveReport },
              }));

              run("create-prop", `Объект «${effectiveScoreInput.name}» создан on-chain`, () =>
                program.methods
                  .createProperty(
                    id,
                    effectiveScoreInput.name,
                    new BN(sharesToCreate),
                    rawPrice,
                    mgrKey,
                    liveReport.valuation_hash_bytes,
                  )
                  .accountsPartial({
                    config: configPda(),
                    property: propPda,
                    shareMint: shareMintPda(propPda),
                    vault: vaultPda(propPda),
                    paymentMint: config.paymentMint,
                    owner: publicKey,
                    shareTokenProgram: SHARE_TOKEN_PROGRAM_ID,
                    paymentTokenProgram,
                    systemProgram: SystemProgram.programId,
                  })
                  .rpc(),
              );
            }}
          >
            <fieldset className="fieldset-reset">
              <legend className="sr-legend">Параметры выпуска долей Token-2022</legend>

              <div className="field">
                <label htmlFor="create-prop-name">Название в смарт-контракте</label>
                <input
                  id="create-prop-name"
                  name="property_name"
                  className="input"
                  required
                  minLength={1}
                  maxLength={48}
                  aria-describedby="create-name-hint"
                  value={scoreInput.name}
                  onChange={(e) => setScoreInput({ ...scoreInput, name: e.target.value })}
                />
                <span id="create-name-hint" className="rules-list">
                  От 1 до 48 байт UTF-8 (хранится в `Property.name`).
                </span>
              </div>

              <div className="form-grid-2">
                <div className="field">
                  <label htmlFor="create-shares">Всего долей (`total_shares`)</label>
                  <input
                    id="create-shares"
                    name="total_shares"
                    className="input"
                    type="number"
                    required
                    min={1}
                    max={1000000}
                    value={sharesToCreate}
                    onChange={(e) => setSharesToCreate(Number(e.target.value))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="create-price-usdc">Цена 1 доли (USDC)</label>
                  <input
                    id="create-price-usdc"
                    name="price_per_share"
                    className="input"
                    type="number"
                    required
                    min={0.01}
                    step="any"
                    value={priceUsdc}
                    onChange={(e) => setPriceUsdc(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="create-manager">Кошелёк управляющей компании (`manager`)</label>
                <input
                  id="create-manager"
                  name="manager"
                  className="input"
                  required
                  pattern="[1-9A-HJ-NP-Za-km-z]{32,44}"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-describedby="create-manager-hint"
                  value={managerStr}
                  onChange={(e) => setManagerStr(e.target.value)}
                />
                <span id="create-manager-hint" className="rules-list">
                  Base58-адрес Solana (32–44 символа). Только `manager` имеет право вызывать `deposit_rent`.
                </span>
              </div>

              <div className="kv">
                <div>
                  <span>Общая оценка (on-chain)</span>
                  <strong>${(sharesToCreate * priceUsdc).toLocaleString("en-US")} USDC</strong>
                  <small>1 токен = 1 доля (0 decimals)</small>
                </div>
                <div>
                  <span>Риск-грейд / Base Yield</span>
                  <strong>
                    Грейд {liveReport?.risk_grade ?? "—"} ·{" "}
                    {liveReport ? `${(liveReport.net_yield_base * 100).toFixed(2)}%` : "—"}
                  </strong>
                  <small>Hash: 0x{liveReport?.valuation_hash_hex.slice(0, 10)}…</small>
                </div>
              </div>

              <button
                type="submit"
                className="btn"
                disabled={busy === "create-prop" || !publicKey || !config || config.paused}
              >
                {!publicKey
                  ? "Подключите кошелёк для листинга"
                  : busy === "create-prop"
                    ? "Создание объекта в Solana…"
                    : "Создать объект в Devnet"}
              </button>
            </fieldset>
          </form>
        </div>
      </section>

      <div className="section-title">
        <h2>Токенизированные объекты недвижимости ({properties.length})</h2>
        <button type="button" className="btn ghost sm" onClick={refresh}>
          Обновить данные из Devnet
        </button>
      </div>

      {loading ? (
        <div className="glass empty">Загрузка состояния программы `roofic` из Solana Devnet…</div>
      ) : properties.length === 0 ? (
        <div className="glass empty">
          В сети пока нет объектов. Запустите <code>npm run seed</code> или создайте объект через форму выше.
        </div>
      ) : (
        <div className="grid">
          {properties.map((p) => {
            const hashHex = bytesToHex(p.account.valuationHash);
            const matched = KNOWN_REPORTS_BY_HASH[hashHex] ?? customReports[hashHex];
            return (
              <PropertyCard
                key={p.publicKey.toBase58()}
                p={p}
                config={config}
                paymentDecimals={paymentDecimals}
                position={positions[p.publicKey.toBase58()]}
                me={publicKey}
                myKyc={Boolean(myKyc)}
                matchedReport={matched?.report}
                matchedCity={matched?.input.city}
                busy={busy}
                onBuy={(shares) =>
                  run(`buy-${p.publicKey.toBase58()}`, `Куплено долей: ${shares}`, async () => {
                    if (!program || !publicKey || !config) throw new Error("Подключите кошелёк");
                    const investorPayment = getAssociatedTokenAddressSync(
                      config.paymentMint,
                      publicKey,
                      false,
                      paymentTokenProgram,
                    );
                    const investorShares = getAssociatedTokenAddressSync(
                      p.account.shareMint,
                      publicKey,
                      false,
                      SHARE_TOKEN_PROGRAM_ID,
                    );
                    const preIxs: TransactionInstruction[] = [
                      createAssociatedTokenAccountIdempotentInstruction(
                        publicKey,
                        investorPayment,
                        publicKey,
                        config.paymentMint,
                        paymentTokenProgram,
                      ),
                    ];

                    let ownerPayment: PublicKey;
                    if (publicKey.equals(p.account.owner)) {
                      // Avoid Anchor 2040 ConstraintDuplicateMutableAccount when owner buys in own listing
                      const seed = `proceeds-${config.paymentMint.toBase58().slice(0, 8)}`;
                      ownerPayment = await PublicKey.createWithSeed(
                        publicKey,
                        seed,
                        paymentTokenProgram,
                      );
                      if (!(await connection.getAccountInfo(ownerPayment))) {
                        const lamports =
                          await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);
                        preIxs.push(
                          SystemProgram.createAccountWithSeed({
                            fromPubkey: publicKey,
                            basePubkey: publicKey,
                            seed,
                            newAccountPubkey: ownerPayment,
                            lamports,
                            space: ACCOUNT_SIZE,
                            programId: paymentTokenProgram,
                          }),
                          createInitializeAccount3Instruction(
                            ownerPayment,
                            config.paymentMint,
                            publicKey,
                            paymentTokenProgram,
                          ),
                        );
                      }
                    } else {
                      ownerPayment = getAssociatedTokenAddressSync(
                        config.paymentMint,
                        p.account.owner,
                        false,
                        paymentTokenProgram,
                      );
                      preIxs.push(
                        createAssociatedTokenAccountIdempotentInstruction(
                          publicKey,
                          ownerPayment,
                          p.account.owner,
                          config.paymentMint,
                          paymentTokenProgram,
                        ),
                      );
                    }

                    return program.methods
                      .buyShares(new BN(shares))
                      .preInstructions(preIxs)
                      .accountsPartial({
                        config: configPda(),
                        investorRecord: investorPda(publicKey),
                        property: p.publicKey,
                        shareMint: p.account.shareMint,
                        position: positionPda(p.publicKey, publicKey),
                        investorShares,
                        paymentMint: config.paymentMint,
                        investorPayment,
                        ownerPayment,
                        treasury: config.treasury,
                        investor: publicKey,
                        shareTokenProgram: SHARE_TOKEN_PROGRAM_ID,
                        paymentTokenProgram,
                        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                        systemProgram: SystemProgram.programId,
                      })
                      .rpc();
                  })
                }
                onDeposit={(usdcAmount) =>
                  run(`dep-${p.publicKey.toBase58()}`, `Внесено аренды: ${usdcAmount} USDC`, async () => {
                    if (!program || !publicKey || !config) throw new Error("Подключите кошелёк");
                    const managerPayment = getAssociatedTokenAddressSync(
                      config.paymentMint,
                      publicKey,
                      false,
                      paymentTokenProgram,
                    );
                    return program.methods
                      .depositRent(toRawUnits(usdcAmount, paymentDecimals))
                      .accountsPartial({
                        config: configPda(),
                        property: p.publicKey,
                        shareMint: p.account.shareMint,
                        vault: p.account.vault,
                        paymentMint: config.paymentMint,
                        managerPayment,
                        treasury: config.treasury,
                        manager: publicKey,
                        shareTokenProgram: SHARE_TOKEN_PROGRAM_ID,
                        paymentTokenProgram,
                      })
                      .rpc();
                  })
                }
                onClaim={() =>
                  run(`claim-${p.publicKey.toBase58()}`, "Арендный доход выплачен в USDC", async () => {
                    if (!program || !publicKey || !config) throw new Error("Подключите кошелёк");
                    const investorPayment = getAssociatedTokenAddressSync(
                      config.paymentMint,
                      publicKey,
                      false,
                      paymentTokenProgram,
                    );
                    return program.methods
                      .claimRent()
                      .preInstructions([
                        createAssociatedTokenAccountIdempotentInstruction(
                          publicKey,
                          investorPayment,
                          publicKey,
                          config.paymentMint,
                          paymentTokenProgram,
                        ),
                      ])
                      .accountsPartial({
                        config: configPda(),
                        property: p.publicKey,
                        position: positionPda(p.publicKey, publicKey),
                        vault: p.account.vault,
                        paymentMint: config.paymentMint,
                        investorPayment,
                        investor: publicKey,
                        paymentTokenProgram,
                      })
                      .rpc();
                  })
                }
              />
            );
          })}
        </div>
      )}

      <footer className="footer">
        Roofic Capstone · Program ID{" "}
        <a href={explorerAddress(PROGRAM_ID)} target="_blank" rel="noreferrer">
          {PROGRAM_ID.toBase58()}
        </a>{" "}
        · Token-2022 `NonTransferable` + Stablecoin Vault + SHA-256 Risk Scoring
      </footer>

      {toast && (
        <div className={`glass toast ${toast.kind}`} role="status" aria-live="polite">
          {toast.kind === "ok" ? "✅ " : "❌ "}
          {toast.text}
          {toast.sig && (
            <>
              {" · "}
              <a href={explorerTx(toast.sig)} target="_blank" rel="noreferrer">
                Explorer ↗
              </a>
            </>
          )}
        </div>
      )}
    </main>
  );
}

function FactorBar({ label, pts }: { label: string; pts: number }) {
  const pct = Math.min(100, (pts / 25) * 100);
  return (
    <div className="factor-item">
      <div className="factor-top">
        <span>{label}</span>
        <b>{pts} / 25</b>
      </div>
      <div className="progress">
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AdminPanel({
  config,
  isAdmin,
  busy,
  onApprove,
  onRevoke,
  onTogglePause,
  onUpdateFees,
}: {
  config: PlatformConfig;
  isAdmin: boolean;
  busy: string | null;
  onApprove: (wallet: PublicKey) => void;
  onRevoke: (wallet: PublicKey) => void;
  onTogglePause: (paused: boolean) => void;
  onUpdateFees: (rentFeeBps: number, saleFeeBps: number) => void;
}) {
  const [kycWallet, setKycWallet] = useState("");
  const [rentFee, setRentFee] = useState(config.rentFeeBps);
  const [saleFee, setSaleFee] = useState(config.saleFeeBps);

  return (
    <section className="glass panel" style={{ marginBottom: "28px" }} aria-label="Управление платформой">
      <div className="panel-head">
        <div>
          <h2>Панель управления платформой (`PlatformConfig` & KYC Registry)</h2>
          <p className="panel-sub">
            {isAdmin
              ? "Вы подключены как администратор платформы (`config.admin`)."
              : "Для `approve_investor` на Devnet доступен демо-ключ; `revoke_investor`, `set_paused` и `set_fees` требуют подписи `config.admin`."}
          </p>
        </div>
        <button
          type="button"
          className={`btn sm ${config.paused ? "teal" : "ghost"}`}
          disabled={busy === "pause" || !isAdmin}
          onClick={() => onTogglePause(!config.paused)}
        >
          {config.paused ? "Снять паузу (`set_paused(false)`)" : "Аварийная пауза (`set_paused(true)`)"}
        </button>
      </div>

      <div className="workbench" style={{ marginBottom: 0 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onApprove(new PublicKey(kycWallet.trim()));
          }}
        >
          <fieldset className="fieldset-reset">
            <legend className="sr-legend">Реестр верифицированных инвесторов (KYC Allow-List)</legend>
            <div className="field">
              <label htmlFor="admin-kyc-wallet">Кошелёк инвестора для `approve_investor` / `revoke_investor`</label>
              <input
                id="admin-kyc-wallet"
                name="kyc_wallet"
                className="input"
                required
                pattern="[1-9A-HJ-NP-Za-km-z]{32,44}"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Введите Base58 адрес кошелька…"
                aria-describedby="admin-kyc-hint"
                value={kycWallet}
                onChange={(e) => setKycWallet(e.target.value)}
              />
              <span id="admin-kyc-hint" className="rules-list">
                Создаёт или закрывает PDA `["investor", wallet]` (при отзыве возвращает rent админу).
              </span>
            </div>
            <div className="row">
              <button type="submit" className="btn teal sm" disabled={busy !== null}>
                Одобрить KYC (`approve_investor`)
              </button>
              <button
                type="button"
                className="btn ghost sm"
                disabled={busy !== null || !isAdmin || !kycWallet.trim()}
                onClick={() => onRevoke(new PublicKey(kycWallet.trim()))}
              >
                Отозвать KYC (`revoke_investor`)
              </button>
            </div>
          </fieldset>
        </form>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onUpdateFees(rentFee, saleFee);
          }}
        >
          <fieldset className="fieldset-reset">
            <legend className="sr-legend">Настройка комиссий платформы (`set_fees`, макс. 2000 bps = 20%)</legend>
            <div className="form-grid-2">
              <div className="field">
                <label htmlFor="admin-rent-fee">Комиссия с аренды (`rent_fee_bps`)</label>
                <input
                  id="admin-rent-fee"
                  name="rent_fee_bps"
                  className="input"
                  type="number"
                  required
                  min={0}
                  max={2000}
                  value={rentFee}
                  onChange={(e) => setRentFee(Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label htmlFor="admin-sale-fee">Комиссия с продажи долей (`sale_fee_bps`)</label>
                <input
                  id="admin-sale-fee"
                  name="sale_fee_bps"
                  className="input"
                  type="number"
                  required
                  min={0}
                  max={2000}
                  value={saleFee}
                  onChange={(e) => setSaleFee(Number(e.target.value))}
                />
              </div>
            </div>
            <button type="submit" className="btn ghost sm" disabled={busy === "fees" || !isAdmin}>
              Обновить комиссии (`set_fees`)
            </button>
          </fieldset>
        </form>
      </div>
    </section>
  );
}

function PropertyCard({
  p,
  config,
  paymentDecimals,
  position,
  me,
  myKyc,
  matchedReport,
  matchedCity,
  busy,
  onBuy,
  onDeposit,
  onClaim,
}: {
  p: Property;
  config: PlatformConfig | null;
  paymentDecimals: number;
  position?: Position;
  me: PublicKey | null;
  myKyc: boolean;
  matchedReport?: ScoreReport;
  matchedCity?: string;
  busy: string | null;
  onBuy: (shares: number) => void;
  onDeposit: (usdc: number) => void;
  onClaim: () => void;
}) {
  const [shares, setShares] = useState(5);
  const [rentUsdc, setRentUsdc] = useState(50);

  const a = p.account;
  const key = p.publicKey.toBase58();
  const isOwner = me?.equals(a.owner) ?? false;
  const isManager = me?.equals(a.manager) ?? false;
  const sold = Number(a.sharesSold.toString());
  const total = Number(a.totalShares.toString());
  const pct = total ? (sold / total) * 100 : 0;
  const hashHex = bytesToHex(a.valuationHash);

  const claimable = position
    ? pendingRent(position.shares, a.accRentPerShare, position.rewardDebt, position.unclaimed)
    : null;

  const grossBuyCost = a.pricePerShare.mul(new BN(Math.max(0, shares)));
  const saleFee = config ? bpsOf(grossBuyCost, config.saleFeeBps) : new BN(0);
  const ownerProceeds = grossBuyCost.sub(saleFee);

  return (
    <article className="glass card">
      <div className="card-head">
        <div>
          <h3>{a.name}</h3>
          <div className="card-meta">
            {matchedCity && <span>📍 {matchedCity}</span>}
            <span>
              Share Mint (Token-2022):{" "}
              <a href={explorerAddress(a.shareMint)} target="_blank" rel="noreferrer">
                {shortKey(a.shareMint)}
              </a>
            </span>
            <span>· NonTransferable</span>
          </div>
        </div>
        {isOwner ? (
          <span className="pill mine">Владелец</span>
        ) : isManager ? (
          <span className="pill mine">Управляющий</span>
        ) : (
          <span className="pill">${formatToken(a.pricePerShare, paymentDecimals)} / доля</span>
        )}
      </div>

      {/* Valuation & Risk Strip */}
      <div className="valuation-strip">
        <div className="valuation-top">
          <span title={`0x${hashHex}`}>
            🔒 SHA-256: <code>0x{hashHex.slice(0, 10)}…{hashHex.slice(-6)}</code>
          </span>
          {matchedReport ? (
            <span className="badge">
              ✓ Риск {matchedReport.risk_grade} ({matchedReport.risk_score}/100)
            </span>
          ) : (
            <span className="badge violet">On-Chain Hash Committed</span>
          )}
        </div>
        {matchedReport && (
          <div className="valuation-yields">
            <span>Bear: {(matchedReport.net_yield_bear * 100).toFixed(2)}%</span>
            <span>
              Base: <b>{(matchedReport.net_yield_base * 100).toFixed(2)}% годовых</b>
            </span>
            <span>Bull: {(matchedReport.net_yield_bull * 100).toFixed(2)}%</span>
          </div>
        )}
      </div>

      <div>
        <div className="progress">
          <div style={{ width: `${pct}%` }} />
        </div>
        <div className="progress-label">
          <span>
            Продано {sold.toLocaleString()} / {total.toLocaleString()} долей
          </span>
          <span>{pct.toFixed(1)}%</span>
        </div>
      </div>

      <div className="kv">
        <div>
          <span>Цена доли</span>
          <strong>${formatToken(a.pricePerShare, paymentDecimals)} USDC</strong>
          <small>Owner: {shortKey(a.owner)}</small>
        </div>
        <div>
          <span>Аренда в Vault (Net)</span>
          <strong>${formatToken(a.totalRentDeposited, paymentDecimals)} USDC</strong>
          <small>Выплачено: ${formatToken(a.totalRentClaimed, paymentDecimals)} USDC</small>
        </div>
      </div>

      {position && claimable && (
        <div className="position">
          <div>
            <div>
              Ваши доли: <b>{position.shares.toString()}</b> · Доступно к выводу:{" "}
              <b>${formatToken(claimable, paymentDecimals)} USDC</b>
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
              Всего получено ранее: ${formatToken(position.totalClaimed, paymentDecimals)} USDC
            </div>
          </div>
          <button
            type="button"
            id={`claim-${key}`}
            className="btn teal sm"
            disabled={claimable.isZero() || busy === `claim-${key}`}
            onClick={onClaim}
          >
            {busy === `claim-${key}` ? "Вывод…" : "Claim USDC"}
          </button>
        </div>
      )}

      {me && sold < total && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onBuy(shares);
          }}
        >
          <div className="field">
            <label htmlFor={`buy-amount-${key}`}>
              Купить доли (инвестору: {shares} долей · владельцу: $
              {formatToken(ownerProceeds, paymentDecimals)} · комиссия: $
              {formatToken(saleFee, paymentDecimals)})
            </label>
            <div className="row">
              <input
                id={`buy-amount-${key}`}
                name="shares"
                className="input"
                type="number"
                required
                min={1}
                max={total - sold}
                value={shares}
                onChange={(e) => setShares(Number(e.target.value))}
              />
              <button
                type="submit"
                id={`buy-${key}`}
                className="btn"
                disabled={busy === `buy-${key}` || !myKyc || Boolean(config?.paused)}
              >
                {!myKyc
                  ? "Нужен KYC"
                  : busy === `buy-${key}`
                    ? "Покупка…"
                    : `Купить за $${formatToken(grossBuyCost, paymentDecimals)}`}
              </button>
            </div>
          </div>
        </form>
      )}

      {isManager && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onDeposit(rentUsdc);
          }}
        >
          <div className="field">
            <label htmlFor={`rent-amount-${key}`}>
              Внести аренду как `manager` (USDC, удержится{" "}
              {((config?.rentFeeBps ?? 100) / 100).toFixed(2)}% в казну)
            </label>
            <div className="row">
              <input
                id={`rent-amount-${key}`}
                name="rent_usdc"
                className="input"
                type="number"
                required
                min={0.01}
                step="any"
                value={rentUsdc}
                onChange={(e) => setRentUsdc(Number(e.target.value))}
              />
              <button
                type="submit"
                id={`deposit-${key}`}
                className="btn ghost"
                disabled={busy === `dep-${key}` || sold === 0 || Boolean(config?.paused)}
              >
                {busy === `dep-${key}` ? "Внесение…" : "Внести аренду"}
              </button>
            </div>
          </div>
        </form>
      )}
    </article>
  );
}
