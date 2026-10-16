import { CisaVM } from "@/lib/cisa/vm";
import { disassemble } from "@/lib/cisa/isa";
import { Lexicon } from "@/lib/cisa/lexicon";
import {
  runHard,
  searchSpaceSize,
  shapeToInstructions,
  SoftProgram,
  softToHardShape,
  SOFT_OPS,
  type SoftExample,
  type SoftOp,
} from "@/lib/cisa/soft";
import { addInPlace, bind, dot, normalize, rng, zeros, type Vec } from "@/lib/cisa/vec";
import { buildMemory, makeRecordWorld, makeWorld } from "@/lib/cisa/world";
import { pick, round } from "./common";

type Shape = Array<{ op: SoftOp; a: number; b: number }>;

interface Task {
  name: string;
  description: string;
  inputs: number;
  slots: number;
  dim: number;
  codebook: Vec[];
  codebookNames: string[];
  lexicon: Lexicon;
  reference: Shape;
  sample: (rand: () => number) => SoftExample;
}

function recordVec(rw: ReturnType<typeof makeRecordWorld>, name: string): Vec {
  const out = zeros(rw.lexicon.dim);
  for (const [role, filler] of rw.records.get(name)!) addInPlace(out, bind(rw.lexicon.get(role), rw.lexicon.get(filler)));
  return out;
}

function analogyTask(withDistractor: boolean): Task {
  const dim = 256;
  const rw = makeRecordWorld({ dim, records: 30, roles: 4, seed: withDistractor ? 8 : 5 });
  const names = [...rw.records.keys()];
  const L = rw.lexicon;
  return {
    name: withDistractor ? "analogy+distractor" : "analogy",
    description: withDistractor
      ? "inputs: fillerA, recordA, recordB, distractor record. target: the filler of recordB that plays fillerA's role."
      : "inputs: fillerA, recordA, recordB. target: the filler of recordB that plays fillerA's role.",
    inputs: withDistractor ? 4 : 3,
    slots: withDistractor ? 3 : 2,
    dim,
    codebook: L.vectors.map(normalize),
    codebookNames: L.names,
    lexicon: L,
    reference: withDistractor
      ? [
          { op: "UNBIND", a: 0, b: 1 },
          { op: "CLEAN", a: 4, b: 4 },
          { op: "UNBIND", a: 5, b: 2 },
        ]
      : [
          { op: "UNBIND", a: 0, b: 1 },
          { op: "UNBIND", a: 3, b: 2 },
        ],
    sample: (rand) => {
      const a = pick(names, rand);
      let b = a;
      while (b === a) b = pick(names, rand);
      let c = a;
      while (c === a || c === b) c = pick(names, rand);
      const role = pick(rw.roles, rand);
      const fa = rw.records.get(a)!.get(role)!;
      const fb = rw.records.get(b)!.get(role)!;
      const inputs = [L.get(fa), recordVec(rw, a), recordVec(rw, b)];
      if (withDistractor) inputs.push(recordVec(rw, c));
      return { inputs, target: L.get(fb), targetName: fb };
    },
  };
}

function hopTask(): Task {
  const dim = 512;
  const w = makeWorld({ dim, entities: 12, relations: 2, seed: 2 });
  const mem = normalize(buildMemory(w, false)[0]);
  return {
    name: "memory hop",
    description: "inputs: memory, relation, entity, distractor entity. target: the related entity (needs BIND, RECALL, un-PERM, CLEAN).",
    inputs: 4,
    slots: 4,
    dim,
    codebook: w.lexicon.vectors.map(normalize),
    codebookNames: w.lexicon.names,
    lexicon: w.lexicon,
    reference: [
      { op: "BIND", a: 1, b: 2 },
      { op: "UNBIND", a: 4, b: 0 },
      { op: "PERM", a: 5, b: 5 },
      { op: "CLEAN", a: 6, b: 6 },
    ],
    sample: (rand) => {
      const rel = pick(w.relations, rand);
      const head = pick(w.entities, rand);
      const dis = pick(w.entities, rand);
      const tail = w.facts.get(rel)!.get(head)!;
      return { inputs: [mem, w.lexicon.get(rel), w.lexicon.get(head), w.lexicon.get(dis)], target: w.lexicon.get(tail), targetName: tail };
    },
  };
}

