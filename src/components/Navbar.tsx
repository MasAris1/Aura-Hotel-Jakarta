"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import {
  clearSessionCache,
  readSessionCache,
  writeSessionCache,
  CLIENT_WARMUP_KEYS,
  type UserProfile,
} from "@/lib/clientWarmup";
import { getRoleHomePath, isAdminRole, isStaffRole } from "@/lib/auth";
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
  const [userRole, setUserRole] = useState<string | null>(
    () =>
      readSessionCache<UserProfile>(CLIENT_WARMUP_KEYS.userProfile)?.role ?? null,
  );
  const [visibleSection, setVisibleSection] = useState<string | null>(null);
  const [manualSection, setManualSection] = useState<string | null>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0, opacity: 0 });
  const navDesktopRef = useRef<HTMLDivElement | null>(null);
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
        setUserRole(null);
        return;
      }

      const cachedProfile = readSessionCache<UserProfile>(
        CLIENT_WARMUP_KEYS.userProfile,
      );

      if (cachedProfile?.role) {
        setUserRole(cachedProfile.role);
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, role")
        .eq("id", currentSession.user.id)
        .single();

      if (!profile) {
        setUserRole(cachedProfile?.role ?? null);
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
      setUserRole(profile.role ?? null);
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
        setUserRole(null);
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
    await supabase.auth.signOut();
    clearWarmCaches();
    setSession(null);
    setMobileMenuOpen(false);
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
  const isStaffUser = isStaffRole(userRole);
  const portalHref = session ? getRoleHomePath(userRole) : "/login";
  const portalLabel = isAdminRole(userRole)
    ? "Admin Panel"
    : isStaffUser
      ? "Ops Dashboard"
      : "Guest Portal";
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
          <div
            ref={navDesktopRef}
            className="relative flex items-center rounded-full border border-white/10 bg-white/[0.03] p-1.5"
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
                href={portalHref}
                className={`rounded-full border border-white/10 px-4 py-2 text-[11px] uppercase tracking-[0.26em] transition-colors duration-300 ${textClassName} hover:border-primary/35 hover:text-white`}
              >
                {portalLabel}
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
                  href={portalHref}
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] px-6 py-5 text-lg uppercase tracking-[0.28em] text-white/84 transition-all duration-300 hover:border-primary/35 hover:bg-primary/10 hover:text-white"
                >
                  {portalLabel}
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
          </div>
        </div>
      ) : null}
    </header>
  );
}
