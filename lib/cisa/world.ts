import { encodeScalar, encodeSigned, ins, type Instruction } from "./isa";
import { Lexicon } from "./lexicon";
import { addInPlace, bind, permute, rng, zeros, type Vec } from "./vec";

const FIRST = [
  "ada", "bo", "cyr", "dee", "eli", "fen", "gus", "hana", "ivo", "jun", "kai", "lio", "mae", "nia", "oto", "pia",
  "quin", "rae", "sol", "tia", "uma", "vic", "wen", "xan", "yara", "zed", "aiko", "bram", "cleo", "dax", "esme", "faye",
  "gil", "hugo", "isla", "jax", "kira", "luca", "mira", "nova", "orin", "pax", "rhea", "sage", "taro", "uri", "vera", "wynn",
];

export const RELATIONS = ["mentor", "rival", "sibling", "neighbor", "teammate", "pen_pal"] as const;

export interface World {
  lexicon: Lexicon;
  entities: string[];
  relations: string[];
  /** facts[rel][head] = tail */
  facts: Map<string, Map<string, string>>;
  entityIds: number[];
}

/**
 * A synthetic social world: every entity has exactly one tail per relation.
 * Synthetic so that no answer can be guessed from prior knowledge, which keeps
 * the measurement about the architecture rather than memorised trivia.
 */
export function makeWorld(opts: { dim: number; entities: number; relations: number; seed?: number }): World {
  const seed = opts.seed ?? 1;
  const lexicon = new Lexicon(opts.dim, seed);
  const rand = rng(seed * 7919 + 13);
  const entities: string[] = [];
  for (let i = 0; i < opts.entities; i++) {
    const base = FIRST[i % FIRST.length];
    entities.push(i < FIRST.length ? base : `${base}${Math.floor(i / FIRST.length)}`);
  }
  const relations = RELATIONS.slice(0, opts.relations).map(String);
  relations.forEach((r) => lexicon.intern(r));
  const entityIds = entities.map((e) => lexicon.intern(e));

  const facts = new Map<string, Map<string, string>>();
  for (const r of relations) {
    const m = new Map<string, string>();
    for (const h of entities) {
      let t = h;
      while (t === h) t = entities[Math.floor(rand() * entities.length)];
      m.set(h, t);
    }
    facts.set(r, m);
  }
  return { lexicon, entities, relations, facts, entityIds };
}

export function factCount(w: World): number {
  return w.relations.length * w.entities.length;
}

/**
 * Encoding of one fact: (rel (*) head) (*) P(tail), P a fixed random permutation.
 *
 * The permutation matters. Binding is commutative, so without it the fact
 * (rel, x, y) and the fact (rel, y, x) are the same vector and a query for
 * "the rival of x" also retrieves "whoever has x as their rival". A cyclic
 * rotation does not fix this, because rotation commutes with convolution.
 * Both are measured in experiments/run.ts as the "aliasing" ablation.
 */
export const TAIL_SHIFT = 1;

export function factVector(w: World, rel: string, head: string, tail: string, shift = TAIL_SHIFT): Vec {
  return bind(bind(w.lexicon.get(rel), w.lexicon.get(head)), permute(w.lexicon.get(tail), shift));
}

/**
 * Builds the memory banks. With `sharded`, each relation gets its own bank so
 * fewer facts are superposed per vector (higher fidelity, more memory).
 */
export function buildMemory(w: World, sharded: boolean, shift = TAIL_SHIFT): Vec[] {
  const banks = sharded ? w.relations.map(() => zeros(w.lexicon.dim)) : [zeros(w.lexicon.dim)];
  w.relations.forEach((rel, ri) => {
    for (const [head, tail] of w.facts.get(rel)!) addInPlace(banks[sharded ? ri : 0], factVector(w, rel, head, tail, shift));
  });
  return banks;
}

