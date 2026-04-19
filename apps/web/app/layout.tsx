import type { Metadata, Viewport } from "next";
import Providers from "./Providers";
import SessionGuard from "./SessionGuard";
import "./globals.css";
import { Geist, Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: "K-Vault — Personal Streaming",
  description: "Your personal video streaming platform",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "K-Vault",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
          {children}
        </Providers>
      </body>
    </html>
  );
}
