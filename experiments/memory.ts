import { bind, quantize, rotate, unbind, addInPlace, zeros, cosine } from "@/lib/cisa/vec";
import { buildMemory, makeWorld, factCount } from "@/lib/cisa/world";
import { allOneHop, round, runQueries, sampleQueries } from "./common";

/** E1. How many facts fit in one register before recall degrades? */
export function capacity() {
  const dims = [256, 512, 1024, 2048];
  const facts = [8, 16, 32, 64, 128, 256];
  const rows: Array<{ dim: number; facts: number; accuracy: number }> = [];
  for (const dim of dims) {
    for (const f of facts) {
      const w = makeWorld({ dim, entities: f / 2, relations: 2, seed: dim + f });
      const mem = buildMemory(w, false);
      const { accuracy } = runQueries(w, mem, allOneHop(w, 96));
      rows.push({ dim, facts: factCount(w), accuracy: round(accuracy) });
    }
  }
  return rows;
}

/**
 * E1b. Role-aliasing ablation. Without breaking the symmetry of binding, the
 * fact (r, x, y) collides with (r, y, x). Rotation does not help because it
 * commutes with circular convolution; a random permutation does.
 */
export function aliasing() {
  const rows: Array<{ facts: number; none: number; rotation: number; permutation: number }> = [];
  for (const f of [16, 32, 64, 128]) {
    const w = makeWorld({ dim: 1024, entities: f / 2, relations: 2, seed: 77 + f });
    const queries = allOneHop(w, 96);
    const none = runQueries(w, buildMemory(w, false, 0), queries, { shift: 0 }).accuracy;
    const permutation = runQueries(w, buildMemory(w, false, 1), queries, { shift: 1 }).accuracy;

    const mem = zeros(1024);
    for (const r of w.relations) {
      for (const [h, t] of w.facts.get(r)!) addInPlace(mem, bind(bind(w.lexicon.get(r), w.lexicon.get(h)), rotate(w.lexicon.get(t), 1)));
    }
    let ok = 0;
    for (const q of queries) {
      const rel = q.chain[0];
      const guess = rotate(unbind(bind(w.lexicon.get(rel), w.lexicon.get(q.start)), mem), -1);
      const best = w.lexicon.nearest(guess, 1, w.entityIds)[0];
      if (best.name === w.facts.get(rel)!.get(q.start)) ok++;
    }
    rows.push({ facts: factCount(w), none: round(none), rotation: round(ok / queries.length), permutation: round(permutation) });
  }
  return rows;
}

/** E2. Multi-hop reasoning under register noise, with and without CLEAN after every hop. */
export function noiseAndHops() {
  const w = makeWorld({ dim: 1024, entities: 16, relations: 2, seed: 11 });
  const mem = buildMemory(w, false);
  const rows: Array<{ noise: number; hops: number; clean: number; noClean: number }> = [];
  for (const noise of [0, 0.5, 1, 1.5]) {
    for (let hops = 1; hops <= 6; hops++) {
      const qs = sampleQueries(w, hops, 50, hops * 31 + Math.round(noise * 10));
      rows.push({
        noise,
        hops,
        clean: round(runQueries(w, mem, qs, { cleanEachHop: true, noise, seed: hops }).accuracy),
        noClean: round(runQueries(w, mem, qs, { cleanEachHop: false, noise, seed: hops }).accuracy),
      });
    }
  }
  return { facts: factCount(w), dim: 1024, rows };
}

/** E5. Precision: how many bits per component does a thought need? */
export function precision() {
  const rows: Array<{ bits: number; bytesPerVector: number; accuracy: number; signalCosine: number }> = [];
  for (const bits of [32, 8, 4, 2, 1]) {
    const w = makeWorld({ dim: 1024, entities: 16, relations: 2, seed: 5 });
    const original = w.lexicon.vectors.map((v) => Float64Array.from(v));
    if (bits < 32) w.lexicon.vectors.forEach((v, i) => (w.lexicon.vectors[i] = quantize(v, bits)));
    const mem = buildMemory(w, false).map((m) => (bits < 32 ? quantize(m, bits) : m));
    const { accuracy } = runQueries(w, mem, allOneHop(w));
    const signalCosine = original.reduce((s, v, i) => s + cosine(v, w.lexicon.vectors[i]), 0) / original.length;
    rows.push({ bits, bytesPerVector: (1024 * bits) / 8, accuracy: round(accuracy), signalCosine: round(signalCosine) });
  }
  return rows;
}
