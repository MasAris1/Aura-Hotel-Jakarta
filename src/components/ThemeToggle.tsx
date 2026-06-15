"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  className?: string;
  expanded?: boolean;
};

export function ThemeToggle({ className, expanded = false }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const mountId = window.setTimeout(() => setMounted(true), 0);

    return () => window.clearTimeout(mountId);
  }, []);

  const isLight = mounted && resolvedTheme === "light";
  const label = isLight ? "Ganti ke mode gelap" : "Ganti ke mode terang";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => setTheme(isLight ? "dark" : "light")}
      className={cn(
        "inline-flex h-11 shrink-0 items-center justify-center rounded-full border border-border/80 bg-background/55 text-foreground/76 shadow-[0_18px_45px_rgba(0,0,0,0.14)] backdrop-blur-xl transition-all duration-300 hover:border-primary/45 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        expanded ? "w-full gap-3 px-5" : "w-11",
        className,
      )}
    >
      <span className="relative flex h-5 w-5 items-center justify-center">
        <Sun
          className={cn(
            "absolute h-[1.125rem] w-[1.125rem] transition-all duration-300",
            isLight ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-75 opacity-0",
          )}
        />
        <Moon
          className={cn(
            "absolute h-[1.125rem] w-[1.125rem] transition-all duration-300",
            isLight ? "rotate-90 scale-75 opacity-0" : "rotate-0 scale-100 opacity-100",
          )}
        />
      </span>
      {expanded ? (
        <span className="text-xs uppercase tracking-[0.24em]">
          {isLight ? "Mode terang" : "Mode gelap"}
        </span>
      ) : null}
    </button>
  );
}
