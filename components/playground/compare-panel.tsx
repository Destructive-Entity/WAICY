import { approxTokens } from "@/lib/cisa/world";

export function ComparePanel({ english, cisaBytes, bytecode }: { english: string; cisaBytes: number; bytecode: string }) {
  const englishBytes = new TextEncoder().encode(english).length;
  const tokens = approxTokens(english);
  return (
    <section aria-labelledby="compare-title" className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <h2 id="compare-title" className="text-sm font-semibold">
        Same reasoning, two languages
      </h2>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-medium uppercase tracking-wider text-muted-foreground">English chain of thought</span>
          <span className="font-mono">
            {englishBytes} B &middot; ~{tokens} tokens
          </span>
        </div>
        <p className="whitespace-pre-line rounded-md bg-muted p-3 text-sm leading-relaxed">{english}</p>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-medium uppercase tracking-wider text-muted-foreground">CISA bytecode</span>
          <span className="font-mono">{cisaBytes} B</span>
        </div>
        <p className="break-all rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">{bytecode}</p>
      </div>
      <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
        The English needs about {(englishBytes / Math.max(1, cisaBytes)).toFixed(1)}x the bytes and has to be re-read by a language model one token at a
        time. The bytecode runs directly, and every step can still be disassembled and audited.
      </p>
    </section>
  );
}
