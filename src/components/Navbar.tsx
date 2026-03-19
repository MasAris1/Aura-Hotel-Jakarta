"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ArrowRight } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";

const navLinks = [
  { name: "Home", href: "/" },
  { name: "Facilities", href: "/#facilities" },
  { name: "Suites", href: "/#collection" },
];

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 36);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll);

    const supabase = createClient();

    const fetchSession = async () => {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      setSession(currentSession);
      setAuthLoading(false);
    };

    void fetchSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setAuthLoading(false);
    });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setSession(null);
    setMobileMenuOpen(false);
  };

  const useHeroChrome = pathname === "/" && !isScrolled && !mobileMenuOpen;
  const shellClassName = useHeroChrome
    ? "border-white/10 bg-black/18 shadow-none"
    : "border-primary/12 bg-[#0f131b]/88 shadow-[0_24px_70px_rgba(0,0,0,0.38)]";
  const textClassName = useHeroChrome ? "text-white/82" : "text-foreground/78";
  const mutedTextClassName = useHeroChrome ? "text-white/58" : "text-foreground/56";

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 py-3 sm:px-5 lg:px-8">
      <div
        className={`mx-auto flex max-w-7xl items-center justify-between gap-3 rounded-full border px-4 py-3 backdrop-blur-xl transition-all duration-500 sm:px-5 lg:px-6 ${shellClassName}`}
      >
        <Link href="/" className="group flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <p className="font-serif text-xl uppercase tracking-[0.34em] text-white sm:text-2xl">
              Aura
            </p>
            <p className={`hidden text-[10px] uppercase tracking-[0.28em] sm:block ${mutedTextClassName}`}>
              Luxury stay in Jakarta
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-2 lg:flex">
          <div className="flex items-center rounded-full border border-white/10 bg-white/[0.03] p-1.5">
            {navLinks.map((link) => {
              const isActive =
                link.href === "/"
                  ? pathname === "/"
                  : link.href === "/#collection"
                    ? pathname.startsWith("/rooms/")
                    : false;

              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.28em] transition-all duration-300 ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-[0_12px_28px_rgba(198,155,73,0.28)]"
                      : `${textClassName} hover:bg-white/6 hover:text-white`
                  }`}
                >
                  {link.name}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {!authLoading && session ? (
            <>
              <Link
                href="/dashboard"
                className={`rounded-full border border-white/10 px-4 py-2 text-[11px] uppercase tracking-[0.26em] transition-colors duration-300 ${textClassName} hover:border-primary/35 hover:text-white`}
              >
                Guest Portal
              </Link>
              <button
                onClick={handleLogout}
                className="rounded-full border border-transparent px-4 py-2 text-[11px] uppercase tracking-[0.26em] text-foreground/54 transition-colors duration-300 hover:text-destructive"
              >
                Logout
              </button>
            </>
          ) : null}

          {!authLoading && !session ? (
            <Link
              href="/login"
              className={`rounded-full border border-white/10 px-4 py-2 text-[11px] uppercase tracking-[0.26em] transition-colors duration-300 ${textClassName} hover:border-primary/35 hover:text-white`}
            >
              Login
            </Link>
          ) : null}

          <Link
            href="/booking"
            className="group inline-flex items-center gap-3 rounded-full border border-primary/40 bg-primary px-5 py-2.5 text-[11px] uppercase tracking-[0.28em] text-primary-foreground transition-all duration-300 hover:translate-x-0.5 hover:shadow-[0_18px_36px_rgba(198,155,73,0.34)]"
          >
            Reserve
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </div>

        <button
          type="button"
          className={`inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 transition-colors duration-300 lg:hidden ${textClassName} hover:border-primary/40 hover:text-white`}
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 bg-[#090b10]/92 px-4 pb-8 pt-5 backdrop-blur-2xl">
          <div className="mx-auto flex max-w-2xl items-center justify-between rounded-full border border-primary/18 bg-white/[0.03] px-4 py-3">
            <div>
              <p className="font-serif text-xl uppercase tracking-[0.3em] text-white">Aura</p>
              <p className="text-[10px] uppercase tracking-[0.26em] text-white/52">
                Curated luxury stays
              </p>
            </div>

            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 text-white/78 transition-colors duration-300 hover:border-primary/40 hover:text-white"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close navigation menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mx-auto mt-10 flex max-w-2xl flex-col gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] px-6 py-5 text-lg uppercase tracking-[0.28em] text-white/84 transition-all duration-300 hover:border-primary/35 hover:bg-primary/10 hover:text-white"
              >
                {link.name}
              </Link>
            ))}

            {!authLoading && session ? (
              <>
                <Link
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] px-6 py-5 text-lg uppercase tracking-[0.28em] text-white/84 transition-all duration-300 hover:border-primary/35 hover:bg-primary/10 hover:text-white"
                >
                  Guest Portal
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] px-6 py-5 text-left text-lg uppercase tracking-[0.28em] text-white/58 transition-all duration-300 hover:border-destructive/35 hover:text-destructive"
                >
                  Logout
                </button>
              </>
            ) : null}

            {!authLoading && !session ? (
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] px-6 py-5 text-lg uppercase tracking-[0.28em] text-white/84 transition-all duration-300 hover:border-primary/35 hover:bg-primary/10 hover:text-white"
              >
                Login
              </Link>
            ) : null}

            <Link
              href="/booking"
              onClick={() => setMobileMenuOpen(false)}
              className="mt-2 inline-flex items-center justify-between rounded-[1.75rem] bg-primary px-6 py-5 text-lg uppercase tracking-[0.28em] text-primary-foreground transition-all duration-300 hover:shadow-[0_18px_36px_rgba(198,155,73,0.32)]"
            >
              Reserve your stay
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
