"use client";

import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { LogOut, Settings, User, Upload } from "lucide-react";
import { useSession, signOut } from "next-auth/react";

function Avatar({
  name,
  image,
}: {
  name?: string | null;
  image?: string | null;
}) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt={name ?? "avatar"} className="user-avatar" />
    );
  }
  const initials = (name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return <span className="user-avatar user-avatar--initials">{initials}</span>;
}

export default function AuthHeader() {
  const { data: session, status } = useSession();
  const isLoading = status === "loading";
  const user = session?.user;
  const isAdmin = (user?.roles ?? []).includes("admin");

  return (
    <header className="header">
      <div
        className="container-main"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "64px",
        }}
      >
        <Link href="/" style={{ textDecoration: "none" }}>
          <span
            style={{
              fontSize: "22px",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "var(--accent)",
            }}
          >
            K-VAULT
          </span>
        </Link>

        <nav style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <Link
            href="/"
            className="btn-ghost nav-hide-mobile"
            style={{ fontSize: "13px", padding: "7px 14px" }}
          >
            Library
          </Link>

          {!isLoading && isAdmin && (
            <Link
              href="/upload"
              className="btn-primary"
              style={{ fontSize: "13px", padding: "8px 16px" }}
            >
              + Upload
            </Link>
          )}

          {!isLoading &&
            (user ? (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button className="avatar-trigger" aria-label="User menu">
                    <Avatar name={user.name} image={user.image} />
                  </button>
                </DropdownMenu.Trigger>

                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="dropdown-content"
                    sideOffset={8}
                    align="end"
                  >
                    {/* User info */}
                    <div className="dropdown-header">
                      <p className="dropdown-header__name">{user.name}</p>
                      <p className="dropdown-header__email">{user.email}</p>
                    </div>

                    <DropdownMenu.Separator className="dropdown-separator" />

                    {isAdmin && (
                      <DropdownMenu.Item asChild>
                        <Link href="/upload" className="dropdown-item">
                          <Upload size={14} />
                          Upload
                        </Link>
                      </DropdownMenu.Item>
                    )}

                    <DropdownMenu.Item asChild>
                      <Link href="/profile" className="dropdown-item">
                        <User size={14} />
                        Profile
                      </Link>
                    </DropdownMenu.Item>

                    <DropdownMenu.Item asChild>
                      <Link href="/settings" className="dropdown-item">
                        <Settings size={14} />
                        Settings
                      </Link>
                    </DropdownMenu.Item>

                    <DropdownMenu.Separator className="dropdown-separator" />

                    <DropdownMenu.Item
                      className="dropdown-item dropdown-item--danger"
                      onSelect={() => signOut({ callbackUrl: "/" })}
                    >
                      <LogOut size={14} />
                      Logout
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            ) : (
              <Link
                href="/login"
                className="btn-primary"
                style={{ fontSize: "13px", padding: "8px 16px" }}
              >
                Login
              </Link>
            ))}
        </nav>
      </div>
    </header>
  );
}
