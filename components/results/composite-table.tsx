import type { Results } from "@/lib/results";
import { pct } from "@/lib/results";

export function CompositeTable({ data, chain }: { data: Results["operands"]["composite"]; chain: string[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[480px] border-collapse text-left text-sm">
        <caption className="px-3 py-2 text-left text-xs text-muted-foreground">
          Hidden concept: <span className="font-mono text-foreground">{chain.join(" \u2192 ")}</span> (8 examples, tested on 24 unseen people)
        </caption>
        <thead className="bg-muted text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Program shape</th>
            <th scope="col" className="px-3 py-2 font-medium">Seed</th>
            <th scope="col" className="px-3 py-2 font-medium">Learned operands (hardened)</th>
            <th scope="col" className="px-3 py-2 font-medium">Test accuracy</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => {
            const exact = r.learned.join(">") === chain.join(">");
            return (
              <tr key={`${r.hops}-${r.seed}`} className="border-t border-border">
                <td className="px-3 py-2">{r.hops === 1 ? "1 hop" : "2 hops"}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.seed}</td>
                <td className={`px-3 py-2 font-mono text-xs ${exact ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                  {r.learned.map((l) => `#${l}`).join(", ")}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{pct(r.accuracy)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
