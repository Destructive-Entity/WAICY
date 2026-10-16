import { CisaVM, type RunResult } from "@/lib/cisa/vm";
import { disassemble, encode, hex, type Instruction } from "@/lib/cisa/isa";
import { buildMemory, compileQuery, makeWorld, type World } from "@/lib/cisa/world";
import type { Vec } from "@/lib/cisa/vec";

export const DEMO_DIM = 1024;

let cached: { world: World; memory: Vec[] } | null = null;

/**
 * The world used by the interactive demo: 12 people, 3 relations, 36 facts
 * superposed into one 1024-dimensional memory vector. Seeded, so the server
 * and every browser build the exact same vectors.
 */
export function demoWorld(): { world: World; memory: Vec[] } {
  if (!cached) {
    const world = makeWorld({ dim: DEMO_DIM, entities: 12, relations: 3, seed: 7 });
    cached = { world, memory: buildMemory(world, false) };
  }
  return cached;
}

export function runDemo(program: Instruction[], opts: { noise?: number } = {}): RunResult {
  const { world, memory } = demoWorld();
  const vm = new CisaVM(world.lexicon, { trace: true, noise: opts.noise, seed: 11, cleanupPool: world.entityIds, maxSteps: 400 });
  vm.memory = memory;
  return vm.run(program);
}

/** Cyr's mentor is Bo, and Bo's rival is Eli: three different people, so every hop is visible. */
export const DEMO_START = "cyr";
export const DEMO_CHAIN = ["mentor", "rival"];

export function defaultDemoProgram(): Instruction[] {
  const { world } = demoWorld();
  return compileQuery(world, DEMO_START, DEMO_CHAIN);
}

export function listing(program: Instruction[]): Array<{ hex: string; text: string }> {
  const { world } = demoWorld();
  return program.map((i) => ({ hex: hex(encode(i)), text: disassemble(i, world.lexicon) }));
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ");
}
