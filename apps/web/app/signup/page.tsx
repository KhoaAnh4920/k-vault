"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

/** Auth0 "Good" password policy rules */
const PASSWORD_RULES = [
  {
    id: "length",
    label: "At least 8 characters",
    test: (p: string) => p.length >= 8,
  },
  {
    id: "lower",
    label: "One lowercase letter (a–z)",
    test: (p: string) => /[a-z]/.test(p),
  },
  {
    id: "upper",
    label: "One uppercase letter (A–Z)",
    test: (p: string) => /[A-Z]/.test(p),
  },
  {
    id: "number",
    label: "One number (0–9)",
    test: (p: string) => /\d/.test(p),
  },
] as const;

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  return (
    <ul
      style={{
        margin: "6px 0 0",
        padding: 0,
        listStyle: "none",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}
    >
      {PASSWORD_RULES.map(({ id, label, test }) => {
        const ok = test(password);
        return (
          <li
            key={id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              color: ok ? "#22c55e" : "var(--text-secondary)",
              transition: "color 0.15s ease",
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 700,
                flexShrink: 0,
                background: ok
                  ? "rgba(34,197,94,0.15)"
                  : "rgba(255,255,255,0.06)",
                border: `1px solid ${ok ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.12)"}`,
                transition: "all 0.15s ease",
                color: ok ? "#22c55e" : "var(--text-secondary)",
              }}
            >
              {ok ? "✓" : "·"}
            </span>
            {label}
          </li>
        );
      })}
    </ul>
  );
}

export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const failedRule = PASSWORD_RULES.find(({ test }) => !test(password));
    if (failedRule) {
      setError(`Password must include: ${failedRule.label.toLowerCase()}.`);
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      // 1. Create user via Auth0 Management API
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Failed to create account.");
        return;
      }

      // 2. Automatically sign in after successful registration
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        // Account created but login failed — guide user to login page
        router.push("/login");
      } else {
        router.push("/");
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "var(--bg-base)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          display: "flex",
          flexDirection: "column",
          gap: "32px",
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: "center" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span
              style={{
                fontSize: "28px",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                color: "var(--accent)",
              }}
            >
              K-VAULT
            </span>
          </Link>
          <p
            style={{
              marginTop: "8px",
              color: "var(--text-secondary)",
              fontSize: "14px",
            }}
          >
            Create your account
          </p>
        </div>

        {/* Card */}
        <div
          className="card"
          style={{
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          {error && (
            <div
              style={{
                padding: "12px 16px",
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: "8px",
                color: "#ef4444",
                fontSize: "14px",
              }}
            >
              {error}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: "6px" }}
            >
              <label htmlFor="name" style={labelStyle}>
                Full name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                placeholder="Jane Doe"
                style={inputStyle}
              />
            </div>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "6px" }}
            >
              <label htmlFor="email" style={labelStyle}>
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                style={inputStyle}
              />
            </div>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "6px" }}
            >
              <label htmlFor="password" style={labelStyle}>
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="At least 8 characters"
                style={inputStyle}
              />
              <PasswordStrength password={password} />
            </div>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "6px" }}
            >
              <label htmlFor="confirm" style={labelStyle}>
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Re-enter password"
                style={inputStyle}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{ width: "100%", marginTop: "8px" }}
            >
              {loading ? (
                <span
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <span className="spinner" style={{ width: 16, height: 16 }} />
                  Creating account…
                </span>
              ) : (
                "Create account"
              )}
            </button>
          </form>
        </div>

        {/* Footer link */}
        <p
          style={{
            textAlign: "center",
            fontSize: "14px",
            color: "var(--text-secondary)",
          }}
        >
          Already have an account?{" "}
          <Link
            href="/login"
            style={{
              color: "var(--accent)",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 500,
  color: "var(--text-secondary)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  color: "var(--text-primary)",
  fontSize: "14px",
  outline: "none",
  transition: "border-color 0.15s ease",
};
