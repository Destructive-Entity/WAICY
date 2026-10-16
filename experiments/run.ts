import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { capacity, aliasing, noiseAndHops, precision } from "./memory";
import { metacognition } from "./metacognition";
import { compactness } from "./compactness";
import { analogy } from "./analogy";
import { synthesis } from "./synthesis";
import { operandLearning } from "./operands";
import { timed } from "./common";

const only = process.argv.slice(2);
const want = (name: string) => only.length === 0 || only.includes(name);

const outDir = path.join(process.cwd(), "results");
const outFile = path.join(outDir, "results.json");

// Running a subset (e.g. `pnpm experiments synthesis`) updates only those sections.
const results: Record<string, unknown> =
  only.length && existsSync(outFile) ? (JSON.parse(readFileSync(outFile, "utf8")) as Record<string, unknown>) : {};
results.generatedAt = new Date().toISOString();
results.runtime = `Node ${process.version} on ${process.platform}/${process.arch}`;

const experiments: Array<[string, () => unknown]> = [
  ["capacity", capacity],
  ["aliasing", aliasing],
  ["noise", noiseAndHops],
  ["precision", precision],
  ["metacognition", metacognition],
  ["compactness", compactness],
  ["analogy", analogy],
  ["operands", () => operandLearning()],
  ["synthesis", () => synthesis()],
];

for (const [name, fn] of experiments) {
  if (!want(name)) continue;
  const { value, ms } = timed(fn);
  results[name] = value;
  console.log(`[cisa] ${name.padEnd(14)} ${(ms / 1000).toFixed(1)}s`);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(results, null, 2) + "\n");
console.log(`[cisa] wrote results/results.json`);
