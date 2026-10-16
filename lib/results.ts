import data from "@/results/results.json";

export const results = data;
export type Results = typeof data;

/** Headline findings, derived from results.json so the site can never drift from the experiments. */
export function headlines() {
  const r = data;
  const noise0 = r.noise.rows.filter((x) => x.noise === 0);
  const sixHop = noise0.find((x) => x.hops === 6)!;
  const twoHop = noise0.find((x) => x.hops === 2)!;

  const m = r.metacognition;
  const matching = m.sweep.find((s) => s.accuracy >= m.alwaysShardAccuracy)!;
  const retriesSaved = 1 - (matching.recallsPerQuery - 1);

  const oneShotSymbolic = r.operands.fewShot.find((x) => x.examples === 1 && x.param === "symbolic")!;
  const oneShotFree = r.operands.fewShot.find((x) => x.examples === 1 && x.param === "free")!;
  const composite2 = r.operands.composite.filter((x) => x.hops === 2);
  const compositeRecovered = composite2.filter((x) => x.learned.join(">") === r.operands.chain.join(">")).length;

  const perfectPrecision = [...r.precision].filter((x) => x.accuracy === 1).sort((a, b) => a.bits - b.bits)[0];
  const ratios = r.compactness.rows.map((x) => x.byteRatio);

  const analogy512 = r.analogy.filter((x) => x.dim === 512);
  const hardestAnalogy = analogy512[analogy512.length - 1];

  const capacityByDim = [256, 512, 1024, 2048].map((dim) => {
    const perfect = r.capacity.filter((x) => x.dim === dim && x.accuracy === 1).map((x) => x.facts);
    return { dim, facts: perfect.length ? Math.max(...perfect) : 0 };
  });

  return {
    errorCorrection: { withClean: sixHop.clean, withoutClean: sixHop.noClean, twoHopWithout: twoHop.noClean, facts: r.noise.facts },
    metacognition: {
      auroc: m.auroc,
      aurocRaw: m.aurocRawCosine,
      threshold: matching.threshold,
      accuracy: matching.accuracy,
      sharedOnly: m.sharedOnlyAccuracy,
      retriesSaved,
    },
    operands: {
      oneShot: oneShotSymbolic.accuracy,
      oneShotFree: oneShotFree.accuracy,
      recovered: oneShotSymbolic.recovered,
      compositeRecovered,
      compositeRuns: composite2.length,
      chain: r.operands.chain,
    },
    precision: perfectPrecision,
    compactness: { minRatio: Math.min(...ratios), maxRatio: Math.max(...ratios), flopsRatio: r.compactness.flops.ratio1B, cisaFlops: r.compactness.flops.cisaPerHop },
    analogy: hardestAnalogy,
    capacity: capacityByDim,
  };
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
