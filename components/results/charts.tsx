"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Results } from "@/lib/results";

const C = {
  primary: "var(--primary)",
  accent: "var(--accent)",
  ink: "var(--foreground)",
  muted: "var(--muted-foreground)",
  grid: "var(--border)",
};

const axis = { stroke: C.grid, tick: { fill: C.muted, fontSize: 12 }, tickLine: false } as const;
const tooltipStyle = {
  contentStyle: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, color: "var(--foreground)" },
  labelStyle: { color: "var(--foreground)", fontWeight: 600 },
  cursor: { stroke: C.grid },
} as const;
const legendStyle = { wrapperStyle: { fontSize: 12, color: "var(--muted-foreground)" } } as const;
const pctTick = (v: number) => `${Math.round(v * 100)}%`;
const pctFmt = (v: unknown) => `${Math.round(Number(v) * 100)}%`;

function Frame({ children, height = 280, label }: { children: React.ReactElement; height?: number; label: string }) {
  return (
    <div role="img" aria-label={label} style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

const DIM_STYLE: Record<number, { stroke: string; dash?: string }> = {
  256: { stroke: C.muted, dash: "4 3" },
  512: { stroke: C.accent },
  1024: { stroke: C.primary },
  2048: { stroke: C.ink },
};

export function CapacityChart({ data }: { data: Results["capacity"] }) {
  const facts = [...new Set(data.map((d) => d.facts))];
  const rows = facts.map((f) => Object.fromEntries([["facts", f], ...data.filter((d) => d.facts === f).map((d) => [`d=${d.dim}`, d.accuracy])]));
  return (
    <Frame label="Recall accuracy versus number of facts stored, one line per vector dimension">
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="facts" {...axis} label={{ value: "facts superposed in one vector", position: "insideBottom", offset: -2, fill: C.muted, fontSize: 12 }} height={40} />
        <YAxis {...axis} domain={[0, 1]} tickFormatter={pctTick} />
        <Tooltip {...tooltipStyle} formatter={pctFmt} labelFormatter={(l) => `${l} facts`} />
        <Legend {...legendStyle} />
        {[256, 512, 1024, 2048].map((d) => (
          <Line key={d} dataKey={`d=${d}`} stroke={DIM_STYLE[d].stroke} strokeDasharray={DIM_STYLE[d].dash} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        ))}
      </LineChart>
    </Frame>
  );
}

export function AliasingChart({ data }: { data: Results["aliasing"] }) {
  return (
    <Frame label="Recall accuracy with no symmetry breaking, with rotation, and with a random permutation">
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="facts" {...axis} tickFormatter={(v) => `${v} facts`} />
        <YAxis {...axis} domain={[0, 1]} tickFormatter={pctTick} />
        <Tooltip {...tooltipStyle} formatter={pctFmt} cursor={{ fill: "var(--muted)" }} />
        <Legend {...legendStyle} />
        <Bar dataKey="none" name="no fix" fill={C.muted} isAnimationActive={false} />
        <Bar dataKey="rotation" name="rotation" fill={C.accent} isAnimationActive={false} />
        <Bar dataKey="permutation" name="random permutation" fill={C.primary} isAnimationActive={false} />
      </BarChart>
    </Frame>
  );
}

export function NoiseChart({ data }: { data: Results["noise"]["rows"] }) {
  const levels = [...new Set(data.map((d) => d.noise))];
  const [level, setLevel] = useState(levels[0]);
  const rows = data.filter((d) => d.noise === level);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Noise level">
        <span className="text-xs text-muted-foreground">Register noise</span>
        {levels.map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={l === level}
            onClick={() => setLevel(l)}
            className={`rounded-md border px-2 py-1 font-mono text-xs ${l === level ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
          >
            {l.toFixed(1)}
          </button>
        ))}
      </div>
      <Frame label={`Accuracy versus number of reasoning hops at noise ${level}, with and without CLEAN`}>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="hops" {...axis} label={{ value: "reasoning hops", position: "insideBottom", offset: -2, fill: C.muted, fontSize: 12 }} height={40} />
          <YAxis {...axis} domain={[0, 1]} tickFormatter={pctTick} />
          <Tooltip {...tooltipStyle} formatter={pctFmt} labelFormatter={(l) => `${l} hops`} />
          <Legend {...legendStyle} />
          <Line dataKey="clean" name="CLEAN every hop" stroke={C.primary} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
          <Line dataKey="noClean" name="no CLEAN" stroke={C.accent} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </Frame>
    </div>
  );
}

export function PrecisionChart({ data }: { data: Results["precision"] }) {
  const rows = data.map((d) => ({ ...d, label: d.bits === 32 ? "float32" : `${d.bits}-bit` }));
  return (
    <Frame label="Recall accuracy by bits per vector component">
      <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} domain={[0, 1]} tickFormatter={pctTick} />
        <Tooltip
          {...tooltipStyle}
          cursor={{ fill: "var(--muted)" }}
          formatter={(v, _n, p) => [`${pctFmt(v)}  (${(p.payload as { bytesPerVector: number }).bytesPerVector} B per concept)`, "accuracy"]}
        />
        <Bar dataKey="accuracy" fill={C.primary} isAnimationActive={false} />
      </BarChart>
    </Frame>
  );
}

export function MetacognitionCharts({ data }: { data: Results["metacognition"] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Accuracy vs. memory lookups per question</h3>
        <Frame label="Accuracy versus average recalls per query as the retry threshold increases" height={260}>
          <LineChart data={data.sweep} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="recallsPerQuery" type="number" domain={[1, 2]} {...axis} tickFormatter={(v) => Number(v).toFixed(1)} label={{ value: "RECALLs per question", position: "insideBottom", offset: -2, fill: C.muted, fontSize: 12 }} height={40} />
            <YAxis {...axis} domain={[0.6, 1]} tickFormatter={pctTick} />
            <Tooltip {...tooltipStyle} formatter={pctFmt} labelFormatter={(l) => `${Number(l).toFixed(2)} recalls / question`} />
            <Line dataKey="accuracy" name="adaptive (BRC)" stroke={C.primary} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
          </LineChart>
        </Frame>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Confidence of right vs. wrong first answers</h3>
        <Frame label="Histogram of CLEAN confidence for correct and incorrect answers" height={260}>
          <BarChart data={data.histogram} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="bin" {...axis} tickFormatter={(v) => Number(v).toFixed(2)} label={{ value: "confidence C (margin)", position: "insideBottom", offset: -2, fill: C.muted, fontSize: 12 }} height={40} />
            <YAxis {...axis} allowDecimals={false} />
            <Tooltip {...tooltipStyle} cursor={{ fill: "var(--muted)" }} />
            <Legend {...legendStyle} />
            <Bar dataKey="correct" stackId="a" fill={C.primary} isAnimationActive={false} />
            <Bar dataKey="wrong" stackId="a" fill={C.accent} isAnimationActive={false} />
          </BarChart>
        </Frame>
      </div>
    </div>
  );
}

export function AnalogyChart({ data }: { data: Results["analogy"] }) {
  const dims = [...new Set(data.map((d) => d.dim))];
  const [dim, setDim] = useState(dims[0]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Vector dimension">
        <span className="text-xs text-muted-foreground">Dimension</span>
        {dims.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={d === dim}
            onClick={() => setDim(d)}
            className={`rounded-md border px-2 py-1 font-mono text-xs ${d === dim ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
          >
            {d}
          </button>
        ))}
      </div>
      <Frame label={`Analogy accuracy versus roles per record at dimension ${dim}`}>
        <LineChart data={data.filter((d) => d.dim === dim)} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="roles" {...axis} label={{ value: "roles packed into each record", position: "insideBottom", offset: -2, fill: C.muted, fontSize: 12 }} height={40} />
          <YAxis {...axis} domain={[0, 1]} tickFormatter={pctTick} />
          <Tooltip {...tooltipStyle} formatter={pctFmt} labelFormatter={(l) => `${l} roles`} />
          <Legend {...legendStyle} />
          <Line dataKey="withClean" name="with CLEAN" stroke={C.primary} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
          <Line dataKey="withoutClean" name="without CLEAN" stroke={C.accent} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </Frame>
    </div>
  );
}

export function OperandChart({ data }: { data: Results["operands"]["fewShot"] }) {
  const counts = [...new Set(data.map((d) => d.examples))];
  const rows = counts.map((n) => ({
    examples: n,
    symbolic: data.find((d) => d.examples === n && d.param === "symbolic")?.accuracy ?? 0,
    free: data.find((d) => d.examples === n && d.param === "free")?.accuracy ?? 0,
  }));
  return (
    <Frame label="Accuracy on unseen entities after learning from 1 to 8 examples, symbolic versus free operands">
      <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="examples" {...axis} tickFormatter={(v) => `${v} ex.`} />
        <YAxis {...axis} domain={[0, 1]} tickFormatter={pctTick} />
        <Tooltip {...tooltipStyle} formatter={pctFmt} cursor={{ fill: "var(--muted)" }} labelFormatter={(l) => `${l} training example(s)`} />
        <Legend {...legendStyle} />
        <Bar dataKey="symbolic" name="soft symbol (CISA)" fill={C.primary} isAnimationActive={false} />
        <Bar dataKey="free" name="free vector (pure neuralese)" fill={C.accent} isAnimationActive={false} />
      </BarChart>
    </Frame>
  );
}

export function CompactnessChart({ data }: { data: Results["compactness"]["rows"] }) {
  return (
    <Frame label="Bytes of reasoning trace per question: CISA bytecode versus English chain of thought">
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -4 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="hops" {...axis} tickFormatter={(v) => `${v} hop${v > 1 ? "s" : ""}`} />
        <YAxis {...axis} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "var(--muted)" }} formatter={(v) => `${v} bytes`} />
        <Legend {...legendStyle} />
        <Bar dataKey="englishBytes" name="English chain of thought" fill={C.accent} isAnimationActive={false} />
        <Bar dataKey="cisaBytes" name="CISA bytecode" fill={C.primary} isAnimationActive={false} />
      </BarChart>
    </Frame>
  );
}
