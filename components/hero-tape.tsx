"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { RegisterStrip } from "./register-strip";
import { capitalize, DEMO_START, defaultDemoProgram, demoWorld, listing, runDemo } from "@/lib/demo";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

export function HeroTape() {
  const { program, rows, trace, output, names } = useMemo(() => {
    const program = defaultDemoProgram();
    const res = runDemo(program);
    const { world } = demoWorld();
    const names = res.trace.map((t) =>
      (t.registers ?? []).slice(0, 4).map((r) => {
        const best = world.lexicon.nearest(r, 1)[0];
        return best && best.sim > 0.3 ? `${capitalize(best.name)} ${best.sim.toFixed(2)}` : "superposition";
      }),
    );
    return { program, rows: listing(program), trace: res.trace, output: res.output[0], names };
  }, []);

  const reducedMotion = usePrefersReducedMotion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setInterval(() => setTick((s) => (s + 1) % (trace.length + 4)), 900);
    return () => window.clearInterval(id);
  }, [trace.length, reducedMotion]);

  const step = reducedMotion ? trace.length : tick;
  const shown = Math.min(step, trace.length - 1);
  const current = trace[shown];
  const regs = current.registers ?? [];
  const question = `Who is the rival of ${capitalize(DEMO_START)}'s mentor?`;

  return (
    <figure className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm md:p-5" aria-label="Animated CISA program answering a two-hop question">
      <figcaption className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">live program</span>
        <span className="text-pretty text-sm font-medium">{question}</span>
      </figcaption>
      <ol className="flex flex-col font-mono text-xs leading-6 md:text-sm">
        {rows.map((r, i) => {
          const active = i === current.pc && step < trace.length;
          const done = i < current.pc || step >= trace.length;
          return (
            <li
              key={i}
              className={`flex gap-3 rounded-sm px-2 transition-colors ${active ? "bg-primary text-primary-foreground" : done ? "text-foreground" : "text-muted-foreground/60"}`}
            >
              <span className={active ? "" : "text-muted-foreground"}>{r.hex}</span>
              <span className="whitespace-pre">{r.text}</span>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-col gap-2">
        {regs.slice(0, 4).map((v, i) => (
          <RegisterStrip key={i} vector={v} label={`r${i}`} caption={names[shown][i]} highlight={current.wrote === i} />
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border pt-3 font-mono text-xs">
        <span className="text-muted-foreground">{program.length * 4} bytes of bytecode</span>
        <span>
          EMIT &rarr; <span className="font-semibold text-accent">{step >= trace.length - 2 ? capitalize(output.name) : "..."}</span>
        </span>
      </div>
    </figure>
  );
}
