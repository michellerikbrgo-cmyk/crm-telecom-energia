import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type PriorityStarsProps = {
  value: number;
  onChange?: (value: number) => void;
  readonly?: boolean;
  size?: "sm" | "md";
};

export function PriorityStars({ value, onChange, readonly, size = "md" }: PriorityStarsProps) {
  const starClass = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";
  const v = Math.min(5, Math.max(1, Math.round(value) || 1));

  return (
    <div className="flex items-center gap-0.5" role={readonly ? "img" : "group"} aria-label={`Prioridade ${v} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= v;
        if (readonly) {
          return (
            <Star
              key={n}
              className={cn(starClass, filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/35")}
              aria-hidden
            />
          );
        }
        return (
          <button
            key={n}
            type="button"
            className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onChange?.(n)}
            aria-label={`Prioridade ${n}`}
          >
            <Star
              className={cn(starClass, filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")}
            />
          </button>
        );
      })}
    </div>
  );
}

export function PriorityStarsDisplay({ value, size = "sm" }: { value: number; size?: "sm" | "md" }) {
  return <PriorityStars value={value} readonly size={size} />;
}
