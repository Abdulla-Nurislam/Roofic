"use client";

import { BN, type ProgramAccount, type IdlAccounts } from "@anchor-lang/core";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RooficMvp } from "@/idl/roofic_mvp";
import {
  explorerTx,
  pendingRent,
  positionPda,
  propertyPda,
  sol,
  useProgram,
  useReadonlyProgram,
} from "@/lib/program";

type Property = ProgramAccount<IdlAccounts<RooficMvp>["property"]>;
type Position = IdlAccounts<RooficMvp>["position"];
type Toast = { kind: "ok" | "error"; text: string; sig?: string } | null;

export default function Home() {
  const { publicKey } = useWallet();
  const program = useProgram();
  const reader = useReadonlyProgram();

  const [properties, setProperties] = useState<Property[]>([]);
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  const refresh = useCallback(async () => {
    try {
      const all = await reader.account.property.all();
      all.sort((a, b) => b.account.sharesSold.cmp(a.account.sharesSold));
      setProperties(all);
      if (publicKey) {
        const mine = await reader.account.position.all([{ memcmp: { offset: 8, bytes: publicKey.toBase58() } }]);
        setPositions(Object.fromEntries(mine.map((p) => [p.account.property.toBase58(), p.account])));
      } else setPositions({});
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [reader, publicKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  const run = async (key: string, label: string, fn: () => Promise<string>) => {
    setBusy(key);
    try {
      const sig = await fn();
      setToast({ kind: "ok", text: label, sig });
      await refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setToast({ kind: "error", text: msg.split("\n")[0].slice(0, 180) });
    } finally {
      setBusy(null);
    }
  };

  const stats = useMemo(() => {
    const raised = properties.reduce((s, p) => s + Number(p.account.sharesSold.mul(p.account.pricePerShare).toString()), 0);
    const rent = properties.reduce((s, p) => s + Number(p.account.totalRentDeposited.toString()), 0);
    return { count: properties.length, raised, rent, investors: Object.keys(positions).length };
  }, [properties, positions]);

  return (
    <main className="container">
      <header className="header">
        <div className="logo">
          <div className="logo-mark">R</div>
          Roofic <span className="badge">MVP · Devnet</span>
        </div>
        <WalletMultiButton />
      </header>

      <section className="hero">
        <h1>
          Владейте долей <span className="grad-text">арендной недвижимости</span> с любого кошелька
        </h1>
        <p>
          Покупайте доли объектов за SOL. Арендный доход распределяется on-chain пропорционально вашей доле — без
          посредников и бумажной волокиты.
        </p>
        <div className="stats">
          <div className="glass stat"><div className="stat-label">Объектов</div><div className="stat-value">{stats.count}</div></div>
          <div className="glass stat"><div className="stat-label">Привлечено</div><div className="stat-value">{sol(stats.raised)} SOL</div></div>
          <div className="glass stat"><div className="stat-label">Выплачено аренды</div><div className="stat-value">{sol(stats.rent)} SOL</div></div>
          <div className="glass stat"><div className="stat-label">Мои позиции</div><div className="stat-value">{stats.investors}</div></div>
        </div>
      </section>

      {publicKey && program && <CreateProperty busy={busy} onSubmit={(args) =>
        run("create", "Объект создан", async () => {
          const id = new BN(Date.now());
          return program.methods
            .createProperty(id, args.name, args.location, new BN(args.shares), new BN(Math.round(args.price * LAMPORTS_PER_SOL)))
            .accountsPartial({ property: propertyPda(publicKey, id), authority: publicKey, systemProgram: SystemProgram.programId })
            .rpc();
        })
      } />}

      <div className="section-title">
        <h2>Объекты</h2>
        <button className="btn ghost" onClick={refresh} id="refresh-btn">Обновить</button>
      </div>

      {loading ? (
        <div className="glass empty">Загрузка объектов из devnet…</div>
      ) : properties.length === 0 ? (
        <div className="glass empty">Пока нет объектов. Подключите кошелёк и залистите первый.</div>
      ) : (
        <div className="grid">
          {properties.map((p) => (
            <PropertyCard
              key={p.publicKey.toBase58()}
              p={p}
              position={positions[p.publicKey.toBase58()]}
              me={publicKey}
              busy={busy}
              onBuy={(shares) =>
                run(`buy-${p.publicKey}`, `Куплено долей: ${shares}`, () =>
                  program!.methods
                    .buyShares(new BN(shares))
                    .accountsPartial({
                      property: p.publicKey,
                      position: positionPda(p.publicKey, publicKey!),
                      investor: publicKey!,
                      authority: p.account.authority,
                      systemProgram: SystemProgram.programId,
                    })
                    .rpc(),
                )
              }
              onDeposit={(amount) =>
                run(`dep-${p.publicKey}`, `Внесено аренды: ${amount} SOL`, () =>
                  program!.methods
                    .depositRent(new BN(Math.round(amount * LAMPORTS_PER_SOL)))
                    .accountsPartial({ property: p.publicKey, authority: publicKey!, systemProgram: SystemProgram.programId })
                    .rpc(),
                )
              }
              onClaim={() =>
                run(`claim-${p.publicKey}`, "Доход получен", () =>
                  program!.methods
                    .claimRent()
                    .accountsPartial({ property: p.publicKey, position: positionPda(p.publicKey, publicKey!), investor: publicKey! })
                    .rpc(),
                )
              }
            />
          ))}
        </div>
      )}

      <footer className="footer">
        Roofic · Week 8 Build Sprint · Solana Devnet ·{" "}
        <a href="https://github.com/Abdulla-Nurislam/Modules-3-6-for-IT-StartUP" target="_blank">GitHub</a>
      </footer>

      {toast && (
        <div className={`glass toast ${toast.kind}`} role="status">
          {toast.kind === "ok" ? "✅ " : "❌ "}
          {toast.text}
          {toast.sig && (
            <>
              {" · "}
              <a href={explorerTx(toast.sig)} target="_blank">Explorer ↗</a>
            </>
          )}
        </div>
      )}
    </main>
  );
}

function CreateProperty({ busy, onSubmit }: {
  busy: string | null;
  onSubmit: (a: { name: string; location: string; shares: number; price: number }) => void;
}) {
  const [name, setName] = useState("Almaty Loft #1");
  const [location, setLocation] = useState("Almaty, Kazakhstan");
  const [shares, setShares] = useState(1000);
  const [price, setPrice] = useState(0.01);
  return (
    <>
      <div className="section-title"><h2>Залистить объект</h2></div>
      <form className="glass form-card" onSubmit={(e) => { e.preventDefault(); onSubmit({ name, location, shares, price }); }}>
        <label className="field">Название<input id="create-name" className="input" value={name} maxLength={48} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field">Локация<input id="create-location" className="input" value={location} maxLength={64} onChange={(e) => setLocation(e.target.value)} /></label>
        <label className="field">Всего долей<input id="create-shares" className="input" type="number" min={1} value={shares} onChange={(e) => setShares(+e.target.value)} /></label>
        <label className="field">Цена доли, SOL<input id="create-price" className="input" type="number" min={0.000001} step="any" value={price} onChange={(e) => setPrice(+e.target.value)} /></label>
        <button id="create-submit" className="btn" disabled={busy === "create" || !name}>{busy === "create" ? "Отправка…" : "Создать объект"}</button>
      </form>
    </>
  );
}

function PropertyCard({ p, position, me, busy, onBuy, onDeposit, onClaim }: {
  p: Property;
  position?: Position;
  me: PublicKey | null;
  busy: string | null;
  onBuy: (shares: number) => void;
  onDeposit: (sol: number) => void;
  onClaim: () => void;
}) {
  const [shares, setShares] = useState(10);
  const [rent, setRent] = useState(0.05);
  const a = p.account;
  const key = p.publicKey.toBase58();
  const isOwner = me?.equals(a.authority) ?? false;
  const sold = Number(a.sharesSold.toString());
  const total = Number(a.totalShares.toString());
  const pct = total ? (sold / total) * 100 : 0;
  const claimable = position ? pendingRent(position.shares, a.accRentPerShare, position.rewardDebt, position.unclaimed) : null;

  return (
    <article className="glass card">
      <div className="card-head">
        <div>
          <h3>{a.name}</h3>
          <div className="loc">📍 {a.location || "—"}</div>
        </div>
        {isOwner ? <span className="pill mine">Ваш объект</span> : <span className="pill">{sol(a.pricePerShare)} SOL / доля</span>}
      </div>

      <div>
        <div className="progress"><div style={{ width: `${pct}%` }} /></div>
        <div className="progress-label"><span>Продано {sold.toLocaleString()} / {total.toLocaleString()}</span><span>{pct.toFixed(1)}%</span></div>
      </div>

      <div className="kv">
        <div><span>Цена доли</span><strong>{sol(a.pricePerShare)} SOL</strong></div>
        <div><span>Аренда выплачено</span><strong>{sol(a.totalRentDeposited)} SOL</strong></div>
      </div>

      {position && claimable && (
        <div className="position">
          <span>Ваши доли: <b>{position.shares.toString()}</b> · к выводу: <b>{sol(claimable)} SOL</b></span>
          <button id={`claim-${key}`} className="btn teal" disabled={claimable.isZero() || busy === `claim-${key}`} onClick={onClaim}>Claim</button>
        </div>
      )}

      {me && sold < total && (
        <div className="row">
          <input id={`buy-amount-${key}`} className="input" type="number" min={1} max={total - sold} value={shares} onChange={(e) => setShares(+e.target.value)} />
          <button id={`buy-${key}`} className="btn" disabled={busy === `buy-${key}` || shares < 1} onClick={() => onBuy(shares)}>
            Купить за {sol(a.pricePerShare.mul(new BN(shares || 0)))} SOL
          </button>
        </div>
      )}

      {isOwner && (
        <div className="row">
          <input id={`rent-amount-${key}`} className="input" type="number" min={0} step="any" value={rent} onChange={(e) => setRent(+e.target.value)} />
          <button id={`deposit-${key}`} className="btn ghost" disabled={busy === `dep-${key}` || sold === 0 || rent <= 0} onClick={() => onDeposit(rent)}>
            Внести аренду
          </button>
        </div>
      )}
    </article>
  );
}
