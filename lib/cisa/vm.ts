import { decodeScalar, signExtend, REGISTER_COUNT, type Instruction } from "./isa";
import type { Lexicon } from "./lexicon";
import { add, addInPlace, bind, cosine, gaussian, normalize, permute, rng, scale, unbind, zeros, type Vec } from "./vec";

export interface VMOptions {
  /** Standard deviation of Gaussian noise added to every register write (per component, relative to 1/sqrt(d)). */
  noise?: number;
  seed?: number;
  maxSteps?: number;
  /** Restrict CLEAN / EMIT to these lexicon ids (a "working vocabulary"). */
  cleanupPool?: ReadonlyArray<number>;
  /** Record register snapshots on every step (used by the visual debugger). */
  trace?: boolean;
}

export interface TraceStep {
  pc: number;
  instruction: Instruction;
  confidence: number;
  /** Which register was written, if any. */
  wrote: number | null;
  registers?: Vec[];
  emitted?: { name: string; sim: number };
}

export interface RunResult {
  output: Array<{ name: string; sim: number }>;
  confidence: number;
  steps: number;
  trace: TraceStep[];
  registers: Vec[];
}

/**
 * The CISA virtual machine. Opcodes are discrete and inspectable; the data they
 * move around is continuous. One instruction = one cognitive micro-operation.
 */
export class CisaVM {
  regs: Vec[];
  /**
   * Confidence register C. SIM sets it to a cosine in [-1, 1]. CLEAN sets it to
   * the recognition margin 1 - s2/s1 in [0, 1], where s1 and s2 are the best
   * and second-best lexicon similarities: near 1 when one concept clearly wins,
   * near 0 when two candidates are tied.
   */
  confidence = 0;
  /** Raw cosine of the last CLEAN / EMIT winner (kept for analysis and the debugger). */
  similarity = 0;
  memory: Vec[];
  pc = 0;
  private readonly rand: () => number;

  constructor(
    readonly lexicon: Lexicon,
    readonly options: VMOptions = {},
  ) {
    const d = lexicon.dim;
    this.regs = Array.from({ length: REGISTER_COUNT }, () => zeros(d));
    this.memory = [];
    this.rand = rng(options.seed ?? 7);
  }

  bank(id: number): Vec {
    while (this.memory.length <= id) this.memory.push(zeros(this.lexicon.dim));
    return this.memory[id];
  }

  /** Directly preload a register (used by tasks to provide input percepts). */
  setRegister(r: number, v: Vec): void {
    this.regs[r] = Float64Array.from(v);
  }

  private write(r: number, v: Vec): void {
    const sigma = this.options.noise ?? 0;
    if (sigma > 0) {
      const s = sigma / Math.sqrt(v.length);
      const noisy = new Float64Array(v.length);
      for (let i = 0; i < v.length; i++) noisy[i] = v[i] + gaussian(this.rand) * s;
      this.regs[r] = noisy;
    } else {
      this.regs[r] = v;
    }
  }

  private clean(v: Vec): { id: number; name: string; sim: number; margin: number } {
    const [best, second] = this.lexicon.nearest(v, 2, this.options.cleanupPool);
    if (!best) return { id: -1, name: "?", sim: 0, margin: 0 };
    const margin = best.sim > 0 ? Math.max(0, 1 - Math.max(0, second?.sim ?? 0) / best.sim) : 0;
    this.similarity = best.sim;
    return { ...best, margin };
  }

  run(program: Instruction[]): RunResult {
    const maxSteps = this.options.maxSteps ?? 10_000;
    const output: Array<{ name: string; sim: number }> = [];
    const trace: TraceStep[] = [];
    let steps = 0;
    this.pc = 0;

    while (this.pc < program.length && steps < maxSteps) {
      const pcAtStart = this.pc;
      const i = program[this.pc];
      let wrote: number | null = null;
      let emitted: { name: string; sim: number } | undefined;
      this.pc++;
      steps++;

      switch (i.op) {
        case "NOP":
          break;
        case "LOAD":
          this.write(i.dst, Float64Array.from(this.lexicon.vectors[i.imm]));
          wrote = i.dst;
          break;
        case "BIND":
          this.write(i.dst, bind(this.regs[i.a], this.regs[i.b]));
          wrote = i.dst;
          break;
        case "UNBIND":
          this.write(i.dst, unbind(this.regs[i.a], this.regs[i.b]));
          wrote = i.dst;
          break;
        case "BUNDLE":
          this.write(i.dst, add(this.regs[i.a], this.regs[i.b], decodeScalar(i.imm)));
          wrote = i.dst;
          break;
        case "PERM":
          this.write(i.dst, permute(this.regs[i.a], signExtend(i.imm)));
          wrote = i.dst;
          break;
        case "CLEAN": {
          const best = this.clean(this.regs[i.a]);
          this.confidence = best.margin;
          this.write(i.dst, best.id >= 0 ? Float64Array.from(this.lexicon.vectors[best.id]) : zeros(this.lexicon.dim));
          wrote = i.dst;
          break;
        }
        case "SIM":
          this.confidence = cosine(this.regs[i.a], this.regs[i.b]);
          break;
        case "GATE":
          this.write(i.dst, scale(this.regs[i.a], this.confidence));
          wrote = i.dst;
          break;
        case "BLEND": {
          const c = Math.max(0, Math.min(1, this.confidence));
          this.write(i.dst, add(scale(this.regs[i.a], c), this.regs[i.b], 1 - c));
          wrote = i.dst;
          break;
        }
        case "SCALE":
          this.write(i.dst, scale(this.regs[i.a], decodeScalar(i.imm)));
          wrote = i.dst;
          break;
        case "RECALL":
          this.write(i.dst, unbind(this.regs[i.a], this.bank(i.imm)));
          wrote = i.dst;
          break;
        case "STORE":
          addInPlace(this.bank(i.imm), this.regs[i.a]);
          break;
        case "NORM":
          this.write(i.dst, normalize(this.regs[i.a]));
          wrote = i.dst;
          break;
        case "BRC":
          if (this.confidence < i.a / 15) this.pc = i.imm;
          break;
        case "EMIT": {
          const best = this.clean(this.regs[i.a]);
          emitted = { name: best.name, sim: best.sim };
          output.push(emitted);
          break;
        }
        case "MOV":
          this.write(i.dst, Float64Array.from(this.regs[i.a]));
          wrote = i.dst;
          break;
        case "HALT":
          this.pc = program.length;
          break;
      }

      trace.push({
        pc: pcAtStart,
        instruction: i,
        confidence: this.confidence,
        wrote,
        emitted,
        registers: this.options.trace ? this.regs.map((r) => Float64Array.from(r)) : undefined,
      });
    }

    return { output, confidence: this.confidence, steps, trace, registers: this.regs };
  }
}
