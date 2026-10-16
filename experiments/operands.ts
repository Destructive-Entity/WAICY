import { CisaVM } from "@/lib/cisa/vm";
import { OperandLearner } from "@/lib/cisa/learn";
import { cosine, normalize, rng } from "@/lib/cisa/vec";
import { buildMemory, compileQuery, makeWorld, TAIL_SHIFT, type World } from "@/lib/cisa/world";
import { round } from "./common";

function split(w: World, nTrain: number, seed: number) {
  const rand = rng(seed);
  const shuffled = [...w.entities];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return { train: shuffled.slice(0, nTrain), test: shuffled.slice(nTrain) };
}

function follow(w: World, head: string, chain: string[]): string {
  let cur = head;
  for (const r of chain) cur = w.facts.get(r)!.get(cur)!;
  return cur;
}

/**
 * E8. Learning a new concept from examples by fitting continuous operands.
 * The hidden target is a relation (or a chain of relations). Only
 * (input, answer) pairs are shown; the learner is never told the name.
 */
export function operandLearning(steps = 150) {
  const dim = 2048;
  const w = makeWorld({ dim, entities: 32, relations: 3, seed: 4 });
  const memory = buildMemory(w, false)[0];
  const codebook = w.lexicon.vectors.map(normalize);

  const train = (chain: string[], hops: number, nTrain: number, seed: number, param: "free" | "symbolic") => {
    const { train: tr, test } = split(w, nTrain, seed * 101 + nTrain);
    const learner = new OperandLearner({ hops, dim, memory, codebook, seed, param, lexicon: w.lexicon.vectors, shift: TAIL_SHIFT });
    const batch = tr.map((h) => ({ input: w.lexicon.get(h), target: w.lexicon.idOf(follow(w, h, chain)) }));
    for (let s = 0; s < steps; s++) learner.step(batch, param === "symbolic" ? 0.3 : 0.05);

    let ok = 0;
    if (param === "symbolic") {
      const learned = learner.hardened().map((x) => w.lexicon.nameOf(x.id));
      for (const h of test) {
        const vm = new CisaVM(w.lexicon, { cleanupPool: w.entityIds });
        vm.memory = [memory];
        if (vm.run(compileQuery(w, h, learned)).output[0]?.name === follow(w, h, chain)) ok++;
      }
      return { accuracy: ok / test.length, learned, keyCosine: learner.keys.map((k, i) => round(cosine(k, w.lexicon.get(chain[i] ?? chain[0])), 3)) };
    }
    for (const h of test) {
      const out = learner.forward(w.lexicon.get(h)).out;
      const best = w.lexicon.nearest(out, 1, w.entityIds)[0];
      if (best.name === follow(w, h, chain)) ok++;
    }
    return { accuracy: ok / test.length, learned: [] as string[], keyCosine: learner.keys.map((k) => round(cosine(k, w.lexicon.get(chain[0])), 3)) };
  };

  const fewShot: Array<{ examples: number; param: "free" | "symbolic"; accuracy: number; recovered: number }> = [];
  for (const nTrain of [1, 2, 4, 8]) {
    for (const param of ["free", "symbolic"] as const) {
      const runs = [1, 2, 3].map((seed) => train([w.relations[seed % 3]], 1, nTrain, seed, param));
      fewShot.push({
        examples: nTrain,
        param,
        accuracy: round(runs.reduce((s, r) => s + r.accuracy, 0) / runs.length),
        recovered: round(runs.filter((r, i) => r.learned[0] === w.relations[(i + 1) % 3]).length / runs.length),
      });
    }
  }

  const chain = ["mentor", "rival"];
  const composite = ([1, 2] as const).flatMap((hops) =>
    [1, 2, 3].map((seed) => {
      const r = train(chain, hops, 8, seed, "symbolic");
      return { hops, seed, accuracy: round(r.accuracy), learned: r.learned, keyCosine: r.keyCosine };
    }),
  );

  return { dim, facts: w.relations.length * w.entities.length, entities: w.entities.length, steps, fewShot, composite, chain };
}
