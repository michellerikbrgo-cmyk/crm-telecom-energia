import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Megaphone, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "crm_broadcast_alert_dismiss_revision";

type Props = {
  /** Super Admin publica alertas mas não deve ver este cartão durante o trabalho habitual. */
  hideForSuperAdmin?: boolean;
};

export function UserBroadcastBanner({ hideForSuperAdmin }: Props) {
  const query = trpc.system.getUserBroadcastAlert.useQuery(undefined, {
    enabled: !hideForSuperAdmin,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const [dismissedRev, setDismissedRev] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      setDismissedRev(v);
    } catch {
      setDismissedRev(null);
    }
  }, []);

  const visible = useMemo(() => {
    if (hideForSuperAdmin) return false;
    const msg = query.data?.message;
    const rev = query.data?.revision;
    if (!msg?.trim() || rev == null) return false;
    return String(dismissedRev) !== String(rev);
  }, [hideForSuperAdmin, query.data?.message, query.data?.revision, dismissedRev]);

  const dismiss = useCallback(() => {
    const rev = query.data?.revision;
    if (rev == null) return;
    try {
      localStorage.setItem(STORAGE_KEY, String(rev));
    } catch {
      /* ignore */
    }
    setDismissedRev(String(rev));
  }, [query.data?.revision]);

  if (!visible || !query.data?.message) return null;

  return (
    <Alert className="border-primary/35 bg-primary/5 pr-14" aria-live="polite">
      <Megaphone className="text-primary" aria-hidden />
      <AlertTitle className="text-foreground">Aviso do sistema</AlertTitle>
      <AlertDescription className="text-foreground/90 whitespace-pre-wrap">
        {query.data.message}
      </AlertDescription>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-3 top-3 h-8 w-8 shrink-0"
        onClick={dismiss}
        aria-label="Fechar aviso (apenas neste dispositivo)"
      >
        <X className="h-4 w-4" />
      </Button>
    </Alert>
  );
}
