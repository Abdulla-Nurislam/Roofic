"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import { useMemo, type ReactNode } from "react";
import "@solana/wallet-adapter-react-ui/styles.css";

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl("devnet");

let nextAvailableSlot = 0;
const MIN_GAP_MS = 140;
const RPC_TIMEOUT_MS = 15_000;

async function rpcFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const now = Date.now();
  const waitMs = Math.max(0, nextAvailableSlot - now);
  nextAvailableSlot = Math.max(now, nextAvailableSlot) + MIN_GAP_MS;
  if (waitMs > 0) {
    await new Promise((r) => setTimeout(r, waitMs));
  }

  const delays = [1500, 3000, 5000];
  for (let attempt = 0; ; attempt++) {
    const timeoutSignal = AbortSignal.timeout(RPC_TIMEOUT_MS);
    const signal =
      init?.signal && typeof AbortSignal.any === "function"
        ? AbortSignal.any([init.signal, timeoutSignal])
        : (init?.signal ?? timeoutSignal);
    const res = await fetch(input, { ...init, signal });
    if ((res.status !== 429 && res.status !== 503) || attempt >= delays.length) {
      return res;
    }
    const retryAfterSec = Number(res.headers.get("retry-after"));
    const retryMs =
      Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? Math.min(10_000, retryAfterSec * 1000)
        : delays[attempt];
    await new Promise((r) => setTimeout(r, retryMs));
  }
}

export function Providers({ children }: { children: ReactNode }) {
  // Phantom / Solflare / Backpack auto-discovered via Wallet Standard
  const wallets = useMemo(() => [], []);
  const config = useMemo(() => ({ commitment: "confirmed" as const, fetch: rpcFetch }), []);
  return (
    <ConnectionProvider endpoint={RPC_URL} config={config}>
      <WalletProvider
        wallets={wallets}
        autoConnect
        onError={(err) => console.warn("[Roofic Wallet]", err.name, err.message)}
      >
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
