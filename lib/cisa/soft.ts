import { encodeSigned, ins, type Instruction, type Mnemonic } from "./isa";
import { add, bind, dot, gaussian, norm, permute, rng, scale, unbind, type Vec } from "./vec";

/**
 * Soft CISA: the continuous relaxation of the instruction set.
 *
 * A soft program has L slots. Each slot holds three probability
 * distributions: one over opcodes and one over source registers for each of
 * its two operands. Executing a slot runs every candidate opcode on the
 * expected operands and mixes the results by opcode probability, so the whole
 * program is differentiable and can be found by gradient descent. Taking the
 * argmax of every distribution ("hardening") gives an ordinary discrete CISA
 * program that runs on the real VM.
 */

/** PERM here always means one inverse permutation step (imm = -1). */
export const SOFT_OPS = ["BIND", "UNBIND", "BUNDLE", "CLEAN", "MOV", "PERM"] as const;
export type SoftOp = (typeof SOFT_OPS)[number];

export interface SoftExample {
  inputs: Vec[];
  target: Vec;
  targetName: string;
}

export interface SoftConfig {
  inputs: number;
  slots: number;
  dim: number;
  /** Unit-normalised codebook used by soft CLEAN. */
  codebook: Vec[];
  codebookNames: string[];
  /** Inverse temperature of soft CLEAN attention. */
  cleanBeta?: number;
  /**
   * "contrastive": cross-entropy of decoding the output against the whole
   * codebook. "cosine": 1 - cos(output, target). Cosine has a degenerate
   * optimum (a blurred average of the codebook is mildly similar to every
   * target), which the experiments document.
   */
  loss?: "contrastive" | "cosine";
  /** Inverse temperature of the contrastive decoder. */
  decodeBeta?: number;
  /**
   * "relaxed": every slot executes the probability-weighted mix of all
   * opcodes and operands (fully continuous).
   * "straight-through": the forward pass executes one discrete program sampled
   * with Gumbel noise, the backward pass uses the relaxed gradient. The
   * program that runs is always a real CISA program.
   */
  mode?: "relaxed" | "straight-through";
  seed?: number;
}

export interface SlotParams {
  op: Float64Array;
  a: Float64Array;
  b: Float64Array;
}

export function softmax(z: Float64Array, tau = 1): Float64Array {
  let m = -Infinity;
  for (const v of z) m = Math.max(m, v / tau);
  const out = new Float64Array(z.length);
  let s = 0;
  for (let i = 0; i < z.length; i++) {
    out[i] = Math.exp(z[i] / tau - m);
    s += out[i];
  }
  for (let i = 0; i < z.length; i++) out[i] /= s;
  return out;
}

export function softmaxBackward(p: Float64Array, dp: Float64Array, tau = 1): Float64Array {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += p[i] * dp[i];
  const out = new Float64Array(p.length);
  for (let i = 0; i < p.length; i++) out[i] = (p[i] * (dp[i] - s)) / tau;
  return out;
}

function mix(weights: Float64Array, vecs: Vec[]): Vec {
  const out = new Float64Array(vecs[0].length);
  for (let j = 0; j < weights.length; j++) {
    const w = weights[j];
    if (w < 1e-9) continue;
    const v = vecs[j];
    for (let i = 0; i < out.length; i++) out[i] += w * v[i];
  }
  return out;
}

export interface CleanCache {
  q: Float64Array;
  aHat: Vec;
  aNorm: number;
}

export function softClean(a: Vec, codebook: Vec[], beta: number): { y: Vec; cache: CleanCache } {
  const n = norm(a) || 1e-9;
  const aHat = scale(a, 1 / n);
  const s = new Float64Array(codebook.length);
  for (let k = 0; k < codebook.length; k++) s[k] = beta * dot(aHat, codebook[k]);
  const q = softmax(s);
  return { y: mix(q, codebook), cache: { q, aHat, aNorm: n } };
}

