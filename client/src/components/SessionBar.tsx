import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pause, Play } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState, useEffect, useMemo, useRef } from "react";

function sessionDurationLabel(startedAt: Date | null | undefined, fallbackLastOnline: Date | null | undefined): { hours: number; mins: number } {
  const t = startedAt
    ? new Date(startedAt).getTime()
    : fallbackLastOnline
      ? new Date(fallbackLastOnline).getTime()
      : Date.now();
  const totalMin = Math.max(0, Math.floor((Date.now() - t) / 60000));
  return { hours: Math.floor(totalMin / 60), mins: totalMin % 60 };
}

/**
 * Barra de sessão global: o tempo de sessão vem do servidor (`presenceSessionStartedAt`) e
 * mantém-se ao mudar de página (não depende só do Dashboard).
 */
export function SessionBar() {
  const sessionQuery = trpc.session.getStatus.useQuery(undefined, { refetchInterval: 15000 });
  const startPause = trpc.session.startPause.useMutation({ onSuccess: () => sessionQuery.refetch() });
  const endPause = trpc.session.endPause.useMutation({ onSuccess: () => sessionQuery.refetch() });

  const [tick, setTick] = useState(0);
  const isPaused = !!sessionQuery.data?.pauseStartedAt;
  const pauseAutoEndedRef = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const { hours, mins } = useMemo(() => {
    void tick;
    const row = sessionQuery.data as
      | { presenceSessionStartedAt?: Date | null; lastOnlineAt?: Date | null }
      | undefined;
    return sessionDurationLabel(row?.presenceSessionStartedAt ?? null, row?.lastOnlineAt ?? null);
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
              Tempo de sessão: {hours}h {mins}min
            </span>
            {isPaused && (
              <span className="text-orange-500 font-medium">Pausa: {pauseElapsed}min / 60min</span>
            )}
          </div>
          <div className="flex items-center gap-2">
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
