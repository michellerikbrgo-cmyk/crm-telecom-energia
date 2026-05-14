import { useState } from "react";
import { useLocation } from "wouter";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale/pt";

export function NotificationBell() {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const countQuery = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 45_000,
  });
  const listQuery = trpc.notifications.list.useQuery(undefined, {
    enabled: open,
    staleTime: 10_000,
  });

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      void utils.notifications.list.invalidate();
      void utils.notifications.unreadCount.invalidate();
    },
  });

  const unread = (listQuery.data ?? []).filter((n) => !n.readAt).slice(0, 8);
  const nUnread = countQuery.data ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="icon" className="relative shrink-0" aria-label="Notificações">
          <Bell className="h-4 w-4" aria-hidden />
          {nUnread > 0 ? (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1 flex items-center justify-center text-[10px] p-0"
            >
              {nUnread > 99 ? "99+" : nUnread}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notificações</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setLocation("/notificacoes")}
          >
            Ver todas
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {listQuery.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">A carregar…</p>
          ) : unread.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Sem notificações por ler.</p>
          ) : (
            <ul className="divide-y">
              {unread.map((n) => (
                <li key={n.id} className="px-3 py-2 hover:bg-muted/50">
                  <button
                    type="button"
                    className="w-full text-left text-sm"
                    onClick={() => {
                      markRead.mutate({ id: n.id });
                      const href = n.link?.trim();
                      if (href?.startsWith("/")) {
                        setLocation(href);
                        setOpen(false);
                      }
                    }}
                  >
                    <p className="line-clamp-3 text-foreground/90">{n.message}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: pt })}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
