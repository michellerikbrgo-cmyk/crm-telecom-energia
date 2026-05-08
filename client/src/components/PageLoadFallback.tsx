import { Skeleton } from "@/components/ui/skeleton";

/** Conteúdo principal enquanto um chunk de página carrega (sidebar já visível). */
export function PageLoadFallback() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="A carregar página">
      <Skeleton className="h-9 w-56 max-w-full" />
      <Skeleton className="h-[min(420px,60vh)] w-full rounded-lg" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg sm:col-span-2 lg:col-span-1" />
      </div>
    </div>
  );
}
