/**
 * CISA instruction set: discrete opcodes over continuous vector registers.
 *
 * Every instruction is one 32-bit word:
 *
 *   31      24 23  20 19  16 15  12 11           0
 *  +----------+------+------+------+--------------+
 *  |  opcode  | dst  |  a   |  b   |   imm (12)   |
 *  +----------+------+------+------+--------------+
 *
 * imm is read per opcode as an unsigned symbol id (0..4095), a signed
 * fixed-point scalar (Q4.8, range [-8, 8) in steps of 1/256), a signed shift,
 * a memory bank id, or a jump target.
 */

export const REGISTER_COUNT = 16;
export const IMM_BITS = 12;
export const SCALAR_FRAC_BITS = 8;

export type ImmKind = "none" | "symbol" | "scalar" | "shift" | "bank" | "target";

export interface OpcodeSpec {
  code: number;
  mnemonic: string;
  /** Which register fields the opcode reads. */
  fields: ReadonlyArray<"dst" | "a" | "b">;
  imm: ImmKind;
  summary: string;
  /** The cognitive operation this opcode stands for. */
  cognition: string;
}

export const OPCODES = [
  { code: 0x00, mnemonic: "NOP", fields: [], imm: "none", summary: "Do nothing.", cognition: "Idle" },
  { code: 0x01, mnemonic: "LOAD", fields: ["dst"], imm: "symbol", summary: "dst = lexicon[imm]", cognition: "Evoke a concept" },
  { code: 0x02, mnemonic: "BIND", fields: ["dst", "a", "b"], imm: "none", summary: "dst = a (*) b  (circular convolution)", cognition: "Associate / assign a role" },
  { code: 0x03, mnemonic: "UNBIND", fields: ["dst", "a", "b"], imm: "none", summary: "dst = a (#) b  (circular correlation, inverse of BIND)", cognition: "Ask: what was paired with a?" },
  { code: 0x04, mnemonic: "BUNDLE", fields: ["dst", "a", "b"], imm: "scalar", summary: "dst = a + imm * b", cognition: "Hold several ideas at once" },
  { code: 0x05, mnemonic: "PERM", fields: ["dst", "a"], imm: "shift", summary: "dst = P^imm(a), P a fixed random permutation", cognition: "Mark order / sequence position" },
  { code: 0x06, mnemonic: "CLEAN", fields: ["dst", "a"], imm: "none", summary: "dst = nearest lexicon item to a, C = margin 1 - s2/s1", cognition: "Recognise / snap to a known concept" },
  { code: 0x07, mnemonic: "SIM", fields: ["a", "b"], imm: "none", summary: "C = cos(a, b)", cognition: "Compare" },
  { code: 0x08, mnemonic: "GATE", fields: ["dst", "a"], imm: "none", summary: "dst = C * a", cognition: "Attend in proportion to belief" },
  { code: 0x09, mnemonic: "BLEND", fields: ["dst", "a", "b"], imm: "none", summary: "dst = C * a + (1 - C) * b", cognition: "Continuous if/else (both branches, weighted)" },
  { code: 0x0a, mnemonic: "SCALE", fields: ["dst", "a"], imm: "scalar", summary: "dst = imm * a", cognition: "Emphasise or suppress" },
  { code: 0x0b, mnemonic: "RECALL", fields: ["dst", "a"], imm: "bank", summary: "dst = a (#) memory[imm]", cognition: "Query long-term memory" },
  { code: 0x0c, mnemonic: "STORE", fields: ["a"], imm: "bank", summary: "memory[imm] += a", cognition: "Commit to long-term memory" },
  { code: 0x0d, mnemonic: "NORM", fields: ["dst", "a"], imm: "none", summary: "dst = a / |a|", cognition: "Renormalise attention energy" },
  { code: 0x0e, mnemonic: "BRC", fields: [], imm: "target", summary: "if C < a/15 then pc = imm  (a holds a 4-bit threshold)", cognition: "Retry when unsure (discrete control)" },
  { code: 0x0f, mnemonic: "EMIT", fields: ["a"], imm: "none", summary: "output nearest lexicon item to a", cognition: "Say / act on a conclusion" },
  { code: 0x10, mnemonic: "MOV", fields: ["dst", "a"], imm: "none", summary: "dst = a", cognition: "Copy a thought" },
  { code: 0x11, mnemonic: "HALT", fields: [], imm: "none", summary: "Stop.", cognition: "Done thinking" },
] as const satisfies ReadonlyArray<OpcodeSpec>;

