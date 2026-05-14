import DashboardLayout from "@/components/DashboardLayout";
import { PageLoadFallback } from "@/components/PageLoadFallback";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import { RoleProtectedRoute } from "@/components/RoleProtectedRoute";

const Home = lazy(() => import("@/pages/Home"));
const Contactos = lazy(() => import("@/pages/Contactos"));
const Pendentes = lazy(() => import("@/pages/Pendentes"));
const Contratos = lazy(() => import("@/pages/Contratos"));
const Calculadora = lazy(() => import("@/pages/Calculadora"));
const IAObjecoes = lazy(() => import("@/pages/IAObjecoes"));
const Campanhas = lazy(() => import("@/pages/Campanhas"));
const Ranking = lazy(() => import("@/pages/Ranking"));
const Calendario = lazy(() => import("@/pages/Calendario"));
const Relatorios = lazy(() => import("@/pages/Relatorios"));
const Equipa = lazy(() => import("@/pages/Equipa"));
const Auditoria = lazy(() => import("@/pages/Auditoria"));
const BaseDados = lazy(() => import("@/pages/BaseDados"));
const GestaoUtilizadores = lazy(() => import("@/pages/GestaoUtilizadores"));
const SuperAdmin = lazy(() => import("@/pages/SuperAdmin"));
const Discador = lazy(() => import("@/pages/Discador"));
const Supervisao = lazy(() => import("@/pages/Supervisao"));
const ListaNegra = lazy(() => import("@/pages/ListaNegra"));
const Acompanhamento = lazy(() => import("@/pages/Acompanhamento"));
const Beta = lazy(() => import("@/pages/Beta"));
const BetaRevisao = lazy(() => import("@/pages/BetaRevisao"));
const PlanosEmpresas = lazy(() => import("@/pages/PlanosEmpresas"));
const Notificacoes = lazy(() => import("@/pages/Notificacoes"));

/** Carregado só nas rotas autenticadas — não entra no chunk do /login */
export default function AuthenticatedApp() {
  return (
    <TooltipProvider delayDuration={0}>
      <DashboardLayout>
        <Suspense fallback={<PageLoadFallback />}>
          <Switch>
            <Route path="/notificacoes" component={Notificacoes} />
            <Route path="/painel" component={Home} />
            <Route path="/beta/revisao" component={BetaRevisao} />
            <Route path="/beta" component={Beta} />
            <Route path="/acompanhamento" component={Acompanhamento} />
            <Route path="/contactos">
              <RoleProtectedRoute allow={["cej", "ce", "coordenador"]}>
                <Contactos />
              </RoleProtectedRoute>
            </Route>
            <Route path="/pendentes" component={Pendentes} />
            <Route path="/contratos" component={Contratos} />
            <Route path="/calculadora" component={Calculadora} />
            <Route path="/planos" component={PlanosEmpresas} />
            <Route path="/ia-objecoes" component={IAObjecoes} />
            <Route path="/campanhas" component={Campanhas} />
            <Route path="/ranking" component={Ranking} />
            <Route path="/calendario" component={Calendario} />
            <Route path="/relatorios" component={Relatorios} />
            <Route path="/equipa">
              <RoleProtectedRoute allow={["cej", "ce", "coordenador"]}>
                <Equipa />
              </RoleProtectedRoute>
            </Route>
            <Route path="/auditoria" component={Auditoria} />
            <Route path="/base-dados" component={BaseDados} />
            <Route path="/utilizadores" component={GestaoUtilizadores} />
            <Route path="/super-admin" component={SuperAdmin} />
            <Route path="/discador" component={Discador} />
            <Route path="/supervisao" component={Supervisao} />
            <Route path="/lista-negra">
              <RoleProtectedRoute allow={["ce", "coordenador"]}>
                <ListaNegra />
              </RoleProtectedRoute>
            </Route>
            <Route path="/404" component={NotFound} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </DashboardLayout>
    </TooltipProvider>
  );
}
