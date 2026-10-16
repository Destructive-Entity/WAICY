# CISA: an instruction set for symbolic neuralese

*WAICY 2026 research write-up. All figures are reproducible with `pnpm experiments`; numbers below are copied from `results/results.json`.*

## Abstract

Language models reason either in natural language, which is interpretable but verbose, or in hidden vectors, which are efficient but opaque. We propose **CISA (Continuous Instruction Set Architecture)**, a register machine whose opcodes are discrete cognitive operations and whose operands are continuous high-dimensional vectors. Programs are 32-bit-word bytecode that can be disassembled and audited, while the data they manipulate is distributed and superposed. We implement the ISA, an assembler, a virtual machine, and two continuous relaxations (soft opcodes and soft operands) with hand-derived gradients. Across nine experiments we find that (1) a nearest-concept `CLEAN` opcode acts as error correction, keeping 6-hop reasoning at 100% where the uncorrected program falls to 8% by hop 2; (2) a recognition-margin confidence register predicts the machine's own errors (AUROC 0.89), and a single discrete branch on it recovers always-retry accuracy while skipping 30% of retries; (3) learning operands as distributions over symbols identifies a hidden relation from one example and generalises to 96.8% of unseen entities, while an unconstrained vector reaches 2.2%; and (4) learning the opcode structure itself by gradient descent works for two steps but fails for three or more. We also report two design errors that the experiments exposed and corrected.

## 1. Motivation

Chain-of-thought prompting made model reasoning visible, but each step costs many tokens, and each token costs a full forward pass. Proposals to let models "think in latent space" save that cost but give up the ability to inspect what was thought. We ask whether a middle representation can keep **inspectable structure** (discrete operations a human can read) while keeping **neural content** (continuous, superposed, noise-tolerant data), and whether such a representation has measurable advantages.

## 2. Architecture

**State.** Sixteen vector registers `r0`-`r15` in R^d (d = 256 to 2048), a scalar confidence register `C`, a lexicon of up to 4096 named concept vectors with i.i.d. N(0, 1/d) components, and any number of memory banks.

**Encoding.** One instruction is 32 bits: `opcode(8) | dst(4) | a(4) | b(4) | imm(12)`. The immediate is read per opcode as a symbol id, a Q4.8 fixed-point scalar, a permutation count, a bank id, or a jump target.

**Opcodes (18).** `LOAD` (evoke a concept), `BIND`/`UNBIND` (circular convolution and correlation: associate, and ask "what was paired with this?"), `BUNDLE` (superpose), `PERM` (fixed random permutation: order and asymmetric roles), `CLEAN` (snap to the nearest concept and set `C`), `SIM` (compare), `GATE` and `BLEND` (continuous attention and continuous if/else), `SCALE`, `NORM`, `RECALL`/`STORE` (memory), `BRC` (branch if `C` is below a 4-bit threshold), `EMIT`, `MOV`, `NOP`, `HALT`.

**Memory.** A fact (relation, head, tail) is stored as `(rel (*) head) (*) P(tail)` and added into a bank. One `RECALL` with key `rel (*) head` correlates the key against every fact at once.

The vector algebra follows Holographic Reduced Representations (Plate, 1995) and the wider family of vector symbolic architectures (Kanerva, 2009). The contribution here is the instruction set built on it: the encoding, the execution model with a confidence register and a metacognitive branch, compilers from structured questions, and the learning methods.

## 3. Continuous relaxations

**Soft opcodes (`lib/cisa/soft.ts`).** Each of L program slots holds a softmax over opcodes and two softmaxes over source registers. A slot computes every opcode on the expected operands and mixes the results. A straight-through variant executes one Gumbel-sampled discrete program forward and uses the relaxed gradient backward. Programs are hardened by argmax.

**Soft operands (`lib/cisa/learn.ts`).** Opcodes are fixed (`LOAD, BIND, RECALL, PERM, CLEAN` per hop) and each hop's key is learned, either as a free d-dimensional vector or as a softmax over lexicon symbols (a "soft LOAD"). Hardening the latter yields `LOAD #symbol`.

Both use a contrastive decoding loss (cross-entropy of reading the output as the target among all lexicon entries). All backward passes are derived by hand and checked against central finite differences to 5 decimal places (`tests/soft.test.ts`).

## 4. Experiments and results

All worlds are synthetic social graphs (people and relations such as mentor and rival) so that no answer can be guessed from prior knowledge. Every program is executed on the real VM unless noted.

