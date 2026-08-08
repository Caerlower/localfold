"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type MouseEvent } from "react";
import { List, LockKey, X } from "@phosphor-icons/react";
import { goToTools } from "@/lib/scrollToTools";

const NAV = [
  { href: "/#tools", label: "Tools", tools: true },
  { href: "/tool/merge-pdf", label: "Merge" },
  { href: "/tool/compress-pdf", label: "Compress" },
  { href: "/tool/pdf-to-word", label: "Convert" },
  { href: "/privacy", label: "Privacy" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const onToolsClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (goToTools(pathname)) {
      e.preventDefault();
    }
    setOpen(false);
  };

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b bg-[var(--canvas)] transition-[border-color,box-shadow,backdrop-filter] duration-300 ease-out ${
        scrolled || open
          ? "border-line/80 shadow-[0_1px_0_rgba(15,20,18,0.04)] backdrop-blur-xl"
          : "border-line/40"
      }`}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-5 sm:h-16 sm:px-8">
        <Link
          href="/"
          className="pressable group flex shrink-0 items-center gap-2"
          onClick={() => setOpen(false)}
        >
          <Image
            src="/logo.png"
            alt="LocalFold"
            width={32}
            height={32}
            className="h-8 w-8 rounded-[9px]"
            priority
          />
          <span className="text-[15px] font-semibold tracking-tight text-ink">
            LocalFold
          </span>
        </Link>

        <nav className="ml-4 hidden flex-1 items-center gap-0.5 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={"tools" in item && item.tools ? onToolsClick : () => setOpen(false)}
              className="pressable rounded-lg px-3 py-1.5 text-[13px] font-medium text-ink-soft transition-colors duration-150 hover:bg-ink/[0.04] hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1 text-[12px] font-medium text-moss-deep sm:inline-flex">
            <LockKey weight="bold" className="h-3.5 w-3.5" />
            Local only
          </span>
          <Link
            href="/#tools"
            onClick={onToolsClick}
            className="pressable hidden rounded-full bg-moss px-3.5 py-1.5 text-xs font-semibold text-paper transition-colors hover:bg-moss-deep sm:inline-flex"
          >
            Open tools
          </Link>
          <button
            type="button"
            className="pressable flex h-9 w-9 items-center justify-center rounded-lg text-ink md:hidden"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? (
              <X className="h-5 w-5" weight="bold" />
            ) : (
              <List className="h-5 w-5" weight="bold" />
            )}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-line/60 bg-[var(--canvas)] px-5 py-3 md:hidden">
          <nav className="flex flex-col gap-0.5">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={"tools" in item && item.tools ? onToolsClick : () => setOpen(false)}
                className="pressable rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-ink/[0.04]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/#tools"
            onClick={onToolsClick}
            className="pressable mt-2 flex items-center justify-center rounded-full bg-moss px-4 py-2.5 text-sm font-semibold text-paper"
          >
            Open tools
          </Link>
        </div>
      )}
    </header>
  );
}
