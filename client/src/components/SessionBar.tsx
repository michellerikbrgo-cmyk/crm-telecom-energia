import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pause, Play } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState, useEffect, useMemo, useRef } from "react";

type SessionRow = {
  presenceSessionStartedAt?: Date | string | null;
  lastOnlineAt?: Date | string | null;
  pauseStartedAt?: Date | string | null;
  totalPauseMinutes?: number | null;
};

/** Minutos úteis de sessão: tempo desde o início menos pausas já fechadas e a pausa actual. */
function effectiveActiveMinutes(row: SessionRow | undefined): { hours: number; mins: number } {
  const startedAt = row?.presenceSessionStartedAt
    ? new Date(row.presenceSessionStartedAt).getTime()
    : row?.lastOnlineAt
      ? new Date(row.lastOnlineAt).getTime()
      : Date.now();
  const wallMin = Math.max(0, Math.floor((Date.now() - startedAt) / 60000));
  const closedPauseMin = Number(row?.totalPauseMinutes ?? 0) || 0;
  const pauseStartedAt = row?.pauseStartedAt ? new Date(row.pauseStartedAt).getTime() : null;
  const currentPauseMin = pauseStartedAt
    ? Math.floor((Date.now() - pauseStartedAt) / 60000)
    : 0;
  const activeMin = Math.max(0, wallMin - closedPauseMin - currentPauseMin);
  return { hours: Math.floor(activeMin / 60), mins: activeMin % 60 };
}

/**
 * Barra de sessão global: tempo útil (sem contar pausas), sessão iniciada ao entrar (servidor),
 * pausa manual e retoma ao voltar a interagir com a app.
 */
export function SessionBar() {
  const sessionQuery = trpc.session.getStatus.useQuery(undefined, { refetchInterval: 15000 });
  const startPause = trpc.session.startPause.useMutation({ onSuccess: () => sessionQuery.refetch() });
  const endPause = trpc.session.endPause.useMutation({ onSuccess: () => sessionQuery.refetch() });

  const [tick, setTick] = useState(0);
  const isPaused = !!sessionQuery.data?.pauseStartedAt;
  const pauseAutoEndedRef = useRef(false);
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const { hours, mins } = useMemo(() => {
    void tick;
    return effectiveActiveMinutes(sessionQuery.data as SessionRow | undefined);
  }, [sessionQuery.data, tick]);

  const pauseElapsed =
    isPaused && sessionQuery.data?.pauseStartedAt
      ? Math.floor((Date.now() - new Date(sessionQuery.data.pauseStartedAt).getTime()) / 60000)
      : 0;

  useEffect(() => {
    if (!isPaused) {
      pauseAutoEndedRef.current = false;
      return;
    }
    if (!sessionQuery.data?.pauseStartedAt || pauseElapsed < 60 || pauseAutoEndedRef.current) return;
    pauseAutoEndedRef.current = true;
    endPause.mutate();
    toast.info("Pausa terminada automaticamente (limite 1h)");
  }, [isPaused, pauseElapsed, sessionQuery.data?.pauseStartedAt, endPause]);

  /** Qualquer interacção na página retoma a pausa (debounced por um disparo por período em pausa). */
  useEffect(() => {
    if (!isPaused) return;
    let fired = false;
    const resume = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("[data-session-bar-actions]")) return;
      if (fired || !isPausedRef.current) return;
      fired = true;
      endPause.mutate(undefined, {
        onSuccess: () => {
          toast.info("Sessão retomada após actividade");
        },
      });
    };
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener("pointerdown", resume, opts);
    window.addEventListener("keydown", resume, opts);
    window.addEventListener("scroll", resume, opts);
    return () => {
      window.removeEventListener("pointerdown", resume, opts);
      window.removeEventListener("keydown", resume, opts);
      window.removeEventListener("scroll", resume, opts);
    };
  }, [isPaused, endPause]);

  return (
    <Card className="border-0 shadow-sm shrink-0">
      <CardContent className="py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${isPaused ? "bg-orange-500" : "bg-green-500 animate-pulse"}`} />
              <span className="text-muted-foreground">{isPaused ? "Em Pausa" : "Online"}</span>
            </div>
            <span className="text-muted-foreground hidden sm:inline">|</span>
            <span className="text-muted-foreground">
              Tempo útil: {hours}h {mins}min
              <span className="hidden md:inline text-xs ml-1 opacity-80">(pausas não contam)</span>
            </span>
            {isPaused && (
              <span className="text-orange-500 font-medium">Pausa: {pauseElapsed}min / 60min</span>
            )}
          </div>
          <div className="flex items-center gap-2" data-session-bar-actions>
            {isPaused ? (
              <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => endPause.mutate()}>
                <Play className="h-3 w-3" /> Voltar
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => startPause.mutate()}>
                <Pause className="h-3 w-3" /> Iniciar Pausa
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
