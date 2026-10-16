import type { Results } from "@/lib/results";
import { pct } from "@/lib/results";

export function SynthesisTable({ data }: { data: Results["synthesis"] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[620px] border-collapse text-left text-sm">
          <caption className="sr-only">Success rate of each program search method per task</caption>
          <thead className="bg-muted text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Task</th>
              <th scope="col" className="px-3 py-2 font-medium">Programs possible</th>
              <th scope="col" className="px-3 py-2 font-medium">Reference</th>
              {data[0].results.map((m) => (
                <th key={m.method} scope="col" className="px-3 py-2 font-medium">
                  {m.method}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((t) => (
              <tr key={t.task} className="border-t border-border">
                <th scope="row" className="px-3 py-2 font-medium">
                  {t.task}
                  <span className="block text-xs font-normal text-muted-foreground">{t.slots} slots</span>
                </th>
                <td className="px-3 py-2 font-mono text-xs">{t.searchSpace.toLocaleString("en-US")}</td>
                <td className="px-3 py-2 font-mono text-xs">{pct(t.referenceAccuracy)}</td>
                {t.results.map((m) => (
                  <td key={m.method} className="px-3 py-2">
                    <span className={`font-mono text-sm font-semibold ${m.successRate > 0 ? "text-primary" : "text-muted-foreground"}`}>
                      {m.runs.filter((r) => r.success).length}/{m.runs.length}
                    </span>
                    <span className="block text-xs text-muted-foreground">mean acc {pct(m.meanAccuracy)}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SolvedExample data={data} />
    </div>
  );
}

function SolvedExample({ data }: { data: Results["synthesis"] }) {
  const task = data[0];
  const relaxed = task.results.find((m) => m.method === "relaxed gradient");
  const win = relaxed?.runs.find((r) => r.success);
  if (!win) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <figure className="flex flex-col gap-2">
        <figcaption className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Program we wrote by hand</figcaption>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-6">{task.referenceProgram.join("\n")}</pre>
      </figure>
      <figure className="flex flex-col gap-2">
        <figcaption className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Program found by gradient descent (seed {win.seed})</figcaption>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-6">{win.program.join("\n")}</pre>
      </figure>
    </div>
  );
}
