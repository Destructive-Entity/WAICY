/**
 * Vector primitives for CISA registers.
 *
 * Registers hold real vectors in R^d. Concepts are random vectors with
 * i.i.d. N(0, 1/d) components, so they are nearly orthogonal in high d and
 * have expected unit norm (Plate's Holographic Reduced Representations).
 */

export type Vec = Float64Array;

/** Mulberry32: tiny, fast, deterministic PRNG so every experiment is reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample via Box-Muller. */
export function gaussian(rand: () => number): number {
  let u = 0;
  while (u === 0) u = rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function zeros(d: number): Vec {
  return new Float64Array(d);
}

export function randomVec(d: number, rand: () => number): Vec {
  const out = new Float64Array(d);
  const s = 1 / Math.sqrt(d);
  for (let i = 0; i < d; i++) out[i] = gaussian(rand) * s;
  return out;
}

export function add(a: Vec, b: Vec, alpha = 1): Vec {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + alpha * b[i];
  return out;
}

export function addInPlace(target: Vec, b: Vec, alpha = 1): void {
  for (let i = 0; i < target.length; i++) target[i] += alpha * b[i];
}

export function scale(a: Vec, s: number): Vec {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] * s;
  return out;
}

export function dot(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function norm(a: Vec): number {
  return Math.sqrt(dot(a, a));
}

export function normalize(a: Vec): Vec {
  const n = norm(a);
  return n === 0 ? new Float64Array(a.length) : scale(a, 1 / n);
}

export function cosine(a: Vec, b: Vec): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

/**
 * Circular convolution (binding). out[k] = sum_i a[i] * b[(k - i) mod d].
 * Uses an FFT when d is a power of two, otherwise the direct O(d^2) form.
 */
export function bind(a: Vec, b: Vec): Vec {
  const d = a.length;
  if (isPow2(d) && d >= 64) return fftConvolve(a, b, false);
  const out = new Float64Array(d);
  for (let k = 0; k < d; k++) {
    let s = 0;
    for (let i = 0; i < d; i++) s += a[i] * b[(k - i + d) % d];
    out[k] = s;
  }
  return out;
}

/**
 * Circular correlation (unbinding). out[k] = sum_i a[i] * b[(k + i) mod d].
 * unbind(a, bind(a, b)) is approximately b.
 */
export function unbind(a: Vec, b: Vec): Vec {
  const d = a.length;
  if (isPow2(d) && d >= 64) return fftConvolve(a, b, true);
  const out = new Float64Array(d);
  for (let k = 0; k < d; k++) {
    let s = 0;
    for (let i = 0; i < d; i++) s += a[i] * b[(k + i) % d];
    out[k] = s;
  }
  return out;
}

const PERM_CACHE = new Map<number, { fwd: Int32Array; inv: Int32Array }>();

/** Fixed pseudo-random permutation of 0..d-1 (same for every run with the same d). */
function permutationTable(d: number): { fwd: Int32Array; inv: Int32Array } {
  const cached = PERM_CACHE.get(d);
  if (cached) return cached;
  const rand = rng(0x5eed + d);
  const fwd = Int32Array.from({ length: d }, (_, i) => i);
  for (let i = d - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [fwd[i], fwd[j]] = [fwd[j], fwd[i]];
  }
  const inv = new Int32Array(d);
  for (let i = 0; i < d; i++) inv[fwd[i]] = i;
  const table = { fwd, inv };
  PERM_CACHE.set(d, table);
  return table;
}

/**
 * Applies a fixed pseudo-random permutation k times (k < 0 applies the inverse).
 * Encodes order and asymmetric roles.
 *
 * Not a cyclic rotation on purpose: rotation is convolution with a shifted
 * delta, so it commutes with BIND and cannot break the symmetry of
 * bind(bind(r, x), y). A random permutation does not commute with BIND.
 */
export function permute(a: Vec, k: number): Vec {
  const d = a.length;
  const { fwd, inv } = permutationTable(d);
  const table = k >= 0 ? fwd : inv;
  let cur = a;
  for (let step = 0; step < Math.abs(k); step++) {
    const next = new Float64Array(d);
    for (let i = 0; i < d; i++) next[table[i]] = cur[i];
    cur = next;
  }
  return k === 0 ? Float64Array.from(a) : cur;
}

/** Plain cyclic rotation, kept to reproduce the aliasing ablation. */
export function rotate(a: Vec, k: number): Vec {
  const d = a.length;
  const out = new Float64Array(d);
  const s = ((k % d) + d) % d;
  for (let i = 0; i < d; i++) out[(i + s) % d] = a[i];
  return out;
}

/**
 * Clip range (in standard deviations) of a uniform quantizer that minimises
 * mean squared error for Gaussian data, per bit width (Max, 1960).
 */
const GAUSSIAN_CLIP: Record<number, number> = { 2: 1.99, 3: 2.34, 4: 2.68, 5: 3.0, 6: 3.3, 7: 3.6, 8: 3.9 };

/**
 * b-bit uniform midrise quantization (2^b levels, no zero level).
 * bits = 1 keeps only the sign; bits >= 32 is a lossless copy.
 */
export function quantize(a: Vec, bits: number): Vec {
  if (bits >= 32) return Float64Array.from(a);
  const out = new Float64Array(a.length);
  const rms = norm(a) / Math.sqrt(a.length);
  if (rms === 0) return out;
  if (bits === 1) {
    for (let i = 0; i < a.length; i++) out[i] = a[i] >= 0 ? rms : -rms;
    return out;
  }
  const clip = (GAUSSIAN_CLIP[bits] ?? 4) * rms;
  const levels = 2 ** bits;
  const step = (2 * clip) / levels;
  for (let i = 0; i < a.length; i++) {
    const k = Math.min(levels - 1, Math.max(0, Math.floor((a[i] + clip) / step)));
    out[i] = -clip + (k + 0.5) * step;
  }
  return out;
}

function isPow2(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/** In-place iterative radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ar = re[i + j];
        const ai = im[i + j];
        const br = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const bi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ar + br;
        im[i + j] = ai + bi;
        re[i + j + len / 2] = ar - br;
        im[i + j + len / 2] = ai - bi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

function fftConvolve(a: Vec, b: Vec, correlate: boolean): Vec {
  const n = a.length;
  const ar = Float64Array.from(a);
  const ai = new Float64Array(n);
  const br = Float64Array.from(b);
  const bi = new Float64Array(n);
  fft(ar, ai, false);
  fft(br, bi, false);
  const r = new Float64Array(n);
  const i2 = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    // Correlation multiplies by the complex conjugate of the first operand.
    const xr = ar[k];
    const xi = correlate ? -ai[k] : ai[k];
    r[k] = xr * br[k] - xi * bi[k];
    i2[k] = xr * bi[k] + xi * br[k];
  }
  fft(r, i2, true);
  return r;
}
