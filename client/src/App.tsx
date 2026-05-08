import ErrorBoundary from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";

const Login = lazy(() => import("@/pages/Login"));
const AuthenticatedApp = lazy(() => import("@/AuthenticatedApp"));

function LoginBootstrapFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        <span>A abrir início de sessão…</span>
      </div>
    </div>
  );
}

function AppBootstrapFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        <span>A preparar aplicação…</span>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login">
        <Suspense fallback={<LoginBootstrapFallback />}>
          <Login />
        </Suspense>
      </Route>
      <Route>
        <Suspense fallback={<AppBootstrapFallback />}>
          <AuthenticatedApp />
        </Suspense>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <Toaster />
        <Router />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