export function softCleanBackward(g: Vec, codebook: Vec[], beta: number, c: CleanCache): Vec {
  const dq = new Float64Array(codebook.length);
  for (let k = 0; k < codebook.length; k++) dq[k] = dot(g, codebook[k]);
  const ds = softmaxBackward(c.q, dq);
  const dHat = new Float64Array(g.length);
  for (let k = 0; k < codebook.length; k++) {
    const w = beta * ds[k];
    if (Math.abs(w) < 1e-12) continue;
    const ck = codebook[k];
    for (let i = 0; i < g.length; i++) dHat[i] += w * ck[i];
  }
  const proj = dot(c.aHat, dHat);
  const out = new Float64Array(g.length);
  for (let i = 0; i < g.length; i++) out[i] = (dHat[i] - c.aHat[i] * proj) / c.aNorm;
  return out;
}

interface SlotCache {
  /** Distributions used for the softmax backward pass. */
  pOp: Float64Array;
  pA: Float64Array;
  pB: Float64Array;
  /** Weights actually used in the forward pass (one-hot in straight-through mode). */
  wOp: Float64Array;
  wA: Float64Array;
  wB: Float64Array;
  a: Vec;
  b: Vec;
  cands: Vec[];
  clean: CleanCache;
}

export class SoftProgram {
  readonly params: SlotParams[];
  private readonly m: SlotParams[];
  private readonly v: SlotParams[];
  private t = 0;
  private readonly noiseRand: () => number;
  tau = 1;
  /** Best discrete program sampled so far in straight-through mode, by minibatch loss. */
  best: { shape: Array<{ op: SoftOp; a: number; b: number }>; loss: number } | null = null;

  constructor(readonly cfg: SoftConfig) {
    const rand = rng(cfg.seed ?? 1);
    this.noiseRand = rng((cfg.seed ?? 1) * 104729 + 1);
    const init = (n: number) => Float64Array.from({ length: n }, () => gaussian(rand) * 0.01);
    this.params = Array.from({ length: cfg.slots }, (_, s) => ({
      op: init(SOFT_OPS.length),
      a: init(cfg.inputs + s),
      b: init(cfg.inputs + s),
    }));
    const zerosLike = () => this.params.map((p) => ({ op: new Float64Array(p.op.length), a: new Float64Array(p.a.length), b: new Float64Array(p.b.length) }));
    this.m = zerosLike();
    this.v = zerosLike();
  }

  private get beta(): number {
    return this.cfg.cleanBeta ?? 20;
  }

  private get straightThrough(): boolean {
    return this.cfg.mode === "straight-through";
  }

  /** Draws (soft, forward) weights for one distribution. */
  private sample(z: Float64Array, noise: Float64Array | null): { p: Float64Array; w: Float64Array } {
    if (!noise) {
      const p = softmax(z, this.tau);
      return { p, w: p };
    }
    const perturbed = Float64Array.from(z, (v, i) => v + noise[i]);
    const p = softmax(perturbed, this.tau);
    const w = new Float64Array(z.length);
    w[argmax(perturbed)] = 1;
    return { p, w };
  }

  private gumbel(n: number): Float64Array {
    return Float64Array.from({ length: n }, () => -Math.log(-Math.log(Math.max(this.noiseRand(), 1e-12))));
  }

  /** Samples Gumbel noise for every distribution (one shared program per minibatch). */
  drawNoise(): Float64Array[][] | null {
    if (!this.straightThrough) return null;
    return this.params.map((p) => [this.gumbel(p.op.length), this.gumbel(p.a.length), this.gumbel(p.b.length)]);
  }

