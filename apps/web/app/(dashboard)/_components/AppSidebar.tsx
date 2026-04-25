"use client";

import { Home, FolderClosed, Settings } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

export function AppSidebar() {
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
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 flex-row items-center border-b border-border/40 px-4 transition-all group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center">
        <Link 
          href="/" 
          className="flex items-center gap-2.5 group/logo overflow-hidden"
        >
          <div className="bg-primary text-primary-foreground w-8 h-8 min-w-8 flex-shrink-0 rounded-xl flex items-center justify-center shadow-lg shadow-primary/25 transition-transform group-hover/logo:scale-105 group-hover/logo:-rotate-3">
            <span className="text-base leading-none font-black font-sans">K</span>
          </div>
          <span className="bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent text-[22px] font-black tracking-tighter truncate group-data-[collapsible=icon]:hidden">
            VAULT
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-4 mb-2">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {links
                .filter((link) => link.show)
                .map((link) => {
                  const isActive = pathname === link.href;
                  return (
                    <SidebarMenuItem key={link.href}>
                      <SidebarMenuButton 
                        render={<Link href={link.href} />}
                        isActive={isActive} 
                        tooltip={link.title}
                        className="py-5"
                      >
                        <link.icon className="w-5 h-5 flex-shrink-0" />
                        <span>{link.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
