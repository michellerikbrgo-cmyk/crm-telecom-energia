import { useEffect } from "react";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale/pt";
import { ExternalLink, CheckCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Notificacoes() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const listQuery = trpc.notifications.list.useQuery(undefined, {
    staleTime: 20_000,
    refetchInterval: 60_000,
  });

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      void utils.notifications.list.invalidate();
      void utils.notifications.unreadCount.invalidate();
    },
    onError: (e: { message?: string }) => toast.error(e.message ?? "Erro"),
  });

  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      void utils.notifications.list.invalidate();
      void utils.notifications.unreadCount.invalidate();
    },
    onError: (e: { message?: string }) => toast.error(e.message ?? "Erro"),
  });

  const rows = listQuery.data ?? [];
  const unread = rows.filter((r) => !r.readAt).length;

  /** Ao abrir a página: todas as notificações visíveis passam a lidas (sem toast). */
  useEffect(() => {
    if (!listQuery.isSuccess || !listQuery.data?.length) return;
    if (!listQuery.data.some((r) => !r.readAt)) return;
    markAllRead.mutate();
  }, [listQuery.isSuccess, listQuery.data, markAllRead]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notificações</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Alertas internos do CRM (ex.: fidelizações a terminar). Só vês as tuas mensagens.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-2"
          disabled={unread === 0 || markAllRead.isPending}
          onClick={() =>
            markAllRead.mutate(undefined, {
              onSuccess: () => toast.success("Todas marcadas como lidas"),
            })
          }
        >
          <CheckCheck className="h-4 w-4" aria-hidden />
          Marcar todas como lidas
        </Button>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Caixa de entrada</CardTitle>
          <CardDescription>
            {listQuery.isLoading ? "A carregar…" : `${rows.length} notificações (${unread} por ler)`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-0 divide-y px-0 pb-0">
          {listQuery.isLoading ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">A carregar…</p>
          ) : rows.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">Ainda não tens notificações.</p>
          ) : (
            rows.map((n) => {
              const isUnread = !n.readAt;
              const href = n.link?.trim();
              return (
                <div
                  key={n.id}
                  className={cn(
                    "flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-start sm:justify-between",
                    isUnread && "bg-primary/[0.04]",
                  )}
                >
                  <div className="min-w-0 space-y-1 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {n.type ? (
                        <Badge variant="secondary" className="text-[10px] font-normal uppercase">
                          {n.type}
                        </Badge>
                      ) : null}
                      {isUnread ? (
                        <Badge variant="default" className="text-[10px]">
                          Nova
                        </Badge>
                      ) : null}
                      <span className="text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: pt })}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">{n.message}</p>
                  </div>
                  <div className="flex shrink-0 flex-row gap-2 sm:flex-col">
                    {href?.startsWith("/") ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => setLocation(href)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        Abrir
                      </Button>
                    ) : null}
                    {isUnread ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={markRead.isPending}
                        onClick={() => markRead.mutate({ id: n.id })}
                      >
                        Marcar lida
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
