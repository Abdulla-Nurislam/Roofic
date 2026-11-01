"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { NETWORKS, type NetworkId } from "@/lib/rpc";
import "@solana/wallet-adapter-react-ui/styles.css";

interface NetworkCtx {
  network: NetworkId;
  setNetwork: (n: NetworkId) => void;
}

const NetworkContext = createContext<NetworkCtx>({ network: "devnet", setNetwork: () => {} });
export const useNetwork = () => useContext(NetworkContext);

const STORAGE_KEY = "roofic-dashboard:network";

export function Providers({ children }: { children: ReactNode }) {
  // Start with devnet on the server and first client render (no hydration mismatch),
  // then restore the saved choice.
  const [network, setNetworkState] = useState<NetworkId>("devnet");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in NETWORKS) setNetworkState(saved as NetworkId);
  }, []);

  const setNetwork = (n: NetworkId) => {
    setNetworkState(n);
    localStorage.setItem(STORAGE_KEY, n);
  };

  // Empty list: Phantom / Solflare / Backpack are discovered through Wallet Standard
  const wallets = useMemo(() => [], []);
  const ctx = useMemo(() => ({ network, setNetwork }), [network]);

  return (
    <NetworkContext.Provider value={ctx}>
      <ConnectionProvider endpoint={NETWORKS[network].url}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>{children}</WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </NetworkContext.Provider>
  );
}