/** The same memory, written as a CISA program (STORE). Used by the demo to show memory is also code. */
export function compileStore(w: World, rel: string, head: string, tail: string, bank = 0): Instruction[] {
  const L = w.lexicon;
  return [
    ins("LOAD", { dst: 1, imm: L.idOf(rel) }),
    ins("LOAD", { dst: 2, imm: L.idOf(head) }),
    ins("BIND", { dst: 3, a: 1, b: 2 }),
    ins("LOAD", { dst: 2, imm: L.idOf(tail) }),
    ins("PERM", { dst: 2, a: 2, imm: encodeSigned(TAIL_SHIFT) }),
    ins("BIND", { dst: 3, a: 3, b: 2 }),
    ins("STORE", { a: 3, imm: bank }),
  ];
}

export interface QueryOptions {
  /** Snap to the lexicon after every hop (error correction). */
  cleanEachHop?: boolean;
  sharded?: boolean;
  /** Tail rotation used when the memory was written. 0 reproduces the aliasing ablation. */
  shift?: number;
}

/**
 * Compiles "the r_k of ... the r_1 of x" into CISA. Each hop is 5 opcodes:
 * evoke the relation, bind it to the current entity, query memory, undo the
 * tail rotation, recognise.
 */
export function compileQuery(w: World, start: string, chain: string[], opts: QueryOptions = {}): Instruction[] {
  const L = w.lexicon;
  const clean = opts.cleanEachHop ?? true;
  const shift = opts.shift ?? TAIL_SHIFT;
  const prog: Instruction[] = [ins("LOAD", { dst: 0, imm: L.idOf(start) })];
  chain.forEach((rel) => {
    const bank = opts.sharded ? w.relations.indexOf(rel) : 0;
    prog.push(ins("LOAD", { dst: 1, imm: L.idOf(rel) }));
    prog.push(ins("BIND", { dst: 2, a: 1, b: 0 }));
    prog.push(ins("RECALL", { dst: 3, a: 2, imm: bank }));
    if (shift !== 0) prog.push(ins("PERM", { dst: 3, a: 3, imm: encodeSigned(-shift) }));
    prog.push(clean ? ins("CLEAN", { dst: 0, a: 3 }) : ins("MOV", { dst: 0, a: 3 }));
  });
  prog.push(ins("EMIT", { a: 0 }));
  prog.push(ins("HALT"));
  return prog;
}

/**
 * Metacognitive variant: try the cheap shared bank first, and only if the
 * confidence register is below `threshold` re-ask the sharded bank.
 */
export function compileAdaptiveHop(w: World, rel: string, threshold: number): Instruction[] {
  const L = w.lexicon;
  const shard = 1 + w.relations.indexOf(rel);
  const t = Math.max(0, Math.min(15, Math.round(threshold * 15)));
  const unshift = encodeSigned(-TAIL_SHIFT);
  return [
    ins("LOAD", { dst: 1, imm: L.idOf(rel) }),
    ins("BIND", { dst: 2, a: 1, b: 0 }),
    ins("RECALL", { dst: 3, a: 2, imm: 0 }),
    ins("PERM", { dst: 3, a: 3, imm: unshift }),
    ins("CLEAN", { dst: 4, a: 3 }),
    ins("BRC", { a: t, imm: 7 }),
    ins("HALT"),
    ins("RECALL", { dst: 3, a: 2, imm: shard }),
    ins("PERM", { dst: 3, a: 3, imm: unshift }),
    ins("CLEAN", { dst: 4, a: 3 }),
  ];
}

export function answer(w: World, start: string, chain: string[]): string {
  let cur = start;
  for (const rel of chain) cur = w.facts.get(rel)!.get(cur)!;
  return cur;
}

