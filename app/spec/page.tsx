import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";
import { EncodingDiagram } from "@/components/encoding-diagram";
import { OpcodeTable } from "@/components/opcode-table";

export const metadata: Metadata = {
  title: "Specification | CISA",
  description: "The CISA v0.1 instruction set: 18 opcodes, 32-bit encoding, continuous vector registers, and the design decisions the experiments forced.",
};

const DECISIONS = [
  {
    title: "Fixed random permutation, not rotation",
    body: "Binding is commutative, so storing (rival, x, y) also stores (rival, y, x). We first tried rotating the tail. It failed exactly as badly as doing nothing, because rotation is itself a convolution and commutes with BIND. A fixed random permutation fixes it: 62% to 100% at 16 facts.",
  },
  {
    title: "CLEAN reports a margin, not a cosine",
    body: "Raw cosine similarities sit near 0.1 in a loaded memory, too narrow for a 4-bit branch threshold. CLEAN now sets C = 1 - s2/s1, which separates right from wrong answers better (AUROC 0.89 vs 0.79) and makes BRC usable.",
  },
  {
    title: "Operands are soft symbols when learned",
    body: "Learning a free 2048-number operand memorises noise in the superposed memory. Learning a probability distribution over lexicon symbols generalises from a single example, and hardening it gives back a plain LOAD #symbol.",
  },
  {
    title: "Continuous control flow plus one discrete branch",
    body: "BLEND computes both sides of an if and mixes them by confidence, so programs stay differentiable. BRC is the single discrete jump, used for metacognition: retry only when unsure.",
  },
];

export default function SpecPage() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-12 px-4 py-8 md:px-6 md:py-12">
      <PageIntro
        kicker="CISA v0.1"
        title="Specification"
        lead="A register machine with 16 vector registers, a confidence register C, a lexicon of concept vectors and any number of memory banks. Instructions are 32 bits. Opcodes are discrete; register contents are real vectors (d = 256 to 2048 in our experiments)."
      />

      <section aria-labelledby="enc" className="flex flex-col gap-4">
        <h2 id="enc" className="text-xl font-semibold tracking-tight">
          Instruction word
        </h2>
        <EncodingDiagram />
        <p className="max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground">
          Scalars use Q4.8 fixed point (range -8 to 8, step 1/256). Symbol immediates index a lexicon of up to 4096 concepts. A full multi-hop question is
          5 instructions per hop plus 3, so 20 bytes per reasoning step.
        </p>
      </section>

      <section aria-labelledby="ops" className="flex flex-col gap-4">
        <h2 id="ops" className="text-xl font-semibold tracking-tight">
          Opcodes
        </h2>
        <OpcodeTable />
        <p className="max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground">
          BIND is circular convolution and UNBIND is circular correlation, computed with an FFT in O(d log d). Concepts are random vectors with N(0, 1/d)
          components, so in high dimension they are nearly orthogonal and many bound pairs can be added into one register and still be read back. This is
          the Holographic Reduced Representation family of vector symbolic architectures (Plate, 1995); CISA contributes the instruction set, encoding,
          execution model, metacognitive branch and learning methods on top.
        </p>
      </section>

      <section aria-labelledby="dec" className="flex flex-col gap-4">
        <h2 id="dec" className="text-xl font-semibold tracking-tight">
          Decisions the data forced
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {DECISIONS.map((d) => (
            <article key={d.title} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-5">
              <h3 className="font-semibold">{d.title}</h3>
              <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{d.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="ex" className="flex flex-col gap-4">
        <h2 id="ex" className="text-xl font-semibold tracking-tight">
          Example: metacognitive recall
        </h2>
        <pre className="overflow-x-auto rounded-lg border border-border bg-card p-4 font-mono text-xs leading-6 md:text-sm">
          {`LOAD   r1, #mentor        ; evoke the relation
BIND   r2, r1, r0         ; "mentor of <r0>"
RECALL r3, r2, @0         ; ask the cheap shared memory
PERM   r3, r3, -1         ; undo the tail permutation
CLEAN  r4, r3             ; recognise; C = margin
BRC    0.40, 7            ; unsure? jump to the careful path
HALT
RECALL r3, r2, @1         ; ask the precise per-relation memory
PERM   r3, r3, -1
CLEAN  r4, r3`}
        </pre>
      </section>
    </div>
  );
}