  forward(inputs: Vec[], noise: Float64Array[][] | null = null): { out: Vec; hidden: Vec[]; caches: SlotCache[] } {
    const hidden = inputs.slice();
    const caches: SlotCache[] = [];
    this.params.forEach((p, s) => {
      const n = noise?.[s];
      const { p: pOp, w: wOp } = this.sample(p.op, n?.[0] ?? null);
      const { p: pA, w: wA } = this.sample(p.a, n?.[1] ?? null);
      const { p: pB, w: wB } = this.sample(p.b, n?.[2] ?? null);
      const a = mix(wA, hidden);
      const b = mix(wB, hidden);
      const { y: cleaned, cache: clean } = softClean(a, this.cfg.codebook, this.beta);
      const cands: Vec[] = [bind(a, b), unbind(a, b), add(a, b), cleaned, a, permute(a, -1)];
      hidden.push(mix(wOp, cands));
      caches.push({ pOp, pA, pB, wOp, wA, wB, a, b, cands, clean });
    });
    return { out: hidden[hidden.length - 1], hidden, caches };
  }

  /** Loss for one example, without gradients. */
  loss(ex: SoftExample): number {
    const { out } = this.forward(ex.inputs);
    return this.lossAndGrad(out, ex).loss;
  }

  private targetIndex(ex: SoftExample): number {
    const idx = this.cfg.codebookNames.indexOf(ex.targetName);
    if (idx < 0) throw new Error(`target ${ex.targetName} missing from codebook`);
    return idx;
  }

  private lossAndGrad(out: Vec, ex: SoftExample): { loss: number; grad: Vec } {
    const no = norm(out) || 1e-9;
    const grad = new Float64Array(out.length);
    if ((this.cfg.loss ?? "contrastive") === "cosine") {
      const t = ex.target;
      const nt = norm(t) || 1e-9;
      const c = dot(out, t) / (no * nt);
      for (let i = 0; i < out.length; i++) grad[i] = -(t[i] / (no * nt) - (c * out[i]) / (no * no));
      return { loss: 1 - c, grad };
    }
    return decodeLoss(out, this.cfg.codebook, this.targetIndex(ex), this.cfg.decodeBeta ?? 16);
  }

  /** Returns the loss and accumulates gradients into `grads`. */
  private backward(ex: SoftExample, grads: SlotParams[], noise: Float64Array[][] | null = null): number {
    const { out, hidden, caches } = this.forward(ex.inputs, noise);
    const { loss, grad } = this.lossAndGrad(out, ex);
    const gHidden: Vec[] = hidden.map((h) => new Float64Array(h.length));
    gHidden[gHidden.length - 1] = grad;

    for (let s = this.params.length - 1; s >= 0; s--) {
      const cache = caches[s];
      const gy = gHidden[this.cfg.inputs + s];
      const dpOp = new Float64Array(SOFT_OPS.length);
      for (let o = 0; o < SOFT_OPS.length; o++) dpOp[o] = dot(gy, cache.cands[o]);
      addTo(grads[s].op, softmaxBackward(cache.pOp, dpOp, this.tau));

      const ga = new Float64Array(gy.length);
      const gb = new Float64Array(gy.length);
      const w = cache.wOp;
      // BIND: y = a (*) b
      if (w[0] > 1e-9) {
        const g = scale(gy, w[0]);
        addTo(ga, unbind(cache.b, g));
        addTo(gb, unbind(cache.a, g));
      }
      // UNBIND: y = a (#) b
      if (w[1] > 1e-9) {
        const g = scale(gy, w[1]);
        addTo(ga, unbind(g, cache.b));
        addTo(gb, bind(g, cache.a));
      }
      // BUNDLE: y = a + b
      if (w[2] > 1e-9) {
        addTo(ga, scale(gy, w[2]));
        addTo(gb, scale(gy, w[2]));
      }
      // CLEAN: y = softclean(a)
      if (w[3] > 1e-9) addTo(ga, softCleanBackward(scale(gy, w[3]), this.cfg.codebook, this.beta, cache.clean));
      // MOV: y = a
      if (w[4] > 1e-9) addTo(ga, scale(gy, w[4]));
      // PERM: y = P^-1 a, so the gradient is P g
      if (w[5] > 1e-9) addTo(ga, permute(scale(gy, w[5]), 1));

      const visible = hidden.slice(0, this.cfg.inputs + s);
      const dpA = Float64Array.from(visible, (h) => dot(ga, h));
      const dpB = Float64Array.from(visible, (h) => dot(gb, h));
      addTo(grads[s].a, softmaxBackward(cache.pA, dpA, this.tau));
      addTo(grads[s].b, softmaxBackward(cache.pB, dpB, this.tau));
      for (let j = 0; j < visible.length; j++) {
        if (cache.wA[j] > 1e-9) addTo(gHidden[j], scale(ga, cache.wA[j]));
        if (cache.wB[j] > 1e-9) addTo(gHidden[j], scale(gb, cache.wB[j]));
      }
    }
    return loss;
  }

