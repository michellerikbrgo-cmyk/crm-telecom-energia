import { trpc } from "@/lib/trpc";
import { useEffect, useRef, useState } from "react";
import { Redirect, useLocation } from "wouter";

const MESSAGE = "Grandes conquistas começam com uma ligação. Já falta pouco.";
const DURATION_MS = 3200;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export default function IndexSplash() {
  const [, setLocation] = useLocation();
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number>(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (me.isLoading || me.data) return;
    if (startedRef.current) return;
    startedRef.current = true;

    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / DURATION_MS);
      const p = easeOutCubic(t) * 100;
      setProgress(p);
      if (t >= 1) {
        setProgress(100);
        setLocation("/login");
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [me.isLoading, me.data, setLocation]);

  if (me.data) {
    return <Redirect to="/painel" />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[linear-gradient(145deg,#5a0000_0%,#e60000_42%,#9a0000_100%)] text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(ellipse 70% 50% at 50% 100%,rgba(255,255,255,0.15),transparent)",
        }}
      />
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-12 pt-16">
        <p className="max-w-lg text-center text-lg font-medium leading-relaxed tracking-tight text-white/95 md:text-xl">
          {MESSAGE}
        </p>

        <div className="mt-12 w-full max-w-md px-2">
          <div className="mb-3 flex justify-between text-sm tabular-nums text-white/80">
            <span>A preparar CRM</span>
            <span className="font-semibold">{Math.round(progress)}%</span>
          </div>
          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-black/25 ring-1 ring-white/15"
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progresso de carregamento"
          >
            <div
              className="h-full rounded-full bg-white shadow-[0_0_20px_rgba(255,255,255,0.35)] transition-[width] duration-150 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
