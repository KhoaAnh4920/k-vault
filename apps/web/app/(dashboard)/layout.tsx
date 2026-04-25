import AuthHeader from "./_components/AuthHeader";
import { AppSidebar } from "./_components/AppSidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="overflow-x-clip flex flex-col min-h-screen w-full">
        <AuthHeader />
        <main className="flex flex-col flex-1 min-w-0 w-full">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
