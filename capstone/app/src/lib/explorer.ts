/** Query string that points Solana Explorer at the cluster behind `rpcUrl` (Devnet by default) */
export function explorerClusterQuery(rpcUrl: string | undefined): string {
  if (!rpcUrl) return "?cluster=devnet";
  if (/\/\/(localhost|127\.0\.0\.1)([:/]|$)/i.test(rpcUrl)) {
    return `?cluster=custom&customUrl=${encodeURIComponent(rpcUrl)}`;
  }
  const url = rpcUrl.toLowerCase();
  if (url.includes("mainnet")) return "";
  if (url.includes("testnet")) return "?cluster=testnet";
  return "?cluster=devnet";
}
