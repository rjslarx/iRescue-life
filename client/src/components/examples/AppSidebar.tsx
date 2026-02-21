import { SidebarProvider } from "@/components/ui/sidebar";
import AppSidebar from '../AppSidebar';

export default function AppSidebarExample() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar 
          rescueName="Sunny Paws Rescue"
          userName="Jane Smith"
          userRole="admin"
        />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-4xl">
            <h1 className="text-3xl font-semibold mb-4">Dashboard Content</h1>
            <p className="text-muted-foreground">
              This is where the main dashboard content would appear. The sidebar navigation
              adapts based on the user's role.
            </p>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
