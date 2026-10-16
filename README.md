# CISA: Continuous Instruction Set Architecture

**Symbolic neuralese with opcodes.** A WAICY 2026 project.

> **Live Interactive Demo:** [https://kreflux.com/waicy](https://kreflux.com/waicy) (also at [https://waicy.netlify.app](https://waicy.netlify.app))  
> **Created by:** [Kreflux](https://kreflux.com)  
> **Judge Quick-Start Guide:** [`JUDGES_START_HERE.md`](JUDGES_START_HERE.md)  
> **Full Research Paper:** [`docs/RESEARCH.md`](docs/RESEARCH.md)  

AI systems today reason in one of two languages. They write English chains of thought, which humans can read but which are long, slow and lossy. Or they pass vectors between layers ("neuralese"), which are fast and rich but unreadable. CISA is a third option: a machine language for reasoning where

- every **opcode** is a discrete, readable cognitive step (`BIND`, `RECALL`, `CLEAN`, `BRC`, ...), packed into a 32-bit word, and
- every **operand** is a continuous high-dimensional vector that can hold many ideas at once.

A reasoning trace is a program you can disassemble, step through and audit. Its data is still neural.

```
LOAD   r0, #cyr
LOAD   r1, #mentor
BIND   r2, r1, r0      ; "mentor of Cyr"
RECALL r3, r2, @0      ; query 36 facts superposed in one 1024-d vector
PERM   r3, r3, -1      ; undo the tail permutation
CLEAN  r0, r3          ; recognise: Bo   (confidence register C = margin)
LOAD   r1, #rival
BIND   r2, r1, r0
RECALL r3, r2, @0
PERM   r3, r3, -1
CLEAN  r0, r3          ; recognise: Eli
EMIT   r0              ; -> eli
```

52 bytes. The English chain of thought for the same question is about 150 bytes and must be generated one token at a time by a language model.

## Results

All numbers come from `pnpm experiments`, which writes [`results/results.json`](results/results.json). Seeds are fixed. The demo site draws every chart from that file. Full write-up: [`docs/RESEARCH.md`](docs/RESEARCH.md).

| # | Question | Result |
|---|----------|--------|
| E8 | Can it learn a new concept from examples? | From **1 example**, a soft-symbol operand recovers the hidden relation in 3/3 runs and answers **96.8%** of questions about unseen people. An unconstrained vector ("pure neuralese") scores **2.2%**. |
| E8b | Can it learn multi-step concepts and explain them? | For a hidden `mentor -> rival` concept, the 2-hop learner recovers exactly `#mentor, #rival` in **3/3** runs (92 to 96% test accuracy). A 1-hop program cannot express it (0 to 4%). |
| E2 | Does error correction matter? | With `CLEAN` after every hop, 6-hop reasoning stays at **100%**; without it, accuracy is **8%** by hop 2. At noise 0.5: 72% vs 4% at 6 hops. |
| E3 | Does it know when it is unsure? | The `CLEAN` margin predicts correctness with **AUROC 0.89** (raw cosine 0.79). Retrying only when unsure (`BRC` at 0.40) lifts accuracy 70.8% to **95.8%**, matching always-retry while skipping **30%** of expensive lookups. |
| E1 | How much fits in one register? | Perfect recall up to 16 facts at d=256, 8 at d=512 (94% at 16), 16 at d=1024 (97% at 32) and 64 at d=2048. Capacity grows roughly linearly with width, about one fact per 32 dimensions. |
| E1b | Ablation: how to break role symmetry? | No fix 62.5%, cyclic rotation **62.5% (identical)**, random permutation **100%** at 16 facts. Rotation commutes with convolution, so it cannot help. |
| E5 | How many bits per number? | **2 bits**: 100% accuracy at 256 bytes per concept (vs 4096 for float32). 1 bit still 96.9%. |
| E6 | Zero-shot analogy? | With `CLEAN`, **100%** even with 12 roles per record (d=512); without, 15%. |
| E4 | Size and cost of a trace? | Bytecode is **2.4 to 3.4x** smaller than English CoT. One hop is ~385K FLOPs vs ~28 GFLOPs for a 1B model writing the same step (~73,000x, estimate). The VM runs ~1,500 hops/s on one CPU thread. |
| E7 | Can the opcodes themselves be learned? | **Mostly no, and we report it.** Relaxed gradient descent solves the 2-step analogy (4/4 seeds, always an equivalent program we did not write), but on 3 and 4 steps every method fails, because a single correct step scores nothing on its own. This motivated E8: keep opcodes symbolic, learn operands. |

## The architecture

- **State:** 16 vector registers (`r0`-`r15`, d = 256 to 2048), a confidence register `C`, a lexicon of up to 4096 concept vectors, and any number of memory banks.
- **Instruction word:** `opcode(8) | dst(4) | a(4) | b(4) | imm(12)`. Immediates are symbol ids, Q4.8 scalars, permutation counts, bank ids or jump targets.
- **18 opcodes:** `NOP LOAD BIND UNBIND BUNDLE PERM CLEAN SIM GATE BLEND SCALE RECALL STORE NORM BRC EMIT MOV HALT`. See [`/spec`](app/spec/page.tsx) or [`lib/cisa/isa.ts`](lib/cisa/isa.ts).
- **Algebra:** `BIND` is circular convolution, `UNBIND` circular correlation (FFT, O(d log d)), `PERM` a fixed random permutation, `CLEAN` nearest-concept recognition that sets `C = 1 - s2/s1`. This builds on Holographic Reduced Representations (Plate, 1995). CISA adds the instruction set, encoding, VM, metacognitive branch and the learning methods.
- **Continuous relaxations** ([`lib/cisa/soft.ts`](lib/cisa/soft.ts), [`lib/cisa/learn.ts`](lib/cisa/learn.ts)): opcodes and operands can each become probability distributions, trained by gradient descent with hand-derived backward passes (verified against finite differences in the tests), then hardened back to ordinary instructions.

## Run it

Requires Node 20+ and pnpm.

```bash
pnpm install
pnpm dev                        # demo site on http://localhost:3000
pnpm test                       # 22 unit tests, including gradient checks
pnpm experiments                # regenerate results/results.json (about 3 minutes)
pnpm experiments operands       # rerun one experiment, merging into results.json
pnpm cisa examples/two-hop.cisa # assemble and trace a program in the terminal
pnpm cisa --facts               # print the demo world's ground truth
```

## Repository map

```
lib/cisa/       the architecture: vec (FFT, permutation, quantisation), isa (encoding,
                assembler), lexicon, vm, world (tasks + compilers + English baseline),
                soft (differentiable opcodes), learn (differentiable operands)
experiments/    the nine experiments and the runner
results/        results.json, the single source of truth for every number
tests/          vitest suite
app/, components/  the judge demo: home, playground (step-through debugger), results, spec
examples/       .cisa programs for the CLI
docs/           RESEARCH.md, the full write-up
```

## Limitations

- Worlds are synthetic so answers cannot come from prior knowledge. Real knowledge graphs are next.
- Superposed memory has finite capacity, so large knowledge needs sharding (which E3 shows can be made adaptive).
- Learning opcode structure by gradient descent failed beyond two steps (E7).
- CISA does not parse English. It is a target language for reasoning, not a replacement for language understanding.
