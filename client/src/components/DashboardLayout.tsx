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
import {
  LayoutDashboard,
  LogOut,
  PanelLeft,
  Users,
  Phone,
  Clock,
  FileText,
  Calculator,
  Megaphone,
  Trophy,
  Shield,
  BarChart3,
  Calendar,
  Zap,
  Bot,
  PhoneCall,
  User,
  Ban,
  ClipboardList,
  Beaker,
  CreditCard,
  Bell,
  type LucideIcon,
} from "lucide-react";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { SessionBar } from "@/components/SessionBar";
import { UserBroadcastBanner } from "@/components/UserBroadcastBanner";
import { UserProfileDialog } from "@/components/UserProfileDialog";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import { NAV_CATALOG, filterNavCatalog } from "@/crmNavCatalog";
import { GlobalSearchCommand } from "@/components/GlobalSearchCommand";
import { NotificationBell } from "@/components/NotificationBell";

const NAV_ICONS: Record<string, LucideIcon> = {
  "/painel": LayoutDashboard,
  "/notificacoes": Bell,
  "/beta": Beaker,
  "/discador": PhoneCall,
  "/acompanhamento": ClipboardList,
  "/contactos": Phone,
  "/lista-negra": Ban,
  "/pendentes": Clock,
  "/calculadora": Calculator,
  "/planos": CreditCard,
  "/ia-objecoes": Bot,
  "/campanhas": Megaphone,
  "/ranking": Trophy,
  "/calendario": Calendar,
  "/relatorios": BarChart3,
  "/equipa": Users,
  "/auditoria": Shield,
  "/base-dados": Zap,
  "/super-admin": Shield,
};

type MenuItem = { icon: LucideIcon; label: string; path: string };

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
  const pricingPlansQuery = trpc.system.getPricingPlansFeature.useQuery(undefined, {
    staleTime: 30_000,
  });
  const filteredMenuItems: MenuItem[] = useMemo(() => {
    const planosEnabled = !!pricingPlansQuery.data?.enabled;
    return filterNavCatalog(NAV_CATALOG, {
      crmRole: userCrmRole,
      isSuperAdmin,
      planosEnabled,
    }).map((item) => ({
      path: item.path,
      label: item.label,
      icon: NAV_ICONS[item.path] ?? LayoutDashboard,
    }));
  }, [userCrmRole, isSuperAdmin, pricingPlansQuery.data?.enabled]);
  const activeMenuItem = filteredMenuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  const profile = user as {
    name?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
    tenantLabel?: string | null;
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
                    {profile?.tenantLabel ? (
                      <p className="text-[11px] text-muted-foreground/90 truncate mt-0.5" title={profile.tenantLabel}>
                        Empresa: {profile.tenantLabel}
                      </p>
                    ) : null}
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
        {isMobile ? (
          <div className="sticky top-0 z-40 border-b bg-background/95 px-2 py-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur space-y-2">
            <div className="flex h-11 items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <SidebarTrigger className="h-9 w-9 shrink-0 rounded-lg bg-background" />
                <span className="tracking-tight text-foreground truncate text-sm">
                  {activeMenuItem?.label ?? "Menu"}
                </span>
              </div>
              <NotificationBell />
            </div>
            <GlobalSearchCommand
              crmRole={userCrmRole}
              isSuperAdmin={isSuperAdmin}
              planosEnabled={!!pricingPlansQuery.data?.enabled}
              className="w-full"
            />
          </div>
        ) : (
          <div className="sticky top-0 z-40 flex items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur">
            <GlobalSearchCommand
              crmRole={userCrmRole}
              isSuperAdmin={isSuperAdmin}
              planosEnabled={!!pricingPlansQuery.data?.enabled}
              className="flex-1 max-w-xl"
            />
            <div className="flex-1 min-w-2" aria-hidden />
            <NotificationBell />
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
