export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-6">
        <p>
          CISA, a WAICY 2026 project. Credit:{" "}
          <a
            href="https://kreflux.com"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground underline underline-offset-4 hover:opacity-80"
          >
            kreflux.com
          </a>
          . Every number on this site is produced by code in the repository.
        </p>
        <p className="font-mono text-xs">pnpm experiments &rarr; results/results.json</p>
      </div>
    </footer>
  );
}
