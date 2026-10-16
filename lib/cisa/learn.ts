import { argmax, decodeLoss, softClean, softCleanBackward, softmax, softmaxBackward, type CleanCache } from "./soft";
import { bind, gaussian, permute, rng, unbind, type Vec } from "./vec";

/**
 * Continuous operand learning.
 *
 * The opcodes of a CISA program stay symbolic (LOAD / BIND / RECALL / CLEAN),
 * but the operand of each hop is a free vector instead of a lexicon symbol.
 * Because RECALL is linear in its key, fitting a one-hop operand to examples
 * is close to a convex problem.
 *
 * Two parameterisations are compared in the experiments:
 *  - "free": the key is an unconstrained d-dimensional vector. Expressive, but
 *    it can memorise the noise of the superposed memory and fail to generalise.
 *  - "symbolic": the key is a soft LOAD, i.e. a probability distribution over
 *    lexicon symbols (k = sum_j p_j * lexicon_j). Hardening it with argmax
 *    yields a plain `LOAD #symbol`, so what was learned is directly readable.
 */

export interface OperandExample {
  input: Vec;
  /** Index of the correct answer in the codebook. */
  target: number;
}

export interface OperandLearnerConfig {
  hops: number;
  dim: number;
  memory: Vec;
  /** Unit-normalised codebook for soft CLEAN between hops and for decoding. */
  codebook: Vec[];
  seed?: number;
  cleanBeta?: number;
  decodeBeta?: number;
  param?: "free" | "symbolic";
  /** Raw (not normalised) lexicon vectors used by the symbolic parameterisation. */
  lexicon?: Vec[];
  /** Tail rotation used when the memory was written (undone after each recall). */
  shift?: number;
}

interface HopCache {
  input: Vec;
  query: Vec;
  recalled: Vec;
  clean?: CleanCache;
}

export class OperandLearner {
  /** Trainable parameters per hop: the key itself (free) or logits over the lexicon (symbolic). */
  readonly params: Vec[];
  private readonly m: Vec[];
  private readonly v: Vec[];
  private t = 0;

  constructor(readonly cfg: OperandLearnerConfig) {
    const rand = rng(cfg.seed ?? 1);
    if (this.symbolic) {
      if (!cfg.lexicon?.length) throw new Error("symbolic parameterisation needs a lexicon");
      const n = cfg.lexicon.length;
      this.params = Array.from({ length: cfg.hops }, () => Float64Array.from({ length: n }, () => gaussian(rand) * 0.01));
    } else {
      const s = 0.1 / Math.sqrt(cfg.dim);
      this.params = Array.from({ length: cfg.hops }, () => Float64Array.from({ length: cfg.dim }, () => gaussian(rand) * s));
    }
    this.m = this.params.map((k) => new Float64Array(k.length));
    this.v = this.params.map((k) => new Float64Array(k.length));
  }

  private get symbolic(): boolean {
    return this.cfg.param === "symbolic";
  }

  /** The operand vectors currently used by each hop. */
  get keys(): Vec[] {
    if (!this.symbolic) return this.params;
    return this.params.map((z) => {
      const p = softmax(z);
      const k = new Float64Array(this.cfg.dim);
      p.forEach((w, j) => {
        if (w < 1e-9) return;
        const lj = this.cfg.lexicon![j];
        for (let i = 0; i < k.length; i++) k[i] += w * lj[i];
      });
      return k;
    });
  }

  /** For the symbolic parameterisation: the hardened symbol id per hop and its probability. */
  hardened(): Array<{ id: number; p: number }> {
    if (!this.symbolic) return [];
    return this.params.map((z) => {
      const p = softmax(z);
      const id = argmax(p);
      return { id, p: p[id] };
    });
  }

  forward(x: Vec, keys: Vec[] = this.keys): { out: Vec; caches: HopCache[] } {
    const caches: HopCache[] = [];
    let cur = x;
    keys.forEach((k, h) => {
      const query = bind(k, cur);
      const recalled = permute(unbind(query, this.cfg.memory), -(this.cfg.shift ?? 0));
      const last = h === this.keys.length - 1;
      if (last) {
        caches.push({ input: cur, query, recalled });
        cur = recalled;
      } else {
        const { y, cache } = softClean(recalled, this.cfg.codebook, this.cfg.cleanBeta ?? 30);
        caches.push({ input: cur, query, recalled, clean: cache });
        cur = y;
      }
    });
    return { out: cur, caches };
  }

  step(batch: OperandExample[], lr = 0.05): number {
    const keys = this.keys;
    const keyGrads = keys.map((k) => new Float64Array(k.length));
    let total = 0;
    for (const ex of batch) {
      const { out, caches } = this.forward(ex.input, keys);
      const { loss, grad } = decodeLoss(out, this.cfg.codebook, ex.target, this.cfg.decodeBeta ?? 16);
      total += loss;
      let g = grad;
      for (let h = keys.length - 1; h >= 0; h--) {
        const c = caches[h];
        if (c.clean) g = softCleanBackward(g, this.cfg.codebook, this.cfg.cleanBeta ?? 30, c.clean);
        g = permute(g, this.cfg.shift ?? 0);
        // recalled = query (#) memory  =>  d query = g (#) memory
        const dQuery = unbind(g, this.cfg.memory);
        // query = key (*) input  =>  d key = input (#) dQuery, d input = key (#) dQuery
        const dKey = unbind(c.input, dQuery);
        const dInput = unbind(keys[h], dQuery);
        for (let i = 0; i < dKey.length; i++) keyGrads[h][i] += dKey[i] / batch.length;
        g = dInput;
      }
    }
    const grads = this.symbolic
      ? this.params.map((z, h) => {
          const p = softmax(z);
          const dp = Float64Array.from(this.cfg.lexicon!, (lj) => {
            let s = 0;
            for (let i = 0; i < lj.length; i++) s += lj[i] * keyGrads[h][i];
            return s;
          });
          return softmaxBackward(p, dp);
        })
      : keyGrads;
    const lrScale = this.symbolic ? 1 : 1 / Math.sqrt(this.cfg.dim);
    this.t++;
    const b1 = 0.9;
    const b2 = 0.999;
    this.params.forEach((k, h) => {
      for (let i = 0; i < k.length; i++) {
        const gi = grads[h][i];
        this.m[h][i] = b1 * this.m[h][i] + (1 - b1) * gi;
        this.v[h][i] = b2 * this.v[h][i] + (1 - b2) * gi * gi;
        const mh = this.m[h][i] / (1 - b1 ** this.t);
        const vh = this.v[h][i] / (1 - b2 ** this.t);
        k[i] -= ((lr * mh) / (Math.sqrt(vh) + 1e-8)) * lrScale;
      }
    });
    return total / batch.length;
  }
}
