import { describe, expect, it } from "vitest";
import {
  assemble,
  decode,
  decodeScalar,
  disassemble,
  encode,
  encodeScalar,
  fromBytecode,
  ins,
  OPCODES,
  toBytecode,
} from "@/lib/cisa/isa";
import { Lexicon } from "@/lib/cisa/lexicon";

describe("instruction encoding", () => {
  it("every opcode round-trips through a 32-bit word", () => {
    for (const o of OPCODES) {
      const i = ins(o.mnemonic, { dst: 15, a: 7, b: 3, imm: 0xabc });
      expect(decode(encode(i))).toEqual(i);
    }
  });

  it("opcodes are unique", () => {
    expect(new Set(OPCODES.map((o) => o.code)).size).toBe(OPCODES.length);
    expect(new Set(OPCODES.map((o) => o.mnemonic)).size).toBe(OPCODES.length);
  });

  it("scalars are Q4.8 fixed point", () => {
    for (const x of [0, 1, -1, 0.5, -3.25, 7.99]) expect(decodeScalar(encodeScalar(x))).toBeCloseTo(x, 2);
    expect(decodeScalar(encodeScalar(100))).toBeLessThan(8);
  });

  it("bytecode is 4 bytes per instruction, big endian", () => {
    const prog = [ins("LOAD", { dst: 1, imm: 2 }), ins("HALT")];
    const bytes = toBytecode(prog);
    expect(bytes).toHaveLength(8);
    expect(bytes[0]).toBe(0x01);
    expect(fromBytecode(bytes)).toEqual(prog);
  });

  it("rejects bad registers", () => {
    expect(() => encode(ins("MOV", { dst: 16 }))).toThrow(RangeError);
  });
});

describe("assembler", () => {
  const lex = new Lexicon(64, 1);
  ["ada", "mentor"].forEach((n) => lex.intern(n));

  it("assembles and disassembles symmetric text", () => {
    const src = `
      ; one hop
      LOAD   r0, #ada
      LOAD   r1, #mentor
      BIND   r2, r1, r0
      RECALL r3, r2, @0
      PERM   r3, r3, -1
      CLEAN  r0, r3
    retry:
      BRC    0.4, :retry
      BUNDLE r4, r4, r3, 0.5
      EMIT   r0
      HALT
    `;
    const prog = assemble(src, lex);
    expect(prog).toHaveLength(10);
    expect(prog[6]).toMatchObject({ op: "BRC", a: 6, imm: 6 });
    expect(disassemble(prog[0], lex)).toBe("LOAD   r0, #ada");
    expect(disassemble(prog[4], lex)).toBe("PERM   r3, r3, -1");
    expect(disassemble(prog[7], lex)).toBe("BUNDLE r4, r4, r3, 0.5");
    const again = assemble(prog.map((p) => disassemble(p, lex)).join("\n"), lex);
    expect(again).toEqual(prog);
  });

  it("reports unknown opcodes with a line number", () => {
    expect(() => assemble("FLY r0", lex)).toThrow(/line 1/);
  });
});
