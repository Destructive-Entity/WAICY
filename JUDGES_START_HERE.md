# WAICY 2026 Contest Submission: CISA

> **Project Name:** CISA: Continuous Instruction Set Architecture  
> **Sub-title:** Symbolic Neuralese with Opcodes  
> **Created by:** [Kreflux](https://kreflux.com)  
> **Live Interactive Demo:** [https://kreflux.com/waicy](https://kreflux.com/waicy) (also at [https://waicy.netlify.app](https://waicy.netlify.app))  
> **Open Source Codebase:** [https://github.com/Destructive-Entity/WAICY](https://github.com/Destructive-Entity/WAICY)  
> **Full Research Paper:** [`docs/RESEARCH.md`](docs/RESEARCH.md)  

---

## Quick Evaluation Guide for Judges

Welcome, WAICY judges! This guide outlines everything you need to assess the project across all rubric criteria.

### 1. Instant Online Review (Zero Setup Required)
You can test the complete system in your browser without installing anything:

* **Live Demo & Benchmark Portal:** [https://kreflux.com/waicy](https://kreflux.com/waicy)
* **Step-Through Visual Debugger:** [https://kreflux.com/waicy/playground](https://kreflux.com/waicy/playground)  
  *Step instruction-by-instruction through reasoning programs and watch continuous vector superposition unfold.*
* **Empirical Evidence & Benchmark Dashboard:** [https://kreflux.com/waicy/results](https://kreflux.com/waicy/results)  
  *All 9 scientific experiments with interactive charts.*
* **Architecture & Opcode Specification:** [https://kreflux.com/waicy/spec](https://kreflux.com/waicy/spec)  
  *Full 32-bit binary instruction encoding and 18-opcode definitions.*

---

## Why CISA Stands Out (Rubric & Scoring Strengths)

### 1. Innovation and Originality
* **The Problem:** Modern AI models face a strict dilemma. They either write out thoughts in English (interpretable, but 10x slower and computationally wasteful) or pass dense hidden vectors (fast, but completely opaque "black boxes").
* **The Breakthrough:** CISA creates a third option: **Symbolic Neuralese**.
  * **Opcodes are discrete & symbolic:** `LOAD`, `BIND`, `RECALL`, `CLEAN`, `BRC` packed into 32-bit words that humans and auditors can disassemble and verify.
  * **Operands are continuous & neural:** 1024-dimensional vectors that superpose multiple relations and ideas simultaneously.

### 2. Scientific Rigor & Measurable Impact
Every single claim is backed by reproducible measurements generated from code in this repository (`results/results.json`):
* **Error Correction (E2):** Nearest-concept `CLEAN` snaps reasoning to valid concepts, maintaining **100% accuracy at 6 reasoning hops** where uncorrected latent reasoning degrades to **8% by hop 2**.
* **Metacognition & Self-Monitoring (E3):** The confidence register `C` predicts the system's own uncertainty with **AUROC 0.89**. Conditional branching (`BRC`) recovers 95.8% accuracy while skipping 30% of expensive memory lookups.
* **Extreme Compactness (E4):** Bytecode reasoning traces are **2.4x to 3.4x smaller** than English chain-of-thought, costing **~73,000x fewer FLOPs** per hop compared to language models.
* **One-Shot Learning (E8 & E8b):** Learning operands as soft distributions over symbols recovers hidden concepts from a **single example** and scores **96.8%** on unseen entities, while free unconstrained vectors memorize noise (scoring 2.2%).
* **Honest Negative Results Reported (E7):** We openly document where end-to-end discrete opcode search failed beyond 2 hops, explaining the algebraic cause.

### 3. Engineering & Completeness
* Full virtual machine (VM) implementation.
* 32-bit binary assembler and disassembler.
* Hand-derived analytical gradients for soft opcodes and operands (verified by finite differences in unit tests).
* 22 unit tests passing 100% with Vitest.
* Zero external black-box AI dependencies—everything runs natively.

---

## Local Reproduction (For Technical Reviewers)

If you would like to run the code, tests, and experiments locally on your machine:

```bash
# 1. Clone the repository
git clone https://github.com/Destructive-Entity/WAICY.git
cd WAICY

# 2. Install dependencies (requires Node.js 20+)
pnpm install

# 3. Run the comprehensive test suite
pnpm test

# 4. Assemble and execute an example CISA program
pnpm cisa examples/two-hop.cisa

# 5. Reproduce all benchmark numbers (outputs to results/results.json)
pnpm experiments

# 6. Launch the local interactive web interface
pnpm dev
```

---

## File Directory Map

* [`docs/RESEARCH.md`](docs/RESEARCH.md): The comprehensive scientific research paper.
* [`lib/cisa/`](lib/cisa/): Core engine: Vector math, instruction set encoding, VM execution, differentiable soft opcodes, and operand learning.
* [`experiments/`](experiments/): Automated runners for all 9 empirical benchmarks.
* [`results/results.json`](results/results.json): Exact numerical outputs from benchmark runs.
* [`app/`](app/) & [`components/`](components/): Interactive Next.js web application and visual step-through debugger.

---
*Created by [Kreflux](https://kreflux.com) for the WAICY 2026 World Artificial Intelligence Competition for Youth.*
