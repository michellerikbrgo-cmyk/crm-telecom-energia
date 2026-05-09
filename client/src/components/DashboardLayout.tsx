import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
// import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { LayoutDashboard, LogOut, PanelLeft, Users, Phone, Clock, FileText, Calculator, Megaphone, Trophy, Shield, AlertTriangle, BarChart3, Calendar, Zap, Bot, PhoneCall, User, Ban, ClipboardList } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { SessionBar } from "@/components/SessionBar";
import { UserBroadcastBanner } from "@/components/UserBroadcastBanner";
import { UserProfileDialog } from "@/components/UserProfileDialog";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";

type MenuItem = {
  icon: any;
  label: string;
  path: string;
  roles?: string[];
};

const menuItems: MenuItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/painel", roles: ["vendedor", "cej", "ce", "coordenador"] },
  { icon: PhoneCall, label: "Discador", path: "/discador", roles: ["vendedor", "cej", "ce"] },
  { icon: ClipboardList, label: "Acompanhamento", path: "/acompanhamento", roles: ["vendedor", "cej", "ce", "coordenador"] },
  { icon: Phone, label: "Contactos", path: "/contactos", roles: ["vendedor", "cej", "ce", "coordenador"] },
  { icon: Ban, label: "Lista negra", path: "/lista-negra", roles: ["vendedor", "cej", "ce", "coordenador"] },
  { icon: Clock, label: "Pendentes", path: "/pendentes", roles: ["vendedor", "cej", "ce", "coordenador"] },
  { icon: FileText, label: "Contratos", path: "/contratos", roles: ["vendedor", "cej", "ce", "coordenador"] },
  { icon: Calculator, label: "Calculadora", path: "/calculadora", roles: ["vendedor", "cej", "ce", "coordenador"] },
  { icon: Bot, label: "IA Objeções", path: "/ia-objecoes", roles: ["vendedor", "cej", "ce", "coordenador"] },
  { icon: Megaphone, label: "Campanhas", path: "/campanhas", roles: ["vendedor", "cej", "ce", "coordenador"] },
  { icon: Trophy, label: "Ranking", path: "/ranking", roles: ["vendedor", "cej", "ce", "coordenador"] },
  { icon: Calendar, label: "Calendário", path: "/calendario", roles: ["vendedor", "cej", "ce", "coordenador"] },
  { icon: Shield, label: "Supervisão", path: "/supervisao", roles: ["cej", "ce", "coordenador"] },
  { icon: BarChart3, label: "Relatórios", path: "/relatorios", roles: ["cej", "ce", "coordenador"] },
  { icon: Users, label: "Equipa", path: "/equipa", roles: ["cej", "ce", "coordenador"] },
  { icon: Shield, label: "Auditoria", path: "/auditoria", roles: ["ce", "coordenador"] },
  { icon: Zap, label: "Base de Dados", path: "/base-dados", roles: ["ce", "coordenador"] },
  { icon: Users, label: "Utilizadores", path: "/utilizadores", roles: ["cej", "ce", "coordenador"] },
  { icon: Shield, label: "Super Admin", path: "/super-admin", roles: ["super_admin"] },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              Iniciar Sessão
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Aceda ao CRM da sua equipa de vendas. Autentique-se para continuar.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = "/login";
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Entrar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const utils = trpc.useUtils();
  const [profileOpen, setProfileOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const userCrmRole = (user as any)?.crmRole || "vendedor";
  const isSuperAdmin = !!(user as any)?.isSuperAdmin;
  const filteredMenuItems = menuItems.filter(item => {
    if (!item.roles) return true;
    if (isSuperAdmin) return true;
    if (item.roles.includes("super_admin")) return false;
    return item.roles.includes(userCrmRole);
  });
  const activeMenuItem = filteredMenuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  const profile = user as {
    name?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
  } | null | undefined;
  const displayName = typeof profile?.name === "string" ? profile.name : "";
  const displayEmail = typeof profile?.email === "string" ? profile.email : "";
  const avatarUrl = profile?.avatarUrl || null;

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold tracking-tight truncate text-primary">
                    CRM Pro
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {filteredMenuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    {avatarUrl ? (
                      <AvatarImage src={avatarUrl} alt="" className="object-cover" />
                    ) : null}
                    <AvatarFallback className="text-xs font-medium">
                      {displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {displayName || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {displayEmail || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem className="cursor-pointer" onClick={() => setProfileOpen(true)}>
                  <User className="mr-2 h-4 w-4" />
                  <span>Foto de perfil</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Terminar Sessão</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <UserProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        displayName={displayName}
        avatarUrl={avatarUrl}
        onAvatarUpdated={() => void utils.auth.me.invalidate()}
      />

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 flex flex-col gap-4 p-4 min-h-0">
          <SessionBar />
          <UserBroadcastBanner hideForSuperAdmin={isSuperAdmin} />
          <div className="flex-1 min-w-0 min-h-0">{children}</div>
        </main>
      </SidebarInset>
    </>
  );
}
