export function ChartCard({
  id,
  label,
  title,
  finding,
  children,
  method,
}: {
  id: string;
  label: string;
  title: string;
  finding: React.ReactNode;
  children: React.ReactNode;
  method: React.ReactNode;
}) {
  return (
    <article id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-20 flex-col gap-4 rounded-lg border border-border bg-card p-4 md:p-6">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">{label}</p>
        <h2 id={`${id}-title`} className="text-balance text-lg font-semibold tracking-tight md:text-xl">
          {title}
        </h2>
        <p className="text-pretty leading-relaxed text-muted-foreground">{finding}</p>
      </header>
      <div className="min-w-0">{children}</div>
      <p className="border-t border-border pt-3 text-pretty text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Method. </span>
        {method}
      </p>
    </article>
  );
}