export type Mnemonic = (typeof OPCODES)[number]["mnemonic"];

const BY_MNEMONIC = new Map<string, OpcodeSpec>(OPCODES.map((o) => [o.mnemonic, o]));
const BY_CODE = new Map<number, OpcodeSpec>(OPCODES.map((o) => [o.code, o]));

export function opcode(m: Mnemonic): OpcodeSpec {
  return BY_MNEMONIC.get(m)!;
}

export function opcodeByCode(code: number): OpcodeSpec | undefined {
  return BY_CODE.get(code);
}

export interface Instruction {
  op: Mnemonic;
  dst: number;
  a: number;
  b: number;
  /** Raw 12-bit immediate field (already encoded). */
  imm: number;
}

export function ins(op: Mnemonic, fields: Partial<Omit<Instruction, "op">> = {}): Instruction {
  return { op, dst: fields.dst ?? 0, a: fields.a ?? 0, b: fields.b ?? 0, imm: fields.imm ?? 0 };
}

export function encodeScalar(x: number): number {
  const max = 2 ** (IMM_BITS - 1) - 1;
  const q = Math.max(-max - 1, Math.min(max, Math.round(x * 2 ** SCALAR_FRAC_BITS)));
  return q & ((1 << IMM_BITS) - 1);
}

export function decodeScalar(imm: number): number {
  return signExtend(imm) / 2 ** SCALAR_FRAC_BITS;
}

export function encodeSigned(x: number): number {
  return Math.round(x) & ((1 << IMM_BITS) - 1);
}

export function signExtend(imm: number): number {
  const sign = 1 << (IMM_BITS - 1);
  return (imm & sign) !== 0 ? imm - (1 << IMM_BITS) : imm;
}

export function encode(i: Instruction): number {
  const spec = opcode(i.op);
  checkReg(i.dst);
  checkReg(i.a);
  checkReg(i.b);
  if (i.imm < 0 || i.imm >= 1 << IMM_BITS) throw new RangeError(`imm out of range: ${i.imm}`);
  return ((spec.code << 24) | (i.dst << 20) | (i.a << 16) | (i.b << 12) | i.imm) >>> 0;
}

export function decode(word: number): Instruction {
  const code = (word >>> 24) & 0xff;
  const spec = opcodeByCode(code);
  if (!spec) throw new Error(`Unknown opcode 0x${code.toString(16)}`);
  return {
    op: spec.mnemonic as Mnemonic,
    dst: (word >>> 20) & 0xf,
    a: (word >>> 16) & 0xf,
    b: (word >>> 12) & 0xf,
    imm: word & 0xfff,
  };
}

export function toBytecode(program: Instruction[]): Uint8Array {
  const out = new Uint8Array(program.length * 4);
  const view = new DataView(out.buffer);
  program.forEach((p, idx) => view.setUint32(idx * 4, encode(p), false));
  return out;
}

export function fromBytecode(bytes: Uint8Array): Instruction[] {
  if (bytes.length % 4 !== 0) throw new Error("Bytecode length must be a multiple of 4");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Instruction[] = [];
  for (let i = 0; i < bytes.length; i += 4) out.push(decode(view.getUint32(i, false)));
  return out;
}

export function hex(word: number): string {
  return word.toString(16).padStart(8, "0").toUpperCase();
}

function checkReg(r: number): void {
  if (!Number.isInteger(r) || r < 0 || r >= REGISTER_COUNT) throw new RangeError(`register out of range: ${r}`);
}

/* ------------------------------------------------------------------------- */
/* Assembly text <-> instructions                                            */
/* ------------------------------------------------------------------------- */

export interface SymbolTable {
  idOf(name: string): number;
  nameOf(id: number): string;
}

