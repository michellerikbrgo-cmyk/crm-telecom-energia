import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo, useRef } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const goOnlineMutation = trpc.session.goOnline.useMutation();
  const goOfflineMutation = trpc.session.goOffline.useMutation();

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(
    () => ({
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    }),
    [
      meQuery.data,
      meQuery.error,
      meQuery.isLoading,
      logoutMutation.error,
      logoutMutation.isPending,
    ],
  );

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  /**
   * Presence: uma vez por utilizador autenticado.
   * NÃO incluir `goOnlineMutation`/`goOfflineMutation` nas deps — no tRPC/React Query a
   * identidade do objecto mutation pode mudar a cada render e provoca loop infinito
   * (stack minificado tm/Qt no react-vendor).
   */
  const presenceUserId = meQuery.data?.id;
  const presenceBootstrappedFor = useRef<number | null>(null);

  useEffect(() => {
    if (presenceUserId == null || typeof presenceUserId !== "number") {
      presenceBootstrappedFor.current = null;
      return;
    }
    if (presenceBootstrappedFor.current === presenceUserId) {
      return;
    }
    presenceBootstrappedFor.current = presenceUserId;
    goOnlineMutation.mutate();

    const onUnload = () => {
      goOfflineMutation.mutate();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ver comentário acima (mutations instáveis nas deps)
  }, [presenceUserId]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
