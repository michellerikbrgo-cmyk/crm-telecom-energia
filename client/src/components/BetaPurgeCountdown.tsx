import { Timer } from "lucide-react";
import { useEffect, useState } from "react";

export function formatBetaRemainingPt(ms: number): string {
  if (ms <= 0) return "em breve";
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}min ${s}s`;
  if (h > 0) return `${h}h ${m}min ${s}s`;
  if (m > 0) return `${m}min ${s}s`;
  return `${s}s`;
}

/** Contagem decrescente até `purgeAtIso` (remoção automática na lista Beta). */
export function BetaPurgeCountdown({ purgeAtIso }: { purgeAtIso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const end = new Date(purgeAtIso).getTime();
  const remaining = end - now;
  return (
    <span className="inline-flex items-center gap-1 tabular-nums text-amber-800 dark:text-amber-400">
      <Timer className="h-3.5 w-3.5 shrink-0" aria-hidden />
      Remove da lista em {formatBetaRemainingPt(remaining)}
    </span>
  );
}
