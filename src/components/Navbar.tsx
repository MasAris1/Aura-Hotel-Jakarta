"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LayoutDashboard, LogOut, Menu, UserRound, X } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { Session } from "@supabase/supabase-js";
import {
  clearSessionCache,
  readSessionCache,
  writeSessionCache,
  CLIENT_WARMUP_KEYS,
  type UserProfile,
} from "@/lib/clientWarmup";
import { createClient } from "@/utils/supabase/client";

const navLinks = [
  { name: "Home", href: "/#home", sectionId: "home" },
  { name: "Facilities", href: "/#facilities", sectionId: "facilities" },
  { name: "Suites", href: "/#collection", sectionId: "collection" },
];

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() =>
    readSessionCache<UserProfile>(CLIENT_WARMUP_KEYS.userProfile),
  );
  const [visibleSection, setVisibleSection] = useState<string | null>(null);
  const [manualSection, setManualSection] = useState<string | null>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0, opacity: 0 });
  const navDesktopRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const releaseTimeoutRef = useRef<number | null>(null);
  const pathname = usePathname();
  const currentSection =
    pathname === "/"
      ? manualSection ?? visibleSection
      : pathname.startsWith("/rooms/")
        ? "collection"
        : null;

  const clearWarmCaches = () => {
    clearSessionCache(CLIENT_WARMUP_KEYS.bookingIdentity);
    clearSessionCache(CLIENT_WARMUP_KEYS.dashboardSnapshot);
    clearSessionCache(CLIENT_WARMUP_KEYS.userProfile);
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 36);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll);

    const supabase = createClient();

    const syncUserRole = async (currentSession: Session | null) => {
      if (!currentSession?.user) {
        setUserProfile(null);
        return;
      }

      const cachedProfile = readSessionCache<UserProfile>(
        CLIENT_WARMUP_KEYS.userProfile,
      );

      if (cachedProfile) {
        setUserProfile(cachedProfile);
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, role")
        .eq("id", currentSession.user.id)
        .is("deleted_at", null)
        .single();

      if (!profile) {
        setUserProfile(
          cachedProfile ?? {
            first_name: currentSession.user.email?.split("@")[0] ?? "Guest",
            last_name: "",
          },
        );
        return;
      }

      const nextProfile: UserProfile = {
        first_name:
          profile.first_name ??
          cachedProfile?.first_name ??
          currentSession.user.email?.split("@")[0] ??
          "Guest",
        last_name: profile.last_name ?? cachedProfile?.last_name ?? "",
        role: profile.role,
      };

      writeSessionCache(CLIENT_WARMUP_KEYS.userProfile, nextProfile);
      setUserProfile(nextProfile);
    };

    const fetchSession = async () => {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      setSession(currentSession);
      setAuthLoading(false);
      void syncUserRole(currentSession);
    };

    void fetchSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setAuthLoading(false);

      if (!currentSession) {
        clearWarmCaches();
        setUserProfile(null);
        return;
      }

      void syncUserRole(currentSession);
    });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!accountMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(event.target as Node)
      ) {
        setAccountMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (pathname !== "/") {
      return;
    }

    const sectionIds = navLinks.map((link) => link.sectionId);

    const updateVisibleSection = () => {
      const viewportHeight = window.innerHeight;
      let bestSection = sectionIds[0];
      let bestVisibleArea = -1;

      for (const sectionId of sectionIds) {
        const section = document.getElementById(sectionId);

        if (!section) {
          continue;
        }

        const rect = section.getBoundingClientRect();
        const visibleHeight =
          Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
        const visibleArea = Math.max(0, visibleHeight);

        if (visibleArea > bestVisibleArea) {
          bestVisibleArea = visibleArea;
          bestSection = sectionId;
        }
      }

      setVisibleSection(bestSection);
    };

    let ticking = false;
    const requestUpdate = () => {
      if (ticking) {
        return;
      }

      ticking = true;
      window.requestAnimationFrame(() => {
        updateVisibleSection();
        ticking = false;
      });
    };

    requestUpdate();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, [pathname]);

  useEffect(() => {
    if (!manualSection) {
      return;
    }

    if (visibleSection === manualSection) {
      const releaseId = window.setTimeout(() => {
        if (releaseTimeoutRef.current) {
          window.clearTimeout(releaseTimeoutRef.current);
          releaseTimeoutRef.current = null;
        }
        setManualSection(null);
      }, 160);

      return () => {
        window.clearTimeout(releaseId);
      };
    }
  }, [manualSection, visibleSection]);

  useEffect(() => {
    return () => {
      if (releaseTimeoutRef.current) {
        window.clearTimeout(releaseTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const updateIndicator = () => {
      if (!navDesktopRef.current || !currentSection) {
        setIndicatorStyle((current) => ({ ...current, opacity: 0 }));
        return;
      }

      const activeLink = linkRefs.current[currentSection];

      if (!activeLink) {
        setIndicatorStyle((current) => ({ ...current, opacity: 0 }));
        return;
      }

      setIndicatorStyle({
        left: activeLink.offsetLeft,
        width: activeLink.offsetWidth,
        opacity: 1,
      });
    };

    updateIndicator();
    window.addEventListener("resize", updateIndicator);

    return () => {
      window.removeEventListener("resize", updateIndicator);
    };
  }, [currentSection, pathname]);

  const handleLogout = async () => {
    const supabase = createClient();
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => null);
    await supabase.auth.signOut();
    clearWarmCaches();
    setSession(null);
    setUserProfile(null);
    setAccountMenuOpen(false);
    setMobileMenuOpen(false);
    window.location.assign("/");
  };

  const handleDesktopNavClick = (
    event: MouseEvent<HTMLAnchorElement>,
    sectionId: string,
    href: string,
  ) => {
    if (pathname !== "/") {
      return;
    }

    event.preventDefault();

    if (releaseTimeoutRef.current) {
      window.clearTimeout(releaseTimeoutRef.current);
    }

    setManualSection(sectionId);
    releaseTimeoutRef.current = window.setTimeout(() => {
      setManualSection(null);
      releaseTimeoutRef.current = null;
    }, 1400);

    if (sectionId === "home") {
      window.history.replaceState(null, "", href);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const section = document.getElementById(sectionId);

    if (!section) {
      return;
    }

    window.history.replaceState(null, "", href);
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const useHeroChrome = pathname === "/" && !isScrolled && !mobileMenuOpen;
  const greetingName = getGreetingName(userProfile, session);
  const isAdmin = userProfile?.role === "admin";
  const shellClassName = useHeroChrome
    ? "border-border/85 bg-card/92 shadow-[0_18px_50px_rgba(82,62,32,0.16)] dark:border-white/10 dark:bg-black/18 dark:shadow-none"
    : "border-border/80 bg-card/88 shadow-[0_24px_70px_rgba(0,0,0,0.16)]";
  const brandClassName = useHeroChrome ? "text-foreground dark:text-white" : "text-foreground";
  const textClassName = useHeroChrome ? "text-foreground/78 dark:text-white/82" : "text-foreground/78";
  const hoverTextClassName = useHeroChrome ? "hover:text-foreground dark:hover:text-white" : "hover:text-foreground";
  const mutedTextClassName = useHeroChrome ? "text-foreground/56 dark:text-white/58" : "text-foreground/56";

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 py-3 sm:px-5 lg:px-8">
      <div
        className={`mx-auto flex max-w-7xl items-center justify-between gap-3 rounded-full border px-4 py-3 backdrop-blur-xl transition-all duration-500 sm:px-5 lg:px-6 ${shellClassName}`}
      >
        <Link href="/" className="group flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <p className={`font-serif text-xl uppercase tracking-[0.34em] sm:text-2xl ${brandClassName}`}>
              Aura
            </p>
            <p className={`hidden text-[10px] uppercase tracking-[0.28em] sm:block ${mutedTextClassName}`}>
              Luxury stay in Jakarta
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-2 lg:flex">
          <div
            ref={navDesktopRef}
            className="relative flex items-center rounded-full border border-border/70 bg-background/35 p-1.5"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-1.5 rounded-full bg-primary shadow-[0_12px_28px_rgba(198,155,73,0.28)] transition-[left,width,opacity] duration-300 ease-out"
              style={{
                left: indicatorStyle.left,
                width: indicatorStyle.width,
                opacity: indicatorStyle.opacity,
              }}
            />
            {navLinks.map((link) => {
              const isActive = currentSection === link.sectionId;

              return (
                <Link
                  key={link.name}
                  href={link.href}
                  ref={(element) => {
                    linkRefs.current[link.sectionId] = element;
                  }}
                  onClick={(event) => handleDesktopNavClick(event, link.sectionId, link.href)}
                  className={`relative z-10 rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.28em] transition-all duration-300 ${
                    isActive
                      ? "text-primary-foreground"
                      : `${textClassName} hover:bg-foreground/6 ${hoverTextClassName}`
                  }`}
                >
                  {link.name}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <ThemeToggle
            className={
              useHeroChrome
                ? "dark:border-white/10 dark:bg-black/16 dark:text-white/78 dark:hover:border-primary/40 dark:hover:text-white"
                : undefined
            }
          />

          {!authLoading && session ? (
            <div ref={accountMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setAccountMenuOpen((current) => !current)}
                className={`flex items-center gap-2 rounded-full border border-border/70 px-4 py-2 text-[11px] uppercase tracking-[0.22em] transition-colors duration-300 ${textClassName} hover:border-primary/35 ${hoverTextClassName}`}
                aria-expanded={accountMenuOpen}
              >
                Hai, {greetingName}
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${accountMenuOpen ? "rotate-180" : ""}`}
                />
              </button>

              {accountMenuOpen ? (
                <div className="absolute right-0 mt-3 w-52 border border-border bg-popover p-2 text-popover-foreground shadow-[0_24px_70px_rgba(0,0,0,0.18)]">
                  <Link
                    href="/profile"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 font-inter text-xs uppercase tracking-[0.22em] text-foreground/72 transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <UserRound className="h-4 w-4" />
                    Profil
                  </Link>
                  {isAdmin ? (
                    <Link
                      href="/admin"
                      onClick={() => setAccountMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 font-inter text-xs uppercase tracking-[0.22em] text-foreground/72 transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      Dashboard
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left font-inter text-xs uppercase tracking-[0.22em] text-foreground/54 transition-colors hover:bg-red-500/10 hover:text-destructive"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {!authLoading && !session ? (
            <Link
              href="/login"
              className={`rounded-full border border-border/70 px-4 py-2 text-[11px] uppercase tracking-[0.26em] transition-colors duration-300 ${textClassName} hover:border-primary/35 ${hoverTextClassName}`}
            >
              Login
            </Link>
          ) : null}
        </div>

        <button
          type="button"
          className={`inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/70 transition-colors duration-300 lg:hidden ${textClassName} hover:border-primary/40 ${hoverTextClassName}`}
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 bg-background/94 px-4 pb-8 pt-5 text-foreground backdrop-blur-2xl">
          <div className="mx-auto flex max-w-2xl items-center justify-between rounded-full border border-border bg-card/70 px-4 py-3">
            <div>
              <p className="font-serif text-xl uppercase tracking-[0.3em] text-foreground">Aura</p>
              <p className="text-[10px] uppercase tracking-[0.26em] text-foreground/52">
                Curated luxury stays
              </p>
            </div>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/70 text-foreground/78 transition-colors duration-300 hover:border-primary/40 hover:text-foreground"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="mx-auto mt-10 flex max-w-2xl flex-col gap-4">
            <ThemeToggle expanded className="justify-start rounded-[1.75rem] py-5" />

            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-[1.75rem] border border-border bg-card/55 px-6 py-5 text-lg uppercase tracking-[0.28em] text-foreground/84 transition-all duration-300 hover:border-primary/35 hover:bg-primary/10 hover:text-foreground"
              >
                {link.name}
              </Link>
            ))}

            {!authLoading && session ? (
              <>
                <div className="px-2 pb-2 pt-1 font-inter text-xs uppercase tracking-[0.28em] text-primary">
                  Hai, {greetingName}
                </div>
                <Link
                  href="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-[1.75rem] border border-border bg-card/55 px-6 py-5 text-lg uppercase tracking-[0.28em] text-foreground/84 transition-all duration-300 hover:border-primary/35 hover:bg-primary/10 hover:text-foreground"
                >
                  Profil
                </Link>
                {isAdmin ? (
                  <Link
                    href="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-[1.75rem] border border-border bg-card/55 px-6 py-5 text-lg uppercase tracking-[0.28em] text-foreground/84 transition-all duration-300 hover:border-primary/35 hover:bg-primary/10 hover:text-foreground"
                  >
                    Dashboard
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-[1.75rem] border border-border bg-card/55 px-6 py-5 text-left text-lg uppercase tracking-[0.28em] text-foreground/58 transition-all duration-300 hover:border-destructive/35 hover:text-destructive"
                >
                  Logout
                </button>
              </>
            ) : null}

            {!authLoading && !session ? (
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-[1.75rem] border border-border bg-card/55 px-6 py-5 text-lg uppercase tracking-[0.28em] text-foreground/84 transition-all duration-300 hover:border-primary/35 hover:bg-primary/10 hover:text-foreground"
              >
                Login
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}

function getGreetingName(profile: UserProfile | null, session: Session | null) {
  const firstName = profile?.first_name?.trim();

  if (firstName) {
    return firstName;
  }

  const metadataName =
    typeof session?.user.user_metadata?.full_name === "string"
      ? session.user.user_metadata.full_name.trim().split(/\s+/)[0]
      : "";

  if (metadataName) {
    return metadataName;
  }

  return session?.user.email?.split("@")[0] ?? "User";
}
