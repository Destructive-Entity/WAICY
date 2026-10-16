import Link from "next/link";
import { KrefluxMark } from "./kreflux-mark";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card/40 pt-12 pb-6 md:pt-16 md:pb-8 overflow-hidden">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 md:px-6">
        {/* Prominent Created By banner */}
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 md:flex-row md:items-center md:justify-between md:p-8">
          <div className="flex items-center gap-4">
            <KrefluxMark className="size-10 text-[#E8491A] shrink-0" />
            <div>
              <p className="font-mono text-xs uppercase tracking-wider text-[#E8491A]">
                Principal Research
              </p>
              <h3 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
                Created by{" "}
                <a
                  href="https://kreflux.com"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4 decoration-[#E8491A]/50 hover:text-[#E8491A] hover:decoration-[#E8491A] transition-colors"
                >
                  Kreflux
                </a>
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Pioneering continuous instruction set architectures and symbolic neuralese.
              </p>
            </div>
          </div>
          <a
            href="https://kreflux.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-90 self-start md:self-auto shrink-0"
          >
            Explore kreflux.com &rarr;
          </a>
        </div>

        {/* Info & reproduction metadata */}
        <div className="flex flex-col gap-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>
            CISA: A WAICY 2026 project. Every number on this site is produced by code in the repository.
          </p>
          <p className="font-mono text-xs">
            pnpm experiments &rarr; results/results.json
          </p>
        </div>

        {/* The giant Kreflux hero mark and wordmark linking to kreflux.com */}
        <a
          href="https://kreflux.com"
          target="_blank"
          rel="noreferrer"
          aria-label="Visit kreflux.com"
          className="group mt-4 -mb-4 flex w-full items-center justify-center gap-[clamp(8px,1.2vw,24px)] select-none transition-transform duration-300 hover:scale-[1.01] active:scale-[0.99]"
        >
          <KrefluxMark
            tight
            className="h-[clamp(2.5rem,11.5vw,11rem)] w-auto flex-none text-[#E8491A] transition-transform duration-300 group-hover:scale-105"
          />
          <span className="block font-sans font-semibold tracking-[-0.035em] leading-[0.82] text-foreground text-[clamp(2.8rem,16.5vw,16rem)] whitespace-nowrap transition-colors duration-300 group-hover:text-[#E8491A]">
            Kre<span className="inline-block mr-[0.04em]">f</span>lux
          </span>
        </a>
      </div>
    </footer>
  );
}
