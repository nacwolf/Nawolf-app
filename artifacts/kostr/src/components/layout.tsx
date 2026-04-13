import { useUser, useClerk } from "@clerk/react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Package,
  TestTubes,
  LogOut,
  ChevronDown,
  Activity,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar collapsible="none">
          <SidebarHeader className="p-4">
            <div className="flex items-center gap-2 font-bold text-xl text-primary">
              <div className="bg-primary text-primary-foreground w-8 h-8 rounded flex items-center justify-center text-sm font-bold">K</div>
              <span>Kostr</span>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/dashboard"}>
                  <Link href="/dashboard">
                    <LayoutDashboard className="w-4 h-4" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/skus")}>
                  <Link href="/skus">
                    <Package className="w-4 h-4" />
                    <span>SKUs</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/ingredients")}>
                  <Link href="/ingredients">
                    <TestTubes className="w-4 h-4" />
                    <span>Ingredients</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/activity"}>
                  <Link href="/activity">
                    <Activity className="w-4 h-4" />
                    <span>Activity Feed</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-4 border-t border-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="w-full justify-start gap-2 h-auto py-2 px-2">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={user?.imageUrl} />
                    <AvatarFallback>{user?.firstName?.charAt(0) || "U"}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-left text-sm truncate">
                    <div className="font-medium truncate">{user?.fullName || "User"}</div>
                    <div className="text-muted-foreground text-xs truncate">{user?.primaryEmailAddress?.emailAddress}</div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 overflow-auto flex flex-col">
          <div className="container mx-auto max-w-7xl p-6 md:p-8 flex-1 flex flex-col">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
