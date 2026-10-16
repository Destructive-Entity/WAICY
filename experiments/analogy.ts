import { CisaVM } from "@/lib/cisa/vm";
import { compileAnalogy, compileRecord, makeRecordWorld } from "@/lib/cisa/world";
import { pick, round } from "./common";
import { rng } from "@/lib/cisa/vec";

/**
 * E6. Zero-shot analogy over structured records ("what is the dollar of
 * Mexico?"). The record, the question and the answer are all CISA code;
 * nothing is trained.
 */
export function analogy() {
  const rows: Array<{ dim: number; roles: number; withClean: number; withoutClean: number; instructions: number }> = [];
  for (const dim of [256, 512, 1024]) {
    for (const roles of [2, 4, 6, 8, 12]) {
      const rw = makeRecordWorld({ dim, records: 20, roles, seed: dim * 13 + roles });
      const names = [...rw.records.keys()];
      const rand = rng(dim + roles);
      let okClean = 0;
      let okRaw = 0;
      let instructions = 0;
      const trials = 60;
      for (let t = 0; t < trials; t++) {
        const a = pick(names, rand);
        let b = a;
        while (b === a) b = pick(names, rand);
        const role = pick(rw.roles, rand);
        const fillerA = rw.records.get(a)!.get(role)!;
        const expected = rw.records.get(b)!.get(role)!;
        for (const clean of [true, false]) {
          const prog = [...compileRecord(rw, a, 4), ...compileRecord(rw, b, 5), ...compileAnalogy(rw, fillerA, clean)];
          if (clean) instructions += prog.length;
          const res = new CisaVM(rw.lexicon).run(prog);
          if (res.output[0]?.name === expected) {
            if (clean) okClean++;
            else okRaw++;
          }
        }
      }
      rows.push({ dim, roles, withClean: round(okClean / trials), withoutClean: round(okRaw / trials), instructions: round(instructions / trials, 1) });
    }
  }
  return rows;
}
