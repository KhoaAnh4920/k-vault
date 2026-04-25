"use client";
import { useState } from "react";
import Link from "next/link";
import { LogOut, Settings, User as UserIcon, Upload, Menu, Search } from "lucide-react";
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
import { buttonVariants, Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { GlobalSearch } from "@/components/GlobalSearch";

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
  const isMember = (user?.roles ?? []).includes("member");

  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur-md border-b border-border/40">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl flex items-center justify-between h-16 gap-4">
        
        {/* Left Side: Sidebar Trigger */}
        <div className="flex items-center md:w-64">
          <SidebarTrigger className="-ml-2 h-9 w-9" />
        </div>

        {/* Center: Global Search Placeholder */}
        <div className="flex-1 max-w-xl hidden sm:flex">
          <Button 
            variant="outline" 
            onClick={() => setSearchOpen(true)}
            className="w-full justify-start text-muted-foreground bg-muted/50 border-border/40 hover:bg-muted/80 h-9 px-3"
          >
            <Search className="mr-2 h-4 w-4" />
            <span className="flex-1 text-left font-normal">Search videos...</span>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>
        </div>

        {/* Right Side: Actions & Profile */}
        <nav className="flex items-center justify-end space-x-2 md:w-64">
          {/* Mobile Search Icon */}
          <Button variant="ghost" size="icon" className="sm:hidden h-9 w-9" onClick={() => setSearchOpen(true)}>
            <Search className="h-5 w-5" />
            <span className="sr-only">Search</span>
          </Button>

          {!isLoading && (isAdmin || isMember) && (
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
                  {(isAdmin || isMember) && (
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
                    onClick={(e) => {
                      e.preventDefault();
                      signOut({ callbackUrl: "/" });
                    }}
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
      <GlobalSearch open={searchOpen} setOpen={setSearchOpen} />
    </header>
  );
}

