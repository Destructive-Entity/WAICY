"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, SkipForward } from "lucide-react";
import { assemble, disassemble, encode, hex, toBytecode, type Instruction } from "@/lib/cisa/isa";
import { answer, compileQuery, englishChainOfThought } from "@/lib/cisa/world";
import { zeros } from "@/lib/cisa/vec";
import { capitalize, DEMO_CHAIN, DEMO_START, demoWorld, runDemo } from "@/lib/demo";
import { RegisterStrip } from "@/components/register-strip";
import { QueryBuilder, type QueryState } from "./query-builder";
import { ComparePanel } from "./compare-panel";

const SHOWN_REGISTERS = 5;

function sourceFor(q: QueryState): string {
  const { world } = demoWorld();
  const prog = compileQuery(world, q.start, q.chain, { cleanEachHop: q.clean });
  return prog.map((i) => disassemble(i, world.lexicon)).join("\n");
}

export function Playground() {
  const { world } = demoWorld();
  const [query, setQuery] = useState<QueryState>({ start: DEMO_START, chain: DEMO_CHAIN, clean: true, noise: 0 });
  const [source, setSource] = useState(() => sourceFor(query));
  const [edited, setEdited] = useState(false);
  const [step, setStep] = useState<number | null>(null);

  const updateQuery = (q: QueryState) => {
    setQuery(q);
    setSource(sourceFor(q));
    setEdited(false);
    setStep(null);
  };

  const parsed = useMemo((): { program: Instruction[]; error: null } | { program: null; error: string } => {
    try {
      return { program: assemble(source, world.lexicon), error: null };
    } catch (e) {
      return { program: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [source, world.lexicon]);

  const result = useMemo(() => (parsed.program ? runDemo(parsed.program, { noise: query.noise }) : null), [parsed.program, query.noise]);
  const last = result ? result.trace.length - 1 : -1;
  const current = step === null ? last : Math.min(step, last);
  const traceStep = result && current >= 0 ? result.trace[current] : null;
  const registers = traceStep?.registers ?? Array.from({ length: SHOWN_REGISTERS }, () => zeros(world.lexicon.dim));
  const expected = answer(world, query.start, query.chain);
  const emitted = result?.output.at(-1);
  const finished = current === last;

  const readAs = (v: Float64Array) => {
    const best = world.lexicon.nearest(v, 1)[0];
    return best && best.sim > 0.3 ? `reads as ${capitalize(best.name)} (${best.sim.toFixed(2)})` : "superposition of many concepts";
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:gap-6">
      <div className="flex flex-col gap-4">
        <QueryBuilder value={query} onChange={updateQuery} entities={world.entities} relations={world.relations} />

        <section aria-labelledby="program-title" className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 id="program-title" className="text-sm font-semibold">
              2. The compiled program {edited && <span className="font-normal text-accent">(edited by you)</span>}
            </h2>
            {edited && (
              <button type="button" onClick={() => updateQuery(query)} className="text-xs text-primary underline-offset-4 hover:underline">
                Restore compiled
              </button>
            )}
          </div>
          <div className="grid grid-cols-[auto_minmax(0,1fr)] overflow-hidden rounded-md border border-border font-mono text-xs leading-6 md:text-sm">
            <ol className="flex flex-col border-r border-border bg-muted px-2 text-muted-foreground" aria-label="Machine code">
              {parsed.program
                ? parsed.program.map((ins, i) => (
                    <li key={i} className={traceStep && traceStep.pc === i ? "font-semibold text-primary" : undefined}>
                      {hex(encode(ins))}
                    </li>
                  ))
                : null}
            </ol>
            <label className="sr-only" htmlFor="asm">
              Assembly source
            </label>
            <textarea
              id="asm"
              value={source}
              spellCheck={false}
              onChange={(e) => {
                setSource(e.target.value);
                setEdited(true);
                setStep(null);
              }}
              rows={Math.max(8, source.split("\n").length)}
              className="w-full resize-y bg-card px-3 text-foreground outline-none"
            />
          </div>
          {parsed.error ? (
            <p role="alert" className="rounded-md border border-accent bg-accent/10 px-3 py-2 text-xs text-foreground">
              {parsed.error}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Edit freely. Symbols available: {world.relations.join(", ")}, and every person. Registers r0 to r15, memory bank @0.
            </p>
          )}
        </section>
      </div>

      <div className="flex flex-col gap-4">
        <section aria-labelledby="exec-title" className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="exec-title" className="text-sm font-semibold">
              3. Watch it think
            </h2>
            <div className="flex items-center gap-1" role="group" aria-label="Execution controls">
              <button type="button" onClick={() => setStep(-1)} className="inline-flex size-9 items-center justify-center rounded-md border border-border hover:bg-muted" aria-label="Reset to before the first instruction">
                <RotateCcw className="size-4" aria-hidden />
              </button>
              <button type="button" onClick={() => setStep(Math.max(-1, current - 1))} disabled={current < 0} className="inline-flex size-9 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-40" aria-label="Step back">
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <button type="button" onClick={() => setStep(Math.min(last, current + 1))} disabled={finished} className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40">
                Step <ChevronRight className="size-4" aria-hidden />
              </button>
              <button type="button" onClick={() => setStep(null)} disabled={finished} className="inline-flex size-9 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-40" aria-label="Run to the end">
                <SkipForward className="size-4" aria-hidden />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 font-mono text-xs md:text-sm" aria-live="polite">
            <span className="truncate">
              {traceStep ? `${String(current + 1).padStart(2, "0")}/${last + 1}  ${disassemble(traceStep.instruction, world.lexicon)}` : `00/${last + 1}  (not started)`}
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {registers.slice(0, SHOWN_REGISTERS).map((v, i) => (
              <RegisterStrip key={i} vector={v} label={`r${i}`} caption={readAs(v)} highlight={traceStep?.wrote === i} />
            ))}
            <p className="text-xs text-muted-foreground">First 96 of {world.lexicon.dim} dimensions. Amber is positive, cobalt is negative.</p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium uppercase tracking-wider text-muted-foreground">Confidence register C</span>
              <span className="font-mono tabular-nums">{(traceStep?.confidence ?? 0).toFixed(3)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={traceStep?.confidence ?? 0} aria-label="Confidence">
              <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.max(0, Math.min(1, traceStep?.confidence ?? 0)) * 100}%` }} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
            <span>
              Output:{" "}
              <span className="font-mono font-semibold text-accent">{finished && emitted ? capitalize(emitted.name) : "..."}</span>
            </span>
            {finished && emitted && !edited && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${emitted.name === expected ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"}`}>
                {emitted.name === expected ? "correct" : `wrong, expected ${capitalize(expected)}`}
              </span>
            )}
          </div>
        </section>

        {parsed.program && (
          <ComparePanel
            english={englishChainOfThought(world, query.start, query.chain)}
            cisaBytes={parsed.program.length * 4}
            bytecode={Array.from(toBytecode(parsed.program), (b) => b.toString(16).padStart(2, "0")).join(" ")}
          />
        )}
      </div>
    </div>
  );
}