/** The natural-language chain of thought a language model would write for the same query. */
export function englishChainOfThought(w: World, start: string, chain: string[]): string {
  const question = `Question: Who is the ${[...chain].reverse().map((r) => r.replace("_", " ")).join(" of the ")} of ${cap(start)}?`;
  const steps: string[] = [];
  let cur = start;
  for (const rel of chain) {
    const next = w.facts.get(rel)!.get(cur)!;
    steps.push(`The ${rel.replace("_", " ")} of ${cap(cur)} is ${cap(next)}.`);
    cur = next;
  }
  return `${question}\nLet's think step by step. ${steps.join(" ")} So the answer is ${cap(cur)}.`;
}

/**
 * Approximate token count of English text for a GPT-style BPE tokenizer.
 * Pre-tokenises like GPT-2 (words, numbers, punctuation) and charges extra
 * tokens for long or rare words. This is an estimate, documented as such.
 */
export function approxTokens(text: string): number {
  const pieces = text.match(/'s|'t|'re|'ve|'m|'ll|'d| ?[A-Za-z]+| ?\d+| ?[^\sA-Za-z\d]+|\s+(?!\S)|\s+/g) ?? [];
  let n = 0;
  for (const p of pieces) {
    const w = p.trim();
    if (!w) continue;
    n += /^[A-Za-z]+$/.test(w) ? Math.max(1, Math.ceil(w.length / 6)) : 1;
  }
  return n;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ------------------------------------------------------------------------- */
/* Structured records and analogy                                            */
/* ------------------------------------------------------------------------- */

export interface RecordWorld {
  lexicon: Lexicon;
  roles: string[];
  /** records[name][role] = filler */
  records: Map<string, Map<string, string>>;
}

/**
 * Records like { capital: x, currency: y, ... } stored as a single superposed
 * vector sum_i role_i (*) filler_i. Analogy ("what is the dollar of Mexico?")
 * then takes three opcodes, no training at all.
 */
export function makeRecordWorld(opts: { dim: number; records: number; roles: number; seed?: number }): RecordWorld {
  const lexicon = new Lexicon(opts.dim, opts.seed ?? 3);
  const roles = Array.from({ length: opts.roles }, (_, i) => `role${i}`);
  roles.forEach((r) => lexicon.intern(r));
  const records = new Map<string, Map<string, string>>();
  for (let r = 0; r < opts.records; r++) {
    const m = new Map<string, string>();
    roles.forEach((role, i) => {
      const filler = `f${r}_${i}`;
      lexicon.intern(filler);
      m.set(role, filler);
    });
    records.set(`rec${r}`, m);
  }
  return { lexicon, roles, records };
}

/** Writes record `name` into register `dst` using only CISA opcodes. */
export function compileRecord(rw: RecordWorld, name: string, dst: number): Instruction[] {
  const L = rw.lexicon;
  const out: Instruction[] = [ins("SCALE", { dst, a: dst, imm: encodeScalar(0) })];
  for (const [role, filler] of rw.records.get(name)!) {
    out.push(ins("LOAD", { dst: 1, imm: L.idOf(role) }));
    out.push(ins("LOAD", { dst: 2, imm: L.idOf(filler) }));
    out.push(ins("BIND", { dst: 3, a: 1, b: 2 }));
    out.push(ins("BUNDLE", { dst, a: dst, b: 3, imm: encodeScalar(1) }));
  }
  return out;
}

/**
 * "fillerA is to recA as ? is to recB". Assumes recA in r4 and recB in r5.
 * UNBIND recovers the hidden role, CLEAN snaps it, UNBIND again reads recB.
 */
export function compileAnalogy(rw: RecordWorld, fillerA: string, cleanRole = true): Instruction[] {
  const L = rw.lexicon;
  return [
    ins("LOAD", { dst: 1, imm: L.idOf(fillerA) }),
    ins("UNBIND", { dst: 2, a: 1, b: 4 }),
    cleanRole ? ins("CLEAN", { dst: 2, a: 2 }) : ins("NOP"),
    ins("UNBIND", { dst: 3, a: 2, b: 5 }),
    ins("EMIT", { a: 3 }),
    ins("HALT"),
  ];
}
