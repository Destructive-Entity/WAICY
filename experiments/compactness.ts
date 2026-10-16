import { CisaVM } from "@/lib/cisa/vm";
import { toBytecode } from "@/lib/cisa/isa";
import { approxTokens, buildMemory, compileQuery, englishChainOfThought, makeWorld } from "@/lib/cisa/world";
import { round, sampleQueries, timed } from "./common";

/** Floating-point operations of one FFT-based BIND/UNBIND on d components (3 complex FFTs + pointwise product). */
function convFlops(d: number): number {
  return 3 * 5 * d * Math.log2(d) + 6 * d;
}

/**
 * E4. Size and cost of a reasoning trace: CISA bytecode vs the English chain
 * of thought a language model would generate for the same multi-hop question.
 */
export function compactness() {
  const dim = 1024;
  const w = makeWorld({ dim, entities: 32, relations: 3, seed: 11 });
  const mem = buildMemory(w, false);
  const encoder = new TextEncoder();

  const rows = Array.from({ length: 6 }, (_, idx) => {
    const hops = idx + 1;
    const qs = sampleQueries(w, hops, 20, 500 + hops);
    let cisaBytes = 0;
    let instructions = 0;
    let englishBytes = 0;
    let englishTokens = 0;
    for (const q of qs) {
      const prog = compileQuery(w, q.start, q.chain);
      cisaBytes += toBytecode(prog).length;
      instructions += prog.length;
      const cot = englishChainOfThought(w, q.start, q.chain);
      englishBytes += encoder.encode(cot).length;
      englishTokens += approxTokens(cot);
    }
    const n = qs.length;
    return {
      hops,
      cisaInstructions: round(instructions / n, 2),
      cisaBytes: round(cisaBytes / n, 2),
      englishBytes: round(englishBytes / n, 2),
      englishTokens: round(englishTokens / n, 2),
      byteRatio: round(englishBytes / cisaBytes, 2),
    };
  });

  const pool = w.entities.length;
  const perHopFlops = 2 * convFlops(dim) + 2 * pool * dim;
  const llmTokensPerHop = round(rows[rows.length - 1].englishTokens / rows[rows.length - 1].hops, 2);

  const qs = sampleQueries(w, 4, 200, 99);
  const { ms } = timed(() => {
    for (const q of qs) {
      const vm = new CisaVM(w.lexicon, { cleanupPool: w.entityIds });
      vm.memory = mem;
      vm.run(compileQuery(w, q.start, q.chain));
    }
  });
  const hopsPerSecond = (qs.length * 4) / (ms / 1000);

  return {
    dim,
    rows,
    example: englishChainOfThought(w, qs[0].start, qs[0].chain),
    flops: {
      cisaPerHop: Math.round(perHopFlops),
      llmTokensPerHop,
      // Dense transformer forward pass is about 2 FLOPs per parameter per token.
      llm1BPerHop: Math.round(2 * 1e9 * llmTokensPerHop),
      llm8BPerHop: Math.round(2 * 8e9 * llmTokensPerHop),
      ratio1B: Math.round((2 * 1e9 * llmTokensPerHop) / perHopFlops),
    },
    measured: { hopsPerSecond: Math.round(hopsPerSecond), runtime: `Node ${process.version}, single thread, float64` },
  };
}
