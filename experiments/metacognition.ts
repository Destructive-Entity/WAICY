import { CisaVM } from "@/lib/cisa/vm";
import { buildMemory, compileAdaptiveHop, makeWorld } from "@/lib/cisa/world";
import { auroc, round } from "./common";

/**
 * E3. Knowing when you do not know. One overloaded shared memory bank is cheap
 * but error-prone. The CLEAN confidence register is tested as a predictor of
 * correctness, and BRC uses it to retry only uncertain queries on precise
 * per-relation banks.
 */
function histogram(scores: Array<{ score: number; positive: boolean }>) {
  const bins = Array.from({ length: 10 }, (_, i) => ({ bin: round(i / 10 + 0.05, 2), correct: 0, wrong: 0 }));
  for (const s of scores) {
    const b = bins[Math.min(9, Math.max(0, Math.floor(s.score * 10)))];
    if (s.positive) b.correct++;
    else b.wrong++;
  }
  return bins;
}

export function metacognition() {
  const w = makeWorld({ dim: 1024, entities: 32, relations: 3, seed: 21 });
  const shared = buildMemory(w, false)[0];
  const shards = buildMemory(w, true);
  const banks = [shared, ...shards];

  const queries: Array<{ head: string; rel: string }> = [];
  for (const rel of w.relations) for (const head of w.entities) queries.push({ head, rel });

  const run = (threshold: number) => {
    let ok = 0;
    let recalls = 0;
    let steps = 0;
    const scores: Array<{ score: number; positive: boolean }> = [];
    const cosineScores: Array<{ score: number; positive: boolean }> = [];
    for (const q of queries) {
      const vm = new CisaVM(w.lexicon, { cleanupPool: w.entityIds });
      vm.memory = banks;
      vm.setRegister(0, w.lexicon.get(q.head));
      const res = vm.run(compileAdaptiveHop(w, q.rel, threshold));
      const firstClean = res.trace.find((t) => t.instruction.op === "CLEAN")!;
      const guess = w.lexicon.nearest(vm.regs[4], 1, w.entityIds)[0].name;
      const correct = guess === w.facts.get(q.rel)!.get(q.head);
      if (correct) ok++;
      recalls += res.trace.filter((t) => t.instruction.op === "RECALL").length;
      steps += res.steps;
      // Only meaningful at threshold 0, where the first answer is the final answer.
      scores.push({ score: firstClean.confidence, positive: correct });
      cosineScores.push({ score: w.lexicon.nearest(vm.regs[3], 1, w.entityIds)[0].sim, positive: correct });
    }
    return { ok, recalls, steps, scores, cosineScores };
  };

  const baseline = run(0);
  const sweep = Array.from({ length: 16 }, (_, k) => {
    const threshold = k / 15;
    const r = run(threshold);
    return {
      threshold: round(threshold, 3),
      accuracy: round(r.ok / queries.length),
      recallsPerQuery: round(r.recalls / queries.length, 3),
      retryRate: round(r.recalls / queries.length - 1, 3),
    };
  });

  const correctConf = baseline.scores.filter((s) => s.positive).map((s) => s.score);
  const wrongConf = baseline.scores.filter((s) => !s.positive).map((s) => s.score);
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  return {
    facts: queries.length,
    dim: 1024,
    sharedOnlyAccuracy: round(baseline.ok / queries.length),
    alwaysShardAccuracy: sweep[sweep.length - 1].accuracy,
    auroc: round(auroc(baseline.scores)),
    aurocRawCosine: round(auroc(baseline.cosineScores)),
    meanConfidenceCorrect: round(mean(correctConf)),
    meanConfidenceWrong: round(mean(wrongConf)),
    histogram: histogram(baseline.scores),
    sweep,
  };
}
