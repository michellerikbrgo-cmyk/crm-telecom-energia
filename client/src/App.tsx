import ErrorBoundary from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";

const IndexSplash = lazy(() => import("@/pages/IndexSplash"));
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

function IndexSplashFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[linear-gradient(145deg,#5a0000_0%,#e60000_42%,#9a0000_100%)] px-6">
      <p className="max-w-md text-center text-base font-medium leading-relaxed text-white/95">
        Grandes conquistas começam com uma ligação. Já falta pouco.
      </p>
      <div className="mt-10 h-2.5 w-full max-w-md overflow-hidden rounded-full bg-black/25">
        <div className="h-full w-1/6 animate-pulse rounded-full bg-white/80" />
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
      <Route path="/">
        <Suspense fallback={<IndexSplashFallback />}>
          <IndexSplash />
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
