import { describe, expect, it } from "vitest";
import { CisaVM } from "@/lib/cisa/vm";
import { ins } from "@/lib/cisa/isa";
import { Lexicon } from "@/lib/cisa/lexicon";
import { bind, cosine, permute, quantize, randomVec, rng, rotate, unbind } from "@/lib/cisa/vec";
import {
  answer,
  approxTokens,
  buildMemory,
  compileAdaptiveHop,
  compileAnalogy,
  compileQuery,
  compileRecord,
  compileStore,
  englishChainOfThought,
  makeRecordWorld,
  makeWorld,
} from "@/lib/cisa/world";

describe("vector algebra", () => {
  it("unbind inverts bind approximately", () => {
    const r = rng(1);
    const a = randomVec(1024, r);
    const b = randomVec(1024, r);
    expect(cosine(unbind(a, bind(a, b)), b)).toBeGreaterThan(0.6);
  });

  it("FFT and direct convolution agree", () => {
    const r = rng(2);
    const a = randomVec(64, r);
    const b = randomVec(64, r);
    const fast = bind(a, b);
    const slow = new Float64Array(64);
    for (let k = 0; k < 64; k++) for (let i = 0; i < 64; i++) slow[k] += a[i] * b[(k - i + 64) % 64];
    fast.forEach((v, i) => expect(v).toBeCloseTo(slow[i], 9));
  });

  it("permutation is invertible and, unlike rotation, does not commute with bind", () => {
    const r = rng(3);
    const a = randomVec(256, r);
    const b = randomVec(256, r);
    expect(cosine(permute(permute(a, 1), -1), a)).toBeCloseTo(1, 12);
    expect(cosine(bind(a, rotate(b, 1)), rotate(bind(a, b), 1))).toBeCloseTo(1, 9);
    expect(Math.abs(cosine(bind(a, permute(b, 1)), permute(bind(a, b), 1)))).toBeLessThan(0.3);
  });

  it("quantization keeps the direction at 2+ bits", () => {
    const v = randomVec(1024, rng(4));
    expect(cosine(quantize(v, 8), v)).toBeGreaterThan(0.999);
    expect(cosine(quantize(v, 2), v)).toBeGreaterThan(0.9);
    expect(cosine(quantize(v, 1), v)).toBeGreaterThan(0.75);
  });
});

describe("CISA VM", () => {
  const w = makeWorld({ dim: 1024, entities: 16, relations: 2, seed: 3 });
  const mem = buildMemory(w, false);

  it("answers multi-hop questions from superposed memory", () => {
    for (const start of w.entities.slice(0, 6)) {
      const chain = [w.relations[0], w.relations[1], w.relations[0]];
      const vm = new CisaVM(w.lexicon, { cleanupPool: w.entityIds });
      vm.memory = mem;
      const out = vm.run(compileQuery(w, start, chain)).output;
      expect(out[0].name).toBe(answer(w, start, chain));
    }
  });

  it("memory written by STORE programs equals the direct encoding", () => {
    const vm = new CisaVM(w.lexicon);
    for (const rel of w.relations) for (const [h, t] of w.facts.get(rel)!) vm.run(compileStore(w, rel, h, t));
    expect(cosine(vm.bank(0), mem[0])).toBeCloseTo(1, 9);
  });

  it("BRC only retries when the margin is low", () => {
    const shards = buildMemory(w, true);
    const vm = new CisaVM(w.lexicon, { cleanupPool: w.entityIds });
    vm.memory = [mem[0], ...shards];
    vm.setRegister(0, w.lexicon.get(w.entities[0]));
    const never = vm.run(compileAdaptiveHop(w, w.relations[0], 0));
    expect(never.trace.filter((t) => t.instruction.op === "RECALL")).toHaveLength(1);
    const always = vm.run(compileAdaptiveHop(w, w.relations[0], 1));
    expect(always.trace.filter((t) => t.instruction.op === "RECALL")).toHaveLength(2);
  });

  it("BLEND mixes by confidence and GATE scales", () => {
    const lex = new Lexicon(64, 9);
    lex.intern("x");
    const vm = new CisaVM(lex);
    const r = vm.run([ins("LOAD", { dst: 0, imm: 0 }), ins("SIM", { a: 0, b: 0 }), ins("GATE", { dst: 1, a: 0 }), ins("BLEND", { dst: 2, a: 0, b: 3 })]);
    expect(r.confidence).toBeCloseTo(1, 9);
    expect(cosine(vm.regs[1], vm.regs[0])).toBeCloseTo(1, 9);
    expect(cosine(vm.regs[2], vm.regs[0])).toBeCloseTo(1, 9);
  });

  it("solves analogies over records", () => {
    const rw = makeRecordWorld({ dim: 1024, records: 5, roles: 6, seed: 2 });
    const a = rw.records.get("rec0")!;
    const b = rw.records.get("rec3")!;
    const prog = [...compileRecord(rw, "rec0", 4), ...compileRecord(rw, "rec3", 5), ...compileAnalogy(rw, a.get("role2")!)];
    expect(new CisaVM(rw.lexicon).run(prog).output[0].name).toBe(b.get("role2"));
  });

  it("stops at maxSteps on infinite loops", () => {
    const lex = new Lexicon(64, 1);
    lex.intern("x");
    const r = new CisaVM(lex, { maxSteps: 50 }).run([ins("BRC", { a: 15, imm: 0 })]);
    expect(r.steps).toBe(50);
  });
});

describe("English baseline", () => {
  it("writes a readable chain of thought and counts tokens", () => {
    const w = makeWorld({ dim: 64, entities: 8, relations: 2, seed: 1 });
    const text = englishChainOfThought(w, w.entities[0], [w.relations[0]]);
    expect(text).toMatch(/So the answer is/);
    expect(approxTokens("Hello, world!")).toBe(4);
  });
});
