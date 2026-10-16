import { cosine, randomVec, rng, type Vec } from "./vec";
import type { SymbolTable } from "./isa";

/**
 * The lexicon is CISA's long-lived vocabulary of atomic concepts. Each name
 * maps to a random high-dimensional vector. CLEAN and EMIT snap noisy
 * register contents back onto the nearest entry, which acts like the
 * error-correcting attractor of the architecture.
 */
export class Lexicon implements SymbolTable {
  readonly names: string[] = [];
  readonly vectors: Vec[] = [];
  private readonly index = new Map<string, number>();
  private readonly rand: () => number;

  constructor(
    readonly dim: number,
    seed = 1,
  ) {
    this.rand = rng(seed);
  }

  /** Returns the id of `name`, creating a fresh random vector the first time. */
  intern(name: string): number {
    const existing = this.index.get(name);
    if (existing !== undefined) return existing;
    if (this.names.length >= 4096) throw new RangeError("Lexicon is full (12-bit symbol ids)");
    const id = this.names.length;
    this.names.push(name);
    this.vectors.push(randomVec(this.dim, this.rand));
    this.index.set(name, id);
    return id;
  }

  has(name: string): boolean {
    return this.index.has(name);
  }

  get(name: string): Vec {
    return this.vectors[this.intern(name)];
  }

  idOf(name: string): number {
    const id = this.index.get(name);
    if (id === undefined) throw new Error(`Unknown symbol "${name}"`);
    return id;
  }

  nameOf(id: number): string {
    return this.names[id] ?? `?${id}`;
  }

  get size(): number {
    return this.names.length;
  }

  /** Nearest neighbours by cosine similarity, optionally restricted to a candidate set. */
  nearest(v: Vec, k = 1, candidates?: ReadonlyArray<number>): Array<{ id: number; name: string; sim: number }> {
    const pool = candidates ?? this.vectors.map((_, i) => i);
    const scored = pool.map((id) => ({ id, name: this.names[id], sim: cosine(v, this.vectors[id]) }));
    scored.sort((x, y) => y.sim - x.sim);
    return scored.slice(0, k);
  }
}
