import { describe, expect, it } from "vitest";
import { SoftProgram, SOFT_OPS, type SoftExample } from "@/lib/cisa/soft";
import { bind, normalize, randomVec, rng, cosine } from "@/lib/cisa/vec";

function setup(seed = 3, lossKind: "contrastive" | "cosine" = "contrastive") {
  const d = 64;
  const rand = rng(seed);
  const codebook = Array.from({ length: 6 }, () => normalize(randomVec(d, rand)));
  const ex: SoftExample = {
    inputs: [randomVec(d, rand), randomVec(d, rand), randomVec(d, rand)],
    target: codebook[2],
    targetName: "c2",
  };
  const sp = new SoftProgram({ inputs: 3, slots: 2, dim: d, codebook, codebookNames: codebook.map((_, i) => `c${i}`), seed, loss: lossKind });
  for (const p of sp.params) for (const z of [p.op, p.a, p.b]) for (let i = 0; i < z.length; i++) z[i] = (rand() - 0.5) * 2;
  return { sp, ex };
}

describe("soft CISA", () => {
  it.each(["contrastive", "cosine"] as const)("analytic gradients match finite differences (%s loss)", (lossKind) => {
    const { sp, ex } = setup(3, lossKind);
    const grads = sp.params.map((p) => ({ op: new Float64Array(p.op.length), a: new Float64Array(p.a.length), b: new Float64Array(p.b.length) }));
    // @ts-expect-error accessing private method for the test
    sp.backward(ex, grads);
    const eps = 1e-5;
    let checked = 0;
    for (let s = 0; s < sp.params.length; s++) {
      for (const key of ["op", "a", "b"] as const) {
        const z = sp.params[s][key];
        for (let i = 0; i < z.length; i++) {
          const orig = z[i];
          z[i] = orig + eps;
          const lp = sp.loss(ex);
          z[i] = orig - eps;
          const lm = sp.loss(ex);
          z[i] = orig;
          const numeric = (lp - lm) / (2 * eps);
          expect(grads[s][key][i]).toBeCloseTo(numeric, 5);
          checked++;
        }
      }
    }
    expect(checked).toBe(SOFT_OPS.length * 2 + 3 + 3 + 4 + 4);
    expect(SOFT_OPS).toContain("PERM");
  });

  it("hardened program runs the argmax opcodes", () => {
    const { sp } = setup();
    const prog = sp.harden();
    expect(prog).toHaveLength(4);
    expect(prog[prog.length - 1].op).toBe("HALT");
  });

  it("bind is invertible enough for recovery", () => {
    const rand = rng(1);
    const a = randomVec(256, rand);
    const b = randomVec(256, rand);
    expect(cosine(bind(a, b), b)).toBeLessThan(0.3);
  });
});