| Exp. | Setup | Finding |
|------|-------|---------|
| E1 Capacity | 8 to 256 facts in one bank, d in {256, 512, 1024, 2048} | Perfect recall up to 16 / 8 / 16 / 64 facts respectively, with 94 to 97% one step beyond. Roughly linear in d. |
| E1b Aliasing | 16 to 128 facts, d = 1024 | No fix 62.5%, rotation 62.5%, random permutation 100% at 16 facts. |
| E2 Error correction | 32 facts, d = 1024, 1 to 6 hops, noise 0 to 1.5 | CLEAN every hop: 100% at 6 hops (noise 0), 72% (noise 0.5). Without: 8% at 2 hops, 4% at 6 hops (noise 0.5). |
| E3 Metacognition | 96 facts, d = 1024; shared bank vs per-relation banks | Margin AUROC 0.89 (cosine 0.79). BRC at 0.40: 95.8% accuracy with 1.70 recalls per question vs 2.00 for always-retry; shared bank alone 70.8%. |
| E4 Compactness | 1 to 6 hops, 20 questions each | 2.4 to 3.4x fewer bytes than English CoT. About 385K FLOPs per hop vs about 2.8e10 for a 1B-parameter model writing ~14 tokens (estimate, reasoning step only). 1,498 hops/s measured. |
| E5 Precision | 32 facts, d = 1024 | 8, 4 and 2 bits: 100%. 1 bit: 96.9%. 256 bytes per concept at 2 bits. |
| E6 Analogy | 2 to 12 roles per record, d in {256, 512, 1024} | With CLEAN: 90 to 100% everywhere; at d = 512 and 12 roles, 100% vs 15% without. |
| E7 Opcode search | 3 tasks, 2 to 4 slots, 3 s per run, 4 seeds | 2-slot analogy: relaxed gradient 4/4, straight-through 0/4, random search 1/4. 3-slot and 4-slot tasks: 0/4 for every method (random search reached 78% twice, below the 90%-of-reference bar). |
| E8 Operand learning | d = 2048, 96 facts, 1 to 8 examples, 3 seeds | Soft symbols: 95.8 to 97.6% on unseen people at every training size (96.8% from 1 example), relation recovered 3/3 every time. Free vectors: 0 to 9.5%. |
| E8b Composition | hidden mentor -> rival, 8 examples | 2-hop learner recovers exactly `#mentor, #rival` 3/3 (91.7 to 95.8%). 1-hop learner: 0 to 4.2%. |

## 5. What the experiments changed

Two parts of the design were wrong at first and were fixed because of measurements, which we consider part of the result.

1. **PERM was a rotation.** Our first symmetry-breaking step rotated the tail vector. It produced exactly the same accuracy as no fix. The reason is that a cyclic rotation is a convolution with a shifted delta, so it commutes with `BIND`, and `bind(bind(r, x), rot(y))` equals `rot(bind(bind(r, x), y))`. A fixed random permutation does not commute and fixes the aliasing (E1b).
2. **`C` was a cosine.** In a loaded memory, winning similarities cluster near 0.1, too narrow for a 4-bit branch threshold. Redefining `CLEAN`'s confidence as the margin `1 - s2/s1` improved its predictive power (AUROC 0.79 to 0.89) and made `BRC` useful (E3).

Learning also took three attempts. Cosine loss collapsed onto a blurred average of the codebook, which is mildly similar to every target; a contrastive loss fixed that. Free operand vectors overfitted superposition noise; constraining them to distributions over symbols fixed that, and also made the result readable.

## 6. Discussion

The results suggest a division of labour. **Structure should stay symbolic**: searching over opcodes has no useful gradient (E7) and readable opcodes are what make traces auditable. **Content should stay continuous**: superposition gives parallel recall (E1), cleanup gives error correction (E2), the confidence margin gives self-monitoring (E3), and learning over soft symbols generalises from one example while staying interpretable (E8). Pure neuralese, modelled here by free operand vectors, was the worst learner in our tests.

## 7. Limitations and future work

- Synthetic worlds; next is a real knowledge graph (for example a Wikidata subset) with sharded banks.
- CISA does not read language. A natural next step is a small model that compiles questions into CISA, using CISA's verifiable execution as a training signal.
- Capacity is about d/32 facts per bank; hierarchical or learned sharding is open.
- Wall-clock budgets in E7 make exact success counts machine-dependent by about one seed.
- FLOP comparisons with language models are estimates and cover only the reasoning step.

## References

- T. Plate. Holographic Reduced Representations. *IEEE Transactions on Neural Networks*, 1995.
- P. Kanerva. Hyperdimensional Computing. *Cognitive Computation*, 2009.
- A. Gaunt et al. TerpreT: A Probabilistic Programming Language for Program Induction. 2016. (Gradient-based program induction often underperforms discrete search, consistent with E7.)
- E. Jang, S. Gu, B. Poole. Categorical Reparameterization with Gumbel-Softmax. *ICLR*, 2017.
- J. Wei et al. Chain-of-Thought Prompting Elicits Reasoning in Large Language Models. *NeurIPS*, 2022.
- J. Max. Quantizing for Minimum Distortion. *IRE Transactions on Information Theory*, 1960.