  /** One Adam step on a minibatch. Returns mean loss. */
  step(batch: SoftExample[], lr = 0.1): number {
    const grads = this.params.map((p) => ({ op: new Float64Array(p.op.length), a: new Float64Array(p.a.length), b: new Float64Array(p.b.length) }));
    let loss = 0;
    const noise = this.drawNoise();
    for (const ex of batch) loss += this.backward(ex, grads, noise);
    if (noise) {
      const mean = loss / batch.length;
      if (!this.best || mean < this.best.loss) {
        const shape = this.params.map((p, s) => ({
          op: SOFT_OPS[argmax(Float64Array.from(p.op, (v, i) => v + noise[s][0][i]))],
          a: argmax(Float64Array.from(p.a, (v, i) => v + noise[s][1][i])),
          b: argmax(Float64Array.from(p.b, (v, i) => v + noise[s][2][i])),
        }));
        this.best = { shape, loss: mean };
      }
    }
    this.t++;
    const b1 = 0.9;
    const b2 = 0.999;
    const k = 1 / batch.length;
    for (let s = 0; s < this.params.length; s++) {
      for (const key of ["op", "a", "b"] as const) {
        const p = this.params[s][key];
        const g = grads[s][key];
        const m = this.m[s][key];
        const v = this.v[s][key];
        for (let i = 0; i < p.length; i++) {
          const gi = g[i] * k;
          m[i] = b1 * m[i] + (1 - b1) * gi;
          v[i] = b2 * v[i] + (1 - b2) * gi * gi;
          const mh = m[i] / (1 - b1 ** this.t);
          const vh = v[i] / (1 - b2 ** this.t);
          p[i] -= (lr * mh) / (Math.sqrt(vh) + 1e-8);
        }
      }
    }
    return loss / batch.length;
  }

  /** Mean probability mass on the argmax of every distribution: 1.0 means fully discrete. */
  discreteness(): number {
    let s = 0;
    let n = 0;
    for (const p of this.params) {
      for (const z of [p.op, p.a, p.b]) {
        s += Math.max(...softmax(z, this.tau));
        n++;
      }
    }
    return s / n;
  }

  /** Argmax every distribution and emit real CISA instructions. Inputs live in r0..r(n-1). */
  harden(): Instruction[] {
    const prog: Instruction[] = [];
    this.params.forEach((p, s) => {
      const op = SOFT_OPS[argmax(p.op)] as SoftOp;
      const dst = this.cfg.inputs + s;
      const a = argmax(p.a);
      const b = argmax(p.b);
      if (op === "BUNDLE") prog.push(ins("BUNDLE", { dst, a, b, imm: 256 }));
      else if (op === "PERM") prog.push(ins("PERM", { dst, a, imm: encodeSigned(-1) }));
      else if (op === "CLEAN" || op === "MOV") prog.push(ins(op as Mnemonic, { dst, a }));
      else prog.push(ins(op as Mnemonic, { dst, a, b }));
    });
    prog.push(ins("EMIT", { a: this.cfg.inputs + this.cfg.slots - 1 }));
    prog.push(ins("HALT"));
    return prog;
  }
}

