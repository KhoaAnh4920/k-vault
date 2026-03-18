import type { Metadata } from "next";
import Providers from "./Providers";
import AuthHeader from "./AuthHeader";
import SessionGuard from "./SessionGuard";
import "./globals.css";

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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
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
