import { OPCODES } from "@/lib/cisa/isa";

export function OpcodeTable() {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <caption className="sr-only">CISA opcodes</caption>
        <thead className="bg-muted text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Code</th>
            <th scope="col" className="px-3 py-2 font-medium">Mnemonic</th>
            <th scope="col" className="px-3 py-2 font-medium">Semantics</th>
            <th scope="col" className="px-3 py-2 font-medium">Cognitive reading</th>
          </tr>
        </thead>
        <tbody>
          {OPCODES.map((o) => (
            <tr key={o.code} className="border-t border-border bg-card">
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">0x{o.code.toString(16).padStart(2, "0").toUpperCase()}</td>
              <td className="px-3 py-2 font-mono font-semibold text-primary">{o.mnemonic}</td>
              <td className="px-3 py-2 font-mono text-xs">{o.summary}</td>
              <td className="px-3 py-2">{o.cognition}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