/**
 * Contrastive decode loss: cross-entropy of reading `out` as the codebook
 * entry `target` with logits beta * cos(out, c_k). Codebook must be unit norm.
 */
export function decodeLoss(out: Vec, codebook: Vec[], target: number, beta: number): { loss: number; grad: Vec } {
  const no = norm(out) || 1e-9;
  const grad = new Float64Array(out.length);
  const cos = Float64Array.from(codebook, (c) => dot(out, c) / no);
  const q = softmax(Float64Array.from(cos, (c) => beta * c));
  for (let k = 0; k < codebook.length; k++) {
    const coeff = (q[k] - (k === target ? 1 : 0)) * beta;
    if (Math.abs(coeff) < 1e-12) continue;
    const ck = codebook[k];
    for (let i = 0; i < out.length; i++) grad[i] += (coeff * (ck[i] - (cos[k] * out[i]) / no)) / no;
  }
  return { loss: -Math.log(Math.max(q[target], 1e-300)), grad };
}

export function addTo(target: Float64Array, src: Float64Array): void {
  for (let i = 0; i < target.length; i++) target[i] += src[i];
}

export function argmax(z: ArrayLike<number>): number {
  let best = 0;
  for (let i = 1; i < z.length; i++) if (z[i] > z[best]) best = i;
  return best;
}

/** Search-space size of discrete programs with these shapes, for reporting. */
export function searchSpaceSize(inputs: number, slots: number): number {
  let n = 1;
  for (let s = 0; s < slots; s++) n *= SOFT_OPS.length * (inputs + s) ** 2;
  return n;
}

/** Fast hard execution of a discrete soft-shaped program (used by random search and evaluation). */
export function runHard(prog: Array<{ op: SoftOp; a: number; b: number }>, inputs: Vec[], codebook: Vec[]): Vec {
  const h = inputs.slice();
  for (const p of prog) {
    const a = h[p.a];
    const b = h[p.b];
    switch (p.op) {
      case "BIND":
        h.push(bind(a, b));
        break;
      case "UNBIND":
        h.push(unbind(a, b));
        break;
      case "BUNDLE":
        h.push(add(a, b));
        break;
      case "CLEAN": {
        let best = 0;
        let bs = -Infinity;
        for (let k = 0; k < codebook.length; k++) {
          const s = dot(a, codebook[k]);
          if (s > bs) {
            bs = s;
            best = k;
          }
        }
        h.push(codebook[best]);
        break;
      }
      case "MOV":
        h.push(a);
        break;
      case "PERM":
        h.push(permute(a, -1));
        break;
    }
  }
  return h[h.length - 1];
}

/** Converts a soft-shaped discrete program into real CISA instructions. */
export function shapeToInstructions(shape: Array<{ op: SoftOp; a: number; b: number }>, inputs: number): Instruction[] {
  const prog: Instruction[] = shape.map((p, s) => {
    const dst = inputs + s;
    if (p.op === "BUNDLE") return ins("BUNDLE", { dst, a: p.a, b: p.b, imm: 256 });
    if (p.op === "PERM") return ins("PERM", { dst, a: p.a, imm: encodeSigned(-1) });
    if (p.op === "CLEAN" || p.op === "MOV") return ins(p.op, { dst, a: p.a });
    return ins(p.op, { dst, a: p.a, b: p.b });
  });
  prog.push(ins("EMIT", { a: inputs + shape.length - 1 }));
  prog.push(ins("HALT"));
  return prog;
}

export function softToHardShape(sp: SoftProgram): Array<{ op: SoftOp; a: number; b: number }> {
  return sp.params.map((p) => ({ op: SOFT_OPS[argmax(p.op)], a: argmax(p.a), b: argmax(p.b) }));
}
