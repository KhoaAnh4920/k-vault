"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Home, FolderClosed, Settings } from "lucide-react";
import { useSession } from "next-auth/react";

export default function SidebarNav({ className, onClick }: { className?: string, onClick?: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  
  const isAuthenticated = !!session;

  const links = [
    {
      title: "Home",
      href: "/",
      icon: Home,
      show: true,
    },
    {
      title: "My Videos",
      href: "/my-videos",
      icon: FolderClosed,
      show: isAuthenticated,
    },
    {
      title: "Settings",
      href: "/settings",
      icon: Settings,
      show: isAuthenticated,
    },
  ];

  return (
    <nav className={cn("flex flex-col gap-2 p-4 w-full h-full bg-background/50", className)}>
      {links.filter((l) => l.show).map((link) => {
        const Icon = link.icon;
        const isActive = pathname === link.href;
        
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onClick}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
              isActive 
                ? "bg-primary/10 text-primary" 
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className={cn("w-5 h-5", isActive && "fill-primary/20")} />
            {link.title}
          </Link>
        );
      })}
    </nav>
  );
}
