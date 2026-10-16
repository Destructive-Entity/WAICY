export function PageIntro({ kicker, title, lead }: { kicker: string; title: string; lead: string }) {
  return (
    <header className="flex max-w-3xl flex-col gap-3">
      <p className="font-mono text-xs uppercase tracking-widest text-primary">{kicker}</p>
      <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
      <p className="text-pretty leading-relaxed text-muted-foreground md:text-lg">{lead}</p>
    </header>
  );
}
