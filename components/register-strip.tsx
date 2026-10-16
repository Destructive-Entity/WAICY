import type { Vec } from "@/lib/cisa/vec";

const CELLS = 96;

/**
 * Draws the first components of a register as a diverging heat strip:
 * cobalt for negative, amber for positive, intensity for magnitude.
 */
export function RegisterStrip({ vector, label, caption, highlight }: { vector: Vec; label: string; caption?: string; highlight?: boolean }) {
  const scale = Math.sqrt(vector.length) / 2.5;
  const cells = Array.from({ length: CELLS }, (_, i) => vector[i] ?? 0);
  const energy = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 font-mono text-xs">
        <span className={highlight ? "font-semibold text-primary" : "text-muted-foreground"}>{label}</span>
        <span className="truncate text-muted-foreground">{energy === 0 ? "empty" : caption}</span>
      </div>
      <div
        className={`flex h-5 overflow-hidden rounded-sm border ${highlight ? "border-primary" : "border-border"}`}
        role="img"
        aria-label={`${label}: ${energy === 0 ? "empty register" : caption ?? "vector"}`}
      >
        {cells.map((v, i) => {
          const m = Math.min(1, Math.abs(v) * scale);
          const color = v >= 0 ? "var(--accent)" : "var(--primary)";
          return <span key={i} className="h-full flex-1" style={{ background: `color-mix(in oklab, ${color} ${Math.round(m * 100)}%, transparent)` }} />;
        })}
      </div>
    </div>
  );
}
