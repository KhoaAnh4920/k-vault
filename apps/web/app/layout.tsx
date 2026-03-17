import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'K-Vault — Personal Streaming',
  description: 'Your personal video streaming platform',
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
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <header className="header">
          <div className="container-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>
            <a href="/" style={{ textDecoration: 'none' }}>
              <span style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--accent)' }}>
                K-VAULT
              </span>
            </a>
            <nav style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <a href="/" className="btn-ghost" style={{ fontSize: '13px', padding: '7px 14px' }}>
                Library
              </a>
              <a href="/upload" className="btn-primary" style={{ fontSize: '13px', padding: '8px 16px' }}>
                + Upload
              </a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
