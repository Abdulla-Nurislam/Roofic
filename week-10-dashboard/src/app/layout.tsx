import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: "Roofic Dashboard — Solana RPC & on-chain data",
  description: "Wallet portfolio, transaction history, program activity and cluster health read straight from Solana RPC.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={outfit.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

