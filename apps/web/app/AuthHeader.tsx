"use client";

import Link from "next/link";
import { LogOut, Settings, User as UserIcon, Upload } from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function UserAvatar({
  name,
  image,
}: {
  name?: string | null;
  image?: string | null;
}) {
  const initials = (name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Avatar className="h-8 w-8">
      <AvatarImage src={image ?? ""} alt={name ?? "avatar"} />
      <AvatarFallback className="bg-[#e07b54] text-white text-xs font-bold leading-none">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

export default function AuthHeader() {
  const { data: session, status } = useSession();
  const isLoading = status === "loading";
  const user = session?.user;
  const isAdmin = (user?.roles ?? []).includes("admin");

  return (
    <header className="sticky top-0 z-50 bg-background/85 backdrop-blur border-b border-border/40">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl flex items-center justify-between h-16">
        <Link href="/" className="text-[22px] font-black tracking-tighter flex items-center gap-2.5 group">
          <div className="bg-primary text-primary-foreground w-8 h-8 rounded-xl flex items-center justify-center shadow-lg shadow-primary/25 transition-transform group-hover:scale-105 group-hover:-rotate-3">
            <span className="text-base leading-none">K</span>
          </div>
          <span className="bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent">
            VAULT
          </span>
        </Link>

        <nav className="flex flex-1 items-center justify-end space-x-2">
          <Link href="/" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:flex text-muted-foreground hover:text-foreground font-medium")}>
            Library
          </Link>

          {!isLoading && isAdmin && (
            <Link href="/upload" className={cn(buttonVariants({ size: "sm" }), "rounded-full shadow-md shadow-primary/20 px-4 font-semibold")}>
              + Upload
            </Link>
          )}

          {!isLoading &&
            (user ? (
              <DropdownMenu>
                <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  <UserAvatar name={user.name} image={user.image} />
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{user.name}</p>
                        <p className="text-xs leading-none text-muted-foreground">
                          {user.email}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  {isAdmin && (
                    <DropdownMenuItem>
                      <Link href="/upload" className="flex items-center w-full">
                        <Upload className="mr-2 h-4 w-4" />
                        <span>Upload</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem>
                    <Link href="/profile" className="flex items-center w-full">
                      <UserIcon className="mr-2 h-4 w-4" />
                      <span>Profile</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Link href="/settings" className="flex items-center w-full">
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                    onSelect={() => signOut({ callbackUrl: "/" })}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link href="/login" className={buttonVariants({ size: "sm" })}>
                Login
              </Link>
            ))}
        </nav>
      </div>
    </header>
  );
}
