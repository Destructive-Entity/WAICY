const FIELDS = [
  { name: "opcode", bits: "31-24", width: 8, note: "which cognitive operation" },
  { name: "dst", bits: "23-20", width: 4, note: "register written" },
  { name: "a", bits: "19-16", width: 4, note: "first operand" },
  { name: "b", bits: "15-12", width: 4, note: "second operand" },
  { name: "imm", bits: "11-0", width: 12, note: "symbol, scalar, shift, bank or target" },
];

export function EncodingDiagram() {
  return (
    <figure className="flex flex-col gap-3">
      <div className="flex overflow-hidden rounded-md border border-border font-mono text-xs md:text-sm" role="img" aria-label="32-bit CISA instruction: 8-bit opcode, three 4-bit register fields, 12-bit immediate">
        {FIELDS.map((f, i) => (
          <div
            key={f.name}
            className={`flex flex-col items-center justify-center gap-0.5 px-1 py-3 ${i === 0 ? "bg-primary text-primary-foreground" : i === 4 ? "bg-accent text-accent-foreground" : "bg-card"} ${i > 0 ? "border-l border-border" : ""}`}
            style={{ flexGrow: f.width, flexBasis: 0 }}
          >
            <span className="font-semibold">{f.name}</span>
            <span className="opacity-75">{f.bits}</span>
          </div>
        ))}
      </div>
      <figcaption className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-5">
        {FIELDS.map((f) => (
          <span key={f.name}>
            <span className="font-mono text-foreground">{f.name}</span>: {f.note}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
