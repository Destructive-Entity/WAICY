import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";
import { NavLinks } from "./nav-links";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2 font-mono text-sm font-semibold tracking-tight">
          <span className="inline-flex h-6 items-center rounded-sm bg-primary px-1.5 text-xs text-primary-foreground">0x</span>
          <span>CISA</span>
        </Link>
        <div className="flex items-center gap-1 md:gap-2">
          <NavLinks />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
