import type { Metadata } from "next";
import Providers from "./Providers";
import AuthHeader from "./AuthHeader";
import SessionGuard from "./SessionGuard";
import "./globals.css";
import { Geist, Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: "K-Vault — Personal Streaming",
  description: "Your personal video streaming platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn("dark", "font-sans", geist.variable, inter.variable)}>
      <head>
      </head>
      <body>
        <Providers>
          <SessionGuard />
          <AuthHeader />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
