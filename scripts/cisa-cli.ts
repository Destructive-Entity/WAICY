import { readFileSync } from "node:fs";
import { assemble, disassemble, encode, hex } from "@/lib/cisa/isa";
import { answer } from "@/lib/cisa/world";
import { demoWorld, runDemo } from "@/lib/demo";

/**
 * Usage: pnpm cisa <file.cisa> [--noise 0.5] [--facts]
 * Assembles a program against the demo world (12 people, 3 relations,
 * one shared memory bank @0), runs it, and prints a full trace.
 */
const args = process.argv.slice(2);
const { world } = demoWorld();

if (args.includes("--facts")) {
  for (const rel of world.relations) {
    for (const [h, t] of world.facts.get(rel)!) console.log(`${rel.padEnd(9)} ${h.padEnd(6)} -> ${t}`);
  }
  process.exit(0);
}

const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("usage: pnpm cisa <file.cisa> [--noise 0.5] [--facts]");
  console.error(`symbols: ${world.relations.join(", ")}, ${world.entities.join(", ")}`);
  process.exit(1);
}
const noiseIdx = args.indexOf("--noise");
const noise = noiseIdx >= 0 ? Number(args[noiseIdx + 1]) : 0;

const program = assemble(readFileSync(file, "utf8"), world.lexicon);
console.log(`; ${program.length} instructions, ${program.length * 4} bytes\n`);
program.forEach((ins, i) => console.log(`${String(i).padStart(3)}  ${hex(encode(ins))}  ${disassemble(ins, world.lexicon)}`));

const res = runDemo(program, { noise });
console.log("\n; trace");
for (const t of res.trace) {
  const wrote = t.wrote === null ? "" : `r${t.wrote} ~ ${world.lexicon.nearest(t.registers![t.wrote], 1)[0].name}`;
  const emitted = t.emitted ? `EMIT ${t.emitted.name} (${t.emitted.sim.toFixed(2)})` : "";
  console.log(`${String(t.pc).padStart(3)}  C=${t.confidence.toFixed(3)}  ${disassemble(t.instruction, world.lexicon).padEnd(26)} ${wrote}${emitted}`);
}
console.log(`\n; output: ${res.output.map((o) => o.name).join(", ") || "(none)"}`);

const header = readFileSync(file, "utf8").match(/;\s*expect:\s*(\w+)\s+(.+)/);
if (header) {
  const expected = answer(world, header[1], header[2].trim().split(/\s+/));
  console.log(`; expected: ${expected} ${res.output.at(-1)?.name === expected ? "(correct)" : "(WRONG)"}`);
}
