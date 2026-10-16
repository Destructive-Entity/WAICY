"use client";

import { Minus, Plus } from "lucide-react";
import { capitalize } from "@/lib/demo";

export interface QueryState {
  start: string;
  chain: string[];
  clean: boolean;
  noise: number;
}

const selectClass =
  "h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary";

export function QueryBuilder({
  value,
  onChange,
  entities,
  relations,
}: {
  value: QueryState;
  onChange: (q: QueryState) => void;
  entities: string[];
  relations: string[];
}) {
  const setChain = (chain: string[]) => onChange({ ...value, chain });
  const question = `Who is the ${[...value.chain].reverse().map((r) => r.replace("_", " ")).join(" of the ")} of ${capitalize(value.start)}?`;

  return (
    <section aria-labelledby="builder-title" className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-1">
        <h2 id="builder-title" className="text-sm font-semibold">
          1. Ask a question
        </h2>
        <p className="text-pretty text-sm text-muted-foreground">{question}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Start at</span>
          <select className={selectClass} value={value.start} onChange={(e) => onChange({ ...value, start: e.target.value })}>
            {entities.map((e) => (
              <option key={e} value={e}>
                {capitalize(e)}
              </option>
            ))}
          </select>
        </label>
        {value.chain.map((rel, i) => (
          <label key={i} className="flex items-center gap-2 text-sm">
            <span aria-hidden className="text-muted-foreground">
              &rarr;
            </span>
            <span className="sr-only">Hop {i + 1} relation</span>
            <select className={selectClass} value={rel} onChange={(e) => setChain(value.chain.map((r, j) => (j === i ? e.target.value : r)))}>
              {relations.map((r) => (
                <option key={r} value={r}>
                  {r.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
        ))}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setChain(value.chain.slice(0, -1))}
            disabled={value.chain.length <= 1}
            className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
            aria-label="Remove last hop"
          >
            <Minus className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setChain([...value.chain, relations[value.chain.length % relations.length]])}
            disabled={value.chain.length >= 6}
            className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
            aria-label="Add a hop"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={value.clean} onChange={(e) => onChange({ ...value, clean: e.target.checked })} className="size-4 accent-primary" />
          <span>CLEAN after every hop</span>
        </label>
        <label className="flex flex-1 items-center gap-3 text-sm">
          <span className="whitespace-nowrap text-muted-foreground">Register noise</span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.25}
            value={value.noise}
            onChange={(e) => onChange({ ...value, noise: Number(e.target.value) })}
            className="w-full accent-primary"
          />
          <span className="w-10 text-right font-mono tabular-nums">{value.noise.toFixed(2)}</span>
        </label>
      </div>
    </section>
  );
}
