import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";
import { ChartCard } from "@/components/results/chart-card";
import {
  AliasingChart,
  AnalogyChart,
  CapacityChart,
  CompactnessChart,
  MetacognitionCharts,
  NoiseChart,
  OperandChart,
  PrecisionChart,
} from "@/components/results/charts";
import { SynthesisTable } from "@/components/results/synthesis-table";
import { CompositeTable } from "@/components/results/composite-table";
import { headlines, pct, results } from "@/lib/results";

export const metadata: Metadata = {
  title: "Results | CISA",
  description: "Nine experiments on CISA: capacity, error correction, metacognition, precision, analogy, compactness, operand learning and program search, including what failed.",
};

const TOC = [
  ["operands", "Learning from one example"],
  ["noise", "Error correction"],
  ["metacognition", "Knowing when it is unsure"],
  ["capacity", "Capacity"],
  ["aliasing", "Role aliasing"],
  ["precision", "Precision"],
  ["analogy", "Analogy"],
  ["compactness", "Compactness"],
  ["synthesis", "Program search (negative result)"],
] as const;

export default function ResultsPage() {
  const h = headlines();
  const r = results;
  const generated = new Date(r.generatedAt).toISOString().slice(0, 10);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 md:px-6 md:py-12">
      <PageIntro
        kicker="Evidence"
        title="What we measured"
        lead={`Every chart below is drawn from results/results.json, written by \`pnpm experiments\` (${r.runtime}, ${generated}). All runs use fixed seeds, so anyone can reproduce the exact numbers.`}
      />

      <nav aria-label="Experiments" className="flex flex-wrap gap-2">
        {TOC.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            {label}
          </a>
        ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          id="operands"
          label="E8 - continuous operands"
          title="It learns a hidden concept from a single example"
          finding={
            <>
              Shown one (person, answer) pair, the learner names the hidden relation correctly in {pct(h.operands.recovered)} of runs and answers{" "}
              <strong className="text-foreground">{pct(h.operands.oneShot)}</strong> of questions about people it never saw. An unconstrained vector
              (pure &quot;neuralese&quot;) scores {pct(h.operands.oneShotFree)}: it memorises noise.
            </>
          }
          method={`Operands are a softmax over ${r.operands.entities + 3} lexicon symbols, trained with Adam on a contrastive decode loss through RECALL, then hardened to LOAD #symbol and run on the real VM. d = ${r.operands.dim}, ${r.operands.facts} facts in one memory vector, 3 seeds per point.`}
        >
          <OperandChart data={r.operands.fewShot} />
        </ChartCard>

        <ChartCard
          id="composite"
          label="E8b - composition"
          title="It discovers multi-step concepts and explains them"
          finding={
            <>
              A two-hop concept cannot be expressed by a one-hop program, and the learner fails there. Given two hop slots it recovers exactly{" "}
              <span className="font-mono text-foreground">{h.operands.chain.map((c) => `#${c}`).join(" then ")}</span> in {h.operands.compositeRecovered} of{" "}
              {h.operands.compositeRuns} runs: the learned thought is readable.
            </>
          }
          method="Gradients flow through RECALL, inverse PERM, a soft CLEAN between hops and the decoder. 150 Adam steps on 8 examples."
        >
          <CompositeTable data={r.operands.composite} chain={r.operands.chain} />
        </ChartCard>

        <ChartCard
          id="noise"
          label="E2 - error correction"
          title="CLEAN works like error-correcting memory for thoughts"
          finding={
            <>
              Snapping to the nearest known concept after every hop keeps six-hop reasoning at{" "}
              <strong className="text-foreground">{pct(h.errorCorrection.withClean)}</strong>. Without it, accuracy is {pct(h.errorCorrection.twoHopWithout)}{" "}
              by hop two. Try the noise levels.
            </>
          }
          method={`${r.noise.facts} facts in one ${r.noise.dim}-d vector, 50 random questions per point. Noise is Gaussian with norm sigma added to every register write.`}
        >
          <NoiseChart data={r.noise.rows} />
        </ChartCard>

        <ChartCard
          id="capacity"
          label="E1 - capacity"
          title="Capacity grows linearly with dimension"
          finding={
            <>
              Perfect recall holds up to {h.capacity.map((c) => `${c.facts} facts at d=${c.dim}`).join(", ")}: roughly one fact per 32 dimensions, the
              budget that tells you how wide a register must be.
            </>
          }
          method="Every (person, relation) pair queried once (max 96), two relations, one shared memory vector, no sharding."
        >
          <CapacityChart data={r.capacity} />
        </ChartCard>
      </div>

      <ChartCard
        id="metacognition"
        label="E3 - metacognition"
        title="It knows when it doesn't know, and spends effort only then"
        finding={
          <>
            The CLEAN margin predicts whether an answer is right with AUROC <strong className="text-foreground">{h.metacognition.auroc.toFixed(2)}</strong>{" "}
            (raw cosine: {h.metacognition.aurocRaw.toFixed(2)}). Using BRC to retry only below C = {h.metacognition.threshold.toFixed(2)} lifts accuracy from{" "}
            {pct(h.metacognition.sharedOnly)} to {pct(h.metacognition.accuracy)}, matching always-retry while skipping {pct(h.metacognition.retriesSaved)} of the
            expensive lookups.
          </>
        }
        method={`${r.metacognition.facts} facts. Cheap path: one overloaded shared memory. Careful path: per-relation memories. Thresholds swept over all 16 values of the 4-bit BRC field.`}
      >
        <MetacognitionCharts data={r.metacognition} />
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          id="aliasing"
          label="E1b - ablation"
          title="Why PERM is a random permutation"
          finding="Rotation scores exactly the same as no fix at every size, because rotation commutes with convolution. A fixed random permutation breaks the symmetry."
          method="Same world and queries for all three encodings; d = 1024."
        >
          <AliasingChart data={r.aliasing} />
        </ChartCard>

        <ChartCard
          id="precision"
          label="E5 - precision"
          title={`${h.precision.bits} bits per number is enough`}
          finding={`Quantising every concept and the memory to ${h.precision.bits} bits keeps accuracy at ${pct(h.precision.accuracy)}, ${h.precision.bytesPerVector} bytes per concept instead of 4096. Even 1 bit (sign only) keeps ${pct(r.precision[r.precision.length - 1].accuracy)}.`}
          method="Midrise uniform quantiser with Gaussian-optimal clipping. 32 facts, d = 1024, every query once."
        >
          <PrecisionChart data={r.precision} />
        </ChartCard>

        <ChartCard
          id="analogy"
          label="E6 - analogy"
          title="Zero-shot analogies in five instructions"
          finding={`"What plays the role in record B that x plays in record A?" With CLEAN, accuracy stays at ${pct(h.analogy.withClean)} even with ${h.analogy.roles} roles packed into one d=${h.analogy.dim} record; without it, ${pct(h.analogy.withoutClean)}.`}
          method="20 records per setting, 60 random analogies, records built and queried entirely by CISA code. No training."
        >
          <AnalogyChart data={r.analogy} />
        </ChartCard>

        <ChartCard
          id="compactness"
          label="E4 - compactness"
          title="Reasoning traces are smaller and far cheaper to run"
          finding={`CISA bytecode is ${h.compactness.minRatio.toFixed(1)} to ${h.compactness.maxRatio.toFixed(1)}x smaller than the equivalent English chain of thought. One reasoning hop costs about ${(h.compactness.cisaFlops / 1000).toFixed(0)}K floating-point operations, versus roughly ${(r.compactness.flops.llm1BPerHop / 1e9).toFixed(0)} billion for a 1B-parameter model to write the same step (~${h.compactness.flopsRatio.toLocaleString("en-US")}x, an estimate).`}
          method={`Token counts use a GPT-style pre-tokeniser approximation. LLM cost uses the standard 2 FLOPs per parameter per token. Measured VM speed: ${r.compactness.measured.hopsPerSecond.toLocaleString("en-US")} hops/s in ${r.compactness.measured.runtime}. The comparison covers the reasoning step only, not language understanding.`}
        >
          <CompactnessChart data={r.compactness.rows} />
        </ChartCard>
      </div>

      <ChartCard
        id="synthesis"
        label="E7 - negative result"
        title="Learning the opcodes themselves mostly fails, and that is informative"
        finding="Relaxing opcode choice into probabilities lets gradient descent find the two-step analogy program, and every solution it found is an algebraically equivalent program we did not write (it exploits the involution identity of correlation). With three or four slots no method reaches the bar under equal time budgets: a single correct step scores nothing on its own, so there is no gradient to follow. That is why CISA keeps opcodes symbolic and learns the operands instead (E8)."
        method={`Soft programs: every slot is a softmax over 6 opcodes and over source registers. Success means the hardened program reaches 90% of the reference program's test accuracy. ${r.synthesis[0].budgetMs / 1000}s wall-clock per run and 4 seeds per cell, so exact counts can shift by one on a different machine.`}
      >
        <SynthesisTable data={r.synthesis} />
      </ChartCard>
    </div>
  );
}
