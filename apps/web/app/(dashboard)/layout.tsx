import AuthHeader from "./_components/AuthHeader";
import SidebarNav from "./_components/SidebarNav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen flex flex-col w-full overflow-x-hidden">
      <AuthHeader />
      <div className="flex flex-1 min-w-0 w-full">
        {/* Sidebar - hidden on mobile, fixed width on desktop */}
        <aside className="hidden md:flex w-64 flex-col fixed left-0 top-16 bottom-0 border-r border-border/40 z-40 bg-background/95">
          <SidebarNav />
        </aside>
        
        {/* Main content - offset by sidebar width on desktop */}
        <main className="flex-1 md:ml-64 flex flex-col min-h-[calc(100vh-4rem)] min-w-0 w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
