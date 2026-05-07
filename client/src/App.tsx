import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Contactos from "./pages/Contactos";
import Pendentes from "./pages/Pendentes";
import Contratos from "./pages/Contratos";
import Calculadora from "./pages/Calculadora";
import IAObjecoes from "./pages/IAObjecoes";
import Campanhas from "./pages/Campanhas";
import Ranking from "./pages/Ranking";
import Calendario from "./pages/Calendario";
import Relatorios from "./pages/Relatorios";
import Equipa from "./pages/Equipa";
import Auditoria from "./pages/Auditoria";
import BaseDados from "./pages/BaseDados";
import Login from "./pages/Login";
import GestaoUtilizadores from "./pages/GestaoUtilizadores";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/contactos"} component={Contactos} />
      <Route path={"/pendentes"} component={Pendentes} />
      <Route path={"/contratos"} component={Contratos} />
      <Route path={"/calculadora"} component={Calculadora} />
      <Route path={"/ia-objecoes"} component={IAObjecoes} />
      <Route path={"/campanhas"} component={Campanhas} />
      <Route path={"/ranking"} component={Ranking} />
      <Route path={"/calendario"} component={Calendario} />
      <Route path={"/relatorios"} component={Relatorios} />
      <Route path={"/equipa"} component={Equipa} />
      <Route path={"/auditoria"} component={Auditoria} />
      <Route path={"/base-dados"} component={BaseDados} />
      <Route path={"/login"} component={Login} />
      <Route path={"/utilizadores"} component={GestaoUtilizadores} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