/**
 * Format: `MNEMONIC operand, operand, ...` with `;` comments.
 * Registers are r0..r15, symbols are #name, banks are @n, scalars are numbers,
 * jump targets are :label or a raw index. Labels are declared as `name:`.
 */
export function assemble(source: string, symbols: SymbolTable): Instruction[] {
  const lines = source
    .split("\n")
    .map((l) => l.replace(/;.*$/, "").trim())
    .filter(Boolean);

  const labels = new Map<string, number>();
  const body: string[] = [];
  for (const line of lines) {
    const m = /^([A-Za-z_][\w-]*):$/.exec(line);
    if (m) labels.set(m[1], body.length);
    else body.push(line);
  }

  return body.map((line, lineNo) => {
    const [head, ...rest] = line.split(/\s+/);
    const mnemonic = head.toUpperCase();
    const spec = BY_MNEMONIC.get(mnemonic);
    if (!spec) throw new SyntaxError(`line ${lineNo + 1}: unknown opcode "${head}"`);
    const operands = rest
      .join(" ")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (spec.mnemonic === "BRC") {
      const threshold = Number(operands[0]);
      if (!Number.isFinite(threshold) || operands[1] === undefined) {
        throw new SyntaxError(`line ${lineNo + 1}: BRC needs "threshold, target"`);
      }
      return {
        op: "BRC",
        dst: 0,
        a: Math.max(0, Math.min(15, Math.round(threshold * 15))),
        b: 0,
        imm: parseImm("target", operands[1], symbols, labels, lineNo),
      };
    }

    const regs = operands.filter((o) => /^r\d+$/i.test(o)).map((o) => Number(o.slice(1)));
    const immTok = operands.find((o) => !/^r\d+$/i.test(o));
    const result: Instruction = { op: spec.mnemonic as Mnemonic, dst: 0, a: 0, b: 0, imm: 0 };
    spec.fields.forEach((f, idx) => {
      if (regs[idx] === undefined) throw new SyntaxError(`line ${lineNo + 1}: ${mnemonic} needs register "${f}"`);
      result[f] = regs[idx];
    });

    if (spec.imm !== "none") {
      if (immTok === undefined) throw new SyntaxError(`line ${lineNo + 1}: ${mnemonic} needs an immediate`);
      result.imm = parseImm(spec.imm, immTok, symbols, labels, lineNo);
    }
    return result;
  });
}

function parseImm(kind: ImmKind, tok: string, symbols: SymbolTable, labels: Map<string, number>, lineNo: number): number {
  switch (kind) {
    case "symbol":
      if (!tok.startsWith("#")) throw new SyntaxError(`line ${lineNo + 1}: expected #symbol, got "${tok}"`);
      return symbols.idOf(tok.slice(1));
    case "scalar":
      return encodeScalar(Number(tok));
    case "shift":
      return encodeSigned(Number(tok));
    case "bank":
      return Number(tok.replace(/^@/, ""));
    case "target":
      if (tok.startsWith(":")) {
        const t = labels.get(tok.slice(1));
        if (t === undefined) throw new SyntaxError(`line ${lineNo + 1}: unknown label "${tok}"`);
        return t;
      }
      return Number(tok);
    default:
      return 0;
  }
}

export function disassemble(i: Instruction, symbols?: SymbolTable): string {
  const spec = opcode(i.op);
  if (spec.mnemonic === "BRC") return `BRC    ${(i.a / 15).toFixed(2)}, ${i.imm}`;
  const parts: string[] = spec.fields.map((f) => `r${i[f]}`);
  switch (spec.imm) {
    case "symbol":
      parts.push(`#${symbols ? symbols.nameOf(i.imm) : i.imm}`);
      break;
    case "scalar":
      parts.push(String(decodeScalar(i.imm)));
      break;
    case "shift":
      parts.push(String(signExtend(i.imm)));
      break;
    case "bank":
      parts.push(`@${i.imm}`);
      break;
    case "target":
      parts.push(String(i.imm));
      break;
  }
  return parts.length ? `${spec.mnemonic.padEnd(6)} ${parts.join(", ")}` : spec.mnemonic;
}
