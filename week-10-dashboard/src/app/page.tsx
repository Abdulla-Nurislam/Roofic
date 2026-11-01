"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { useEffect, useMemo, useState } from "react";
import { Bars, Sparkline } from "@/components/charts";
import { useAsync } from "@/lib/hooks";
import {
  DEFAULT_WATCHED,
  NETWORKS,
  fetchCluster,
  fetchProgramActivity,
  fetchSolBalance,
  fetchTokens,
  fetchTransactions,
  programLabel,
  short,
  type NetworkId,
} from "@/lib/rpc";
import { useNetwork } from "./providers";

const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { maximumFractionDigits: d });
const ago = (t: number | null) => {
  if (t == null) return "—";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - t));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
const parseKey = (s: string): PublicKey | null => {
  try {
    return s ? new PublicKey(s.trim()) : null;
  } catch {
    return null;
  }
};

function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-box">
      {message}{" "}
      {onRetry && (
        <button className="btn ghost" style={{ padding: "4px 10px", marginLeft: 8 }} onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cluster health
// ---------------------------------------------------------------------------
function ClusterSection({ network }: { network: NetworkId }) {
  const { connection } = useConnection();
  const { data, error, loading, reload } = useAsync(() => fetchCluster(connection), `cluster:${network}`, 15_000);

  return (
    <section>
      <div className="section-title">
        <h2>
          <span className="live" />
          Cluster
        </h2>
        <span className="muted small">refreshes every 15s</span>
      </div>
      {error && !data ? (
        <ErrorBox message={`Cannot reach ${NETWORKS[network].label} RPC: ${error}`} onRetry={reload} />
      ) : loading || !data ? (
        <div className="glass panel">
          <Skeleton rows={4} />
        </div>
      ) : (
        <div className="stats" style={{ margin: 0 }}>
          <div className="glass stat">
            <div className="stat-label">Slot</div>
            <div className="stat-value">{data.slot.toLocaleString("en-US")}</div>
            <div className="muted small">height {data.blockHeight.toLocaleString("en-US")}</div>
          </div>
          <div className="glass stat">
            <div className="stat-label">Epoch {data.epoch}</div>
            <div className="stat-value">{fmt(data.epochProgress * 100, 1)}%</div>
            <div className="progress thin">
              <div style={{ width: `${data.epochProgress * 100}%` }} />
            </div>
          </div>
          <div className="glass stat" style={{ gridColumn: "span 2" }}>
            <div className="stat-label">{data.tpsNonVote ? "Non-vote TPS" : "TPS (incl. votes)"}</div>
            <div className="stat-value">{fmt(data.tps, 0)}</div>
            <Sparkline values={data.tpsSeries} />
          </div>
          <div className="glass stat">
            <div className="stat-label">Version</div>
            <div className="stat-value">{data.version}</div>
            <div className="muted small">{NETWORKS[network].label}</div>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Portfolio + history for any address
// ---------------------------------------------------------------------------
function PortfolioSection({ network }: { network: NetworkId }) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [input, setInput] = useState("");

  // Follow the connected wallet until the user types their own address
  useEffect(() => {
    if (publicKey) setInput(publicKey.toBase58());
  }, [publicKey]);

  const owner = useMemo(() => parseKey(input), [input]);
  const key = owner ? `${network}:${owner.toBase58()}` : null;

  const balance = useAsync(() => fetchSolBalance(connection, owner!), key && `bal:${key}`, 30_000);
  const tokens = useAsync(() => fetchTokens(connection, owner!), key && `tok:${key}`, 30_000);
  const txs = useAsync(() => fetchTransactions(connection, owner!, 12), key && `tx:${key}`, 30_000);

  const explorer = (path: string) => `https://explorer.solana.com/${path}${NETWORKS[network].explorer}`;

  return (
    <section>
      <div className="section-title">
        <h2>Portfolio</h2>
      </div>
      <div className="glass panel" style={{ marginBottom: 20 }}>
        <label className="field">
          Wallet address (connect a wallet or paste any address)
          <div className="row">
            <input
              className="input mono"
              placeholder="e.g. 4qSqEcJ7KhcFsLnURE6dHuQ8KSRkkEX56oFYiRk8zKKf"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
            />
            {input && (
              <button className="btn ghost" onClick={() => setInput("")}>
                Clear
              </button>
            )}
          </div>
        </label>
        {input && !owner && (
          <div className="error-box" style={{ marginTop: 12 }}>
            That is not a valid Solana address.
          </div>
        )}
      </div>

      {!owner ? (
        <div className="glass empty">Connect a wallet or paste an address to see balances, tokens and history.</div>
      ) : (
        <>
          <div className="stats" style={{ margin: "0 0 20px" }}>
            <div className="glass stat">
              <div className="stat-label">SOL balance</div>
              <div className="stat-value">
                {balance.data !== null ? fmt(balance.data, 4) : balance.error ? "—" : <div className="skeleton" style={{ marginTop: 14 }} />}
              </div>
              {balance.error && <div className="neg small">{balance.error}</div>}
            </div>
            <div className="glass stat">
              <div className="stat-label">Token accounts</div>
              <div className="stat-value">{tokens.data ? tokens.data.length : "…"}</div>
            </div>
            <div className="glass stat">
              <div className="stat-label">Recent tx success</div>
              <div className="stat-value">
                {txs.data && txs.data.length
                  ? `${Math.round((txs.data.filter((t) => t.ok).length / txs.data.length) * 100)}%`
                  : "—"}
              </div>
              <div className="muted small">last {txs.data?.length ?? 0} transactions</div>
            </div>
          </div>

          <div className="cols-2">
            <div className="glass panel">
              <div className="panel-head">
                <h3>Tokens</h3>
                <span className="muted small">SPL Token + Token-2022</span>
              </div>
              {tokens.error && !tokens.data ? (
                <ErrorBox message={tokens.error} onRetry={tokens.reload} />
              ) : !tokens.data ? (
                <Skeleton rows={4} />
              ) : tokens.data.length === 0 ? (
                <div className="muted">No token accounts on {NETWORKS[network].label}.</div>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Token</th>
                        <th className="num">Amount</th>
                        <th>Program</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tokens.data.map((t) => (
                        <tr key={t.account}>
                          <td>
                            <a href={explorer(`address/${t.mint}`)} target="_blank" rel="noreferrer">
                              <b>{t.symbol}</b>
                            </a>
                            <div className="muted small">{t.name}</div>
                            {t.extensions.map((e) => (
                              <span key={e} className="tag">
                                {e}
                              </span>
                            ))}
                          </td>
                          <td className="num">{fmt(t.amount, Math.min(t.decimals, 6))}</td>
                          <td className="muted small">{t.program}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="glass panel">
              <div className="panel-head">
                <h3>Transactions</h3>
                <button className="btn ghost" style={{ padding: "6px 12px" }} onClick={txs.reload}>
                  Refresh
                </button>
              </div>
              {txs.error && !txs.data ? (
                <ErrorBox message={txs.error} onRetry={txs.reload} />
              ) : !txs.data ? (
                <Skeleton rows={5} />
              ) : txs.data.length === 0 ? (
                <div className="muted">No transactions yet.</div>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Signature</th>
                        <th>Action</th>
                        <th className="num">Δ SOL</th>
                        <th className="num">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txs.data.map((t) => (
                        <tr key={t.signature}>
                          <td>
                            <a className="mono" href={explorer(`tx/${t.signature}`)} target="_blank" rel="noreferrer">
                              {short(t.signature, 5)}
                            </a>{" "}
                            <span className={`tag ${t.ok ? "ok" : "fail"}`} title={t.error}>
                              {t.ok ? "ok" : "failed"}
                            </span>
                          </td>
                          <td>
                            <div className="small">{t.summary}</div>
                            <div className="muted small">{t.programs.map(programLabel).join(" · ")}</div>
                          </td>
                          <td className={`num ${t.solChange > 0 ? "pos" : t.solChange < 0 ? "neg" : ""}`}>
                            {t.solChange > 0 ? "+" : ""}
                            {fmt(t.solChange, 5)}
                          </td>
                          <td className="num muted small">{ago(t.time)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Program activity
// ---------------------------------------------------------------------------
function ProgramCard({ programId, network, onRemove }: { programId: string; network: NetworkId; onRemove: () => void }) {
  const { connection } = useConnection();
  const { data, error, loading, reload } = useAsync(
    () => fetchProgramActivity(connection, programId, 100, 24),
    `prog:${network}:${programId}`,
    60_000,
  );

  return (
    <div className="glass card">
      <div className="card-head">
        <div>
          <h3>{programLabel(programId)}</h3>
          <div className="loc mono">{short(programId, 6)}</div>
        </div>
        <button className="btn ghost" style={{ padding: "4px 10px" }} onClick={onRemove} aria-label="Remove program">
          ✕
        </button>
      </div>
      {error && !data ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : loading || !data ? (
        <Skeleton rows={3} />
      ) : data.total === 0 ? (
        <div className="muted">No transactions on {NETWORKS[network].label}.</div>
      ) : (
        <>
          <div className="kv">
            <div>
              <span>Last {data.total} tx</span>
              <strong>{ago(data.lastTime)}</strong>
            </div>
            <div>
              <span>Failure rate</span>
              <strong className={data.failed ? "neg" : "pos"}>{fmt((data.failed / data.total) * 100, 1)}%</strong>
            </div>
          </div>
          <Bars values={data.buckets} />
          <div className="muted small">activity over the sampled window (old → new)</div>
          <div>
            {data.recent.map((r) => (
              <a
                key={r.signature}
                className={`tag ${r.ok ? "ok" : "fail"} mono`}
                href={`https://explorer.solana.com/tx/${r.signature}${NETWORKS[network].explorer}`}
                target="_blank"
                rel="noreferrer"
              >
                {short(r.signature, 4)}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ProgramsSection({ network }: { network: NetworkId }) {
  const [programs, setPrograms] = useState<string[]>(DEFAULT_WATCHED[network]);
  const [input, setInput] = useState("");

  useEffect(() => setPrograms(DEFAULT_WATCHED[network]), [network]);

  const add = () => {
    const k = parseKey(input);
    if (!k) return;
    const id = k.toBase58();
    setPrograms((p) => (p.includes(id) ? p : [...p, id]));
    setInput("");
  };
  const invalid = input !== "" && !parseKey(input);

  return (
    <section>
      <div className="section-title">
        <h2>Program activity</h2>
        <span className="muted small">sampled from the 100 latest signatures</span>
      </div>
      <div className="glass panel" style={{ marginBottom: 20 }}>
        <div className="row">
          <input
            className="input mono"
            placeholder="Add a program or account address to watch"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            spellCheck={false}
          />
          <button className="btn" onClick={add} disabled={!input || invalid}>
            Watch
          </button>
        </div>
        {invalid && (
          <div className="error-box" style={{ marginTop: 12 }}>
            That is not a valid Solana address.
          </div>
        )}
      </div>
      {programs.length === 0 ? (
        <div className="glass empty">Nothing watched yet.</div>
      ) : (
        <div className="grid">
          {programs.map((id) => (
            <ProgramCard key={`${network}:${id}`} programId={id} network={network} onRemove={() => setPrograms((p) => p.filter((x) => x !== id))} />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
export default function Dashboard() {
  const { network, setNetwork } = useNetwork();

  return (
    <div className="container">
      <header className="header">
        <div className="logo">
          <div className="logo-mark">R</div>
          Roofic <span className="badge">Dashboard</span>
        </div>
        <div className="header-actions">
          <select className="input" value={network} onChange={(e) => setNetwork(e.target.value as NetworkId)} aria-label="Network">
            {(Object.keys(NETWORKS) as NetworkId[]).map((n) => (
              <option key={n} value={n}>
                {NETWORKS[n].label}
              </option>
            ))}
          </select>
          <WalletMultiButton />
        </div>
      </header>

      <div className="hero" style={{ paddingBottom: 12 }}>
        <h1>
          Solana, <span className="grad-text">straight from RPC</span>
        </h1>
        <p>Cluster health, wallet portfolio, transaction history and program activity — no indexer, no backend, only JSON-RPC.</p>
      </div>

      <ClusterSection network={network} />
      <PortfolioSection network={network} />
      <ProgramsSection network={network} />

      <footer className="footer">Roofic · Week 10 · RPC, API &amp; blockchain data · {NETWORKS[network].url}</footer>
    </div>
  );
}