function accuracy(task: Task, shape: Shape, examples: SoftExample[]): number {
  let ok = 0;
  for (const ex of examples) {
    const out = runHard(shape, ex.inputs, task.codebook);
    let best = 0;
    let bs = -Infinity;
    task.codebook.forEach((c, k) => {
      const s = dot(out, c);
      if (s > bs) {
        bs = s;
        best = k;
      }
    });
    if (task.codebookNames[best] === ex.targetName) ok++;
  }
  return ok / examples.length;
}

/** Runs the hardened program on the real VM, to prove it is ordinary CISA code. */
function vmAccuracy(task: Task, shape: Shape, examples: SoftExample[]): number {
  const prog = shapeToInstructions(shape, task.inputs);
  let ok = 0;
  for (const ex of examples) {
    const vm = new CisaVM(task.lexicon);
    ex.inputs.forEach((v, i) => vm.setRegister(i, v));
    if (vm.run(prog).output[0]?.name === ex.targetName) ok++;
  }
  return ok / examples.length;
}

function randomShape(task: Task, rand: () => number): Shape {
  return Array.from({ length: task.slots }, (_, s) => ({
    op: pick(SOFT_OPS, rand),
    a: Math.floor(rand() * (task.inputs + s)),
    b: Math.floor(rand() * (task.inputs + s)),
  }));
}

type Method = "relaxed gradient" | "straight-through gradient" | "random search";

function search(task: Task, method: Method, seed: number, budgetMs: number, valid: SoftExample[]) {
  const rand = rng(seed * 7 + 1);
  const t0 = performance.now();
  let evaluated = 0;
  let shape: Shape;
  if (method === "random search") {
    let best: { shape: Shape; acc: number } = { shape: randomShape(task, rand), acc: -1 };
    const probe = valid.slice(0, 16);
    while (performance.now() - t0 < budgetMs) {
      const cand = randomShape(task, rand);
      const acc = accuracy(task, cand, probe);
      evaluated++;
      if (acc > best.acc) best = { shape: cand, acc };
    }
    shape = best.shape;
  } else {
    const sp = new SoftProgram({
      inputs: task.inputs,
      slots: task.slots,
      dim: task.dim,
      codebook: task.codebook,
      codebookNames: task.codebookNames,
      seed,
      mode: method === "relaxed gradient" ? "relaxed" : "straight-through",
    });
    while (performance.now() - t0 < budgetMs) {
      sp.step(Array.from({ length: 8 }, () => task.sample(rand)), 0.1);
      evaluated += 8;
    }
    const candidates: Shape[] = [softToHardShape(sp)];
    if (sp.best) candidates.push(sp.best.shape);
    shape = candidates.map((c) => ({ c, acc: accuracy(task, c, valid) })).sort((x, y) => y.acc - x.acc)[0].c;
  }
  return { shape, evaluated, ms: performance.now() - t0 };
}

/** E7. Can the opcode structure itself be learned? Equal wall-clock budget per method. */
export function synthesis(budgetMs = 3000, seeds = 4) {
  const tasks = [analogyTask(false), analogyTask(true), hopTask()];
  const methods: Method[] = ["relaxed gradient", "straight-through gradient", "random search"];
  return tasks.map((task) => {
    const testRand = rng(4242);
    const test = Array.from({ length: 100 }, () => task.sample(testRand));
    const validRand = rng(777);
    const valid = Array.from({ length: 32 }, () => task.sample(validRand));
    const referenceAccuracy = accuracy(task, task.reference, test);
    const results = methods.map((method) => {
      const runs = Array.from({ length: seeds }, (_, i) => {
        const r = search(task, method, i + 1, budgetMs, valid);
        const acc = accuracy(task, r.shape, test);
        return {
          seed: i + 1,
          accuracy: round(acc),
          vmAccuracy: round(vmAccuracy(task, r.shape, test.slice(0, 40))),
          success: acc >= 0.9 * referenceAccuracy,
          evaluated: r.evaluated,
          program: shapeToInstructions(r.shape, task.inputs).map((i) => disassemble(i)),
        };
      });
      return {
        method,
        successRate: round(runs.filter((r) => r.success).length / runs.length),
        meanAccuracy: round(runs.reduce((s, r) => s + r.accuracy, 0) / runs.length),
        runs,
      };
    });
    return {
      task: task.name,
      description: task.description,
      inputs: task.inputs,
      slots: task.slots,
      searchSpace: searchSpaceSize(task.inputs, task.slots),
      referenceAccuracy: round(referenceAccuracy),
      referenceProgram: shapeToInstructions(task.reference, task.inputs).map((i) => disassemble(i)),
      budgetMs,
      results,
    };
  });
}
