import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./mail.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "OLA — Assistant Email IA pour Agents Immobiliers",
  description:
    "Détectez automatiquement les contrats immobiliers dans vos emails et organisez-les dans GoHighLevel.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
