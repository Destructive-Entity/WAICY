import { CisaVM } from "@/lib/cisa/vm";
import { compileQuery, answer, type World } from "@/lib/cisa/world";
import { rng, type Vec } from "@/lib/cisa/vec";

export function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

export function round(x: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

export function timed<T>(fn: () => T): { value: T; ms: number } {
  const t0 = performance.now();
  const value = fn();
  return { value, ms: performance.now() - t0 };
}

export interface HopQuery {
  start: string;
  chain: string[];
}

export function sampleQueries(w: World, hops: number, n: number, seed: number): HopQuery[] {
  const rand = rng(seed);
  return Array.from({ length: n }, () => ({
    start: pick(w.entities, rand),
    chain: Array.from({ length: hops }, () => pick(w.relations, rand)),
  }));
}

/** Every (head, relation) pair once: exhaustive one-hop evaluation. */
export function allOneHop(w: World, limit = Infinity): HopQuery[] {
  const out: HopQuery[] = [];
  for (const r of w.relations) for (const h of w.entities) out.push({ start: h, chain: [r] });
  return out.slice(0, limit);
}

export function runQueries(
  w: World,
  memory: Vec[],
  queries: HopQuery[],
  opts: { cleanEachHop?: boolean; sharded?: boolean; noise?: number; seed?: number; shift?: number } = {},
): { accuracy: number; meanConfidence: number } {
  let ok = 0;
  let conf = 0;
  queries.forEach((q, i) => {
    const vm = new CisaVM(w.lexicon, { noise: opts.noise, seed: (opts.seed ?? 1) * 1000 + i, cleanupPool: w.entityIds });
    vm.memory = memory.map((m) => m);
    const res = vm.run(compileQuery(w, q.start, q.chain, opts));
    const out = res.output[0];
    if (out?.name === answer(w, q.start, q.chain)) ok++;
    conf += out?.sim ?? 0;
  });
  return { accuracy: ok / queries.length, meanConfidence: conf / queries.length };
}

/** Area under the ROC curve: probability a random correct answer has higher confidence than a random wrong one. */
export function auroc(scores: Array<{ score: number; positive: boolean }>): number {
  const pos = scores.filter((s) => s.positive).map((s) => s.score);
  const neg = scores.filter((s) => !s.positive).map((s) => s.score);
  if (!pos.length || !neg.length) return NaN;
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}
