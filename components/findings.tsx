import Link from "next/link";
import { headlines, pct } from "@/lib/results";

export function Findings() {
  const h = headlines();
  const items = [
    {
      value: "1 example",
      title: "Learns a hidden concept from one example",
      body: `Then answers ${pct(h.operands.oneShot)} of questions about unseen people, and tells you which symbol it learned. Pure vector "neuralese": ${pct(h.operands.oneShotFree)}.`,
      href: "/results#operands",
    },
    {
      value: `${pct(h.errorCorrection.withClean)} at 6 hops`,
      title: "Error correction for thoughts",
      body: `CLEAN snaps each step back to a known concept. Without it, multi-hop reasoning falls to ${pct(h.errorCorrection.twoHopWithout)} by the second hop.`,
      href: "/results#noise",
    },
    {
      value: `AUROC ${h.metacognition.auroc.toFixed(2)}`,
      title: "Knows when it is unsure",
      body: `The confidence register predicts its own mistakes. Retrying only when unsure matches always-retry accuracy and skips ${pct(h.metacognition.retriesSaved)} of the work.`,
      href: "/results#metacognition",
    },
    {
      value: `${h.precision.bits} bits`,
      title: "Per number is enough",
      body: `${h.precision.bytesPerVector} bytes per concept with no accuracy loss, and traces ${h.compactness.minRatio.toFixed(1)}-${h.compactness.maxRatio.toFixed(1)}x smaller than English chains of thought.`,
      href: "/results#precision",
    },
  ];
  return (
    <ul className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it) => (
        <li key={it.title} className="flex">
          <Link href={it.href} className="group flex w-full flex-col gap-2 bg-card p-5 transition-colors hover:bg-muted">
            <span className="font-mono text-2xl font-semibold tracking-tight text-primary">{it.value}</span>
            <span className="font-medium">{it.title}</span>
            <span className="text-pretty text-sm leading-relaxed text-muted-foreground">{it.body}</span>
            <span className="mt-auto pt-2 text-xs text-muted-foreground group-hover:text-foreground">See the data &rarr;</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
