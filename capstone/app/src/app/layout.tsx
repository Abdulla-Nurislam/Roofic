import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: "Roofic Capstone — RWA Rental Real Estate Tokenization on Solana",
  description:
    "Token-2022 NonTransferable property shares, KYC allow-list, stablecoin rent distribution, and on-chain SHA-256 yield & risk scoring.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className={outfit.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

