"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Building2,
  Dumbbell,
  LayoutDashboard,
  Sparkles,
  Users,
  UtensilsCrossed,
  Waves,
} from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  getStaticRooms,
  resolveRoomDetails,
  type RoomCatalogItem,
} from "@/lib/roomCatalog";

gsap.registerPlugin(ScrollTrigger);

const facilityFeatures = [
  {
    title: "Skyline Fitness Club",
    desc: "A fully equipped gym with Technogym stations, sunrise yoga corners, and sweeping city views to start the day in rhythm.",
    icon: <Dumbbell className="h-5 w-5" />,
  },
  {
    title: "Infinity Pool Deck",
    desc: "An elevated pool lined with cabanas, evening lighting, and soft skyline reflections for slow afternoons above Jakarta.",
    icon: <Waves className="h-5 w-5" />,
  },
  {
    title: "Panoramic City View",
    desc: "Floor-to-ceiling vantage points frame Bundaran HI, golden-hour traffic trails, and the capital's most cinematic nightscape.",
    icon: <Building2 className="h-5 w-5" />,
  },
  {
    title: "Signature Restaurant",
    desc: "A destination dining room serving refined Indonesian and international plates with a late-night ambience shaped by live jazz.",
    icon: <UtensilsCrossed className="h-5 w-5" />,
  },
  {
    title: "Spa & Wellness Rituals",
    desc: "Private treatment suites, aromatherapy journeys, and restorative massage programs designed to quiet the pace of the city.",
    icon: <Sparkles className="h-5 w-5" />,
  },
  {
    title: "Concierge Lounge",
    desc: "A discreet lounge for bespoke itineraries, priority transfers, and private check-in guided by our round-the-clock concierge team.",
    icon: <BellRing className="h-5 w-5" />,
  },
];

const heroMetaPlaceholderCount = 4;

export default function Home() {
  const fallbackRooms = getStaticRooms().map((room) => resolveRoomDetails(room.id));
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);
  const pageRef = useRef<HTMLElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const philosophyRef = useRef<HTMLElement | null>(null);
  const collectionRef = useRef<HTMLElement | null>(null);
  const fadeTimeoutRef = useRef<number | null>(null);
  const heroContentAnimatedRef = useRef(false);
  const heroWarmupEventSentRef = useRef(false);

  const [hasVideoEnded, setHasVideoEnded] = useState(false);
  const [isFadingToBlack, setIsFadingToBlack] = useState(false);
  const [catalogRooms, setCatalogRooms] = useState<RoomCatalogItem[]>(fallbackRooms);

  const dispatchWarmupEvent = () => {
    if (heroWarmupEventSentRef.current) {
      return;
    }

    heroWarmupEventSentRef.current = true;
    window.dispatchEvent(new Event("aura:start-global-warmup"));
  };

  useEffect(() => {
    if (!heroVideoRef.current || hasVideoEnded) {
      return;
    }

    heroVideoRef.current.currentTime = 0;

    void heroVideoRef.current.play().catch(() => {
      dispatchWarmupEvent();
      setHasVideoEnded(true);
    });
  }, [hasVideoEnded]);

  useEffect(() => {
    const controller = new AbortController();

    const loadRooms = async () => {
      try {
        const response = await fetch("/api/rooms", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const result = (await response.json()) as { rooms?: RoomCatalogItem[] };

        if (result.rooms?.length) {
          setCatalogRooms(result.rooms);
        }
      } catch {
        // Fallback to static catalog when live data is unavailable.
      }
    };

    void loadRooms();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const media = gsap.matchMedia();

    media.add("(prefers-reduced-motion: no-preference)", () => {
      const ctx = gsap.context(() => {
        if (progressRef.current && pageRef.current) {
          gsap.fromTo(
            progressRef.current,
            { scaleY: 0 },
            {
              scaleY: 1,
              ease: "none",
              transformOrigin: "top center",
              scrollTrigger: {
                trigger: pageRef.current,
                start: "top top",
                end: "bottom bottom",
                scrub: true,
              },
            },
          );
        }

        gsap.to(".ux-hero-stack-target", {
          scale: 0.94,
          opacity: 0.42,
          yPercent: -4,
          transformOrigin: "center center",
          ease: "none",
          scrollTrigger: {
            trigger: philosophyRef.current,
            start: "top bottom",
            end: "top top",
            scrub: true,
          },
        });

        gsap.fromTo(
          ".ux-stack-panel",
          { yPercent: 8 },
          {
            yPercent: 0,
            ease: "none",
            scrollTrigger: {
              trigger: philosophyRef.current,
              start: "top bottom",
              end: "top 65%",
              scrub: true,
            },
          },
        );

        const revealConfig = {
          autoAlpha: 0,
          y: 40,
          duration: 0.9,
          ease: "power3.out",
        };

        gsap.from(".ux-philosophy-kicker", {
          ...revealConfig,
          scrollTrigger: {
            trigger: philosophyRef.current,
            start: "top 78%",
          },
        });

        gsap.from(".ux-philosophy-heading", {
          ...revealConfig,
          y: 48,
          delay: 0.08,
          scrollTrigger: {
            trigger: philosophyRef.current,
            start: "top 74%",
          },
        });

        gsap.from(".ux-philosophy-copy", {
          ...revealConfig,
          y: 32,
          delay: 0.16,
          scrollTrigger: {
            trigger: philosophyRef.current,
            start: "top 72%",
          },
        });

        gsap.from(".ux-philosophy-card", {
          autoAlpha: 0,
          y: 52,
          duration: 0.95,
          ease: "power3.out",
          stagger: 0.14,
          scrollTrigger: {
            trigger: ".ux-philosophy-grid",
            start: "top 82%",
          },
        });

        gsap.fromTo(
          ".ux-philosophy-accent",
          { scaleX: 0, transformOrigin: "left center" },
          {
            scaleX: 1,
            duration: 1,
            ease: "power2.out",
            scrollTrigger: {
              trigger: philosophyRef.current,
              start: "top 80%",
            },
          },
        );

        gsap.from(".ux-collection-kicker", {
          ...revealConfig,
          scrollTrigger: {
            trigger: collectionRef.current,
            start: "top 78%",
          },
        });

        gsap.from(".ux-collection-heading", {
          ...revealConfig,
          y: 46,
          delay: 0.08,
          scrollTrigger: {
            trigger: collectionRef.current,
            start: "top 74%",
          },
        });

        gsap.from(".ux-collection-copy", {
          ...revealConfig,
          y: 30,
          delay: 0.14,
          scrollTrigger: {
            trigger: collectionRef.current,
            start: "top 72%",
          },
        });

        gsap.from(".ux-collection-card", {
          y: 36,
          duration: 0.9,
          ease: "power3.out",
          stagger: 0.08,
          scrollTrigger: {
            trigger: collectionRef.current,
            start: "top 74%",
            once: true,
          },
        });
      }, pageRef);

      return () => ctx.revert();
    });

    return () => media.revert();
  }, []);

  const handleVideoEnd = () => {
    setIsFadingToBlack(true);

    if (fadeTimeoutRef.current) {
      window.clearTimeout(fadeTimeoutRef.current);
    }

    fadeTimeoutRef.current = window.setTimeout(() => {
      setHasVideoEnded(true);
      setIsFadingToBlack(false);
      fadeTimeoutRef.current = null;
    }, 1000);
  };

  const handleVideoPlaying = () => {
    dispatchWarmupEvent();
  };

  useEffect(() => {
    return () => {
      if (fadeTimeoutRef.current) {
        window.clearTimeout(fadeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!hasVideoEnded || heroContentAnimatedRef.current) {
      return;
    }

    gsap.from(
      ".ux-hero-kicker, .ux-hero-meta, .ux-hero-main, .ux-hero-sub, .ux-hero-copy, .ux-hero-cta",
      {
        autoAlpha: 0,
        y: 38,
        duration: 0.95,
        stagger: 0.12,
        ease: "power3.out",
        delay: 0.18,
      },
    );

    heroContentAnimatedRef.current = true;
  }, [hasVideoEnded]);

  useEffect(() => {
    const refreshId = window.setTimeout(() => {
      ScrollTrigger.refresh();
    }, 180);

    return () => {
      window.clearTimeout(refreshId);
    };
  }, [hasVideoEnded]);

  return (
    <main
      ref={pageRef}
      className="relative min-h-screen overflow-hidden bg-background selection:bg-primary/20"
    >
      <div className="pointer-events-none fixed right-6 top-1/2 z-30 hidden h-40 -translate-y-1/2 lg:flex">
        <div className="ux-scroll-rail">
          <div ref={progressRef} className="ux-scroll-progress" />
        </div>
      </div>

      <section
        id="home"
        className="ux-hero-stack-target hero-section relative z-0 flex min-h-[100svh] w-full scroll-mt-28 items-center justify-center overflow-hidden bg-[#050505] md:sticky md:top-0 md:h-screen"
      >
        <div className="absolute inset-0 z-0">
          <Image
            src="/media/hero-bundaran-hi.webp"
            alt="Aerial view of Bundaran HI Jakarta"
            fill
            priority
            quality={78}
            sizes="100vw"
            className={`hero-photo absolute inset-0 z-0 transition-all duration-[1800ms] ease-out ${
              hasVideoEnded ? "scale-100 opacity-100" : "scale-[1.02] opacity-0"
            }`}
          />

          {!hasVideoEnded ? (
            <video
              ref={heroVideoRef}
              className="hero-video absolute inset-0 z-[1] bg-[#050505]"
              autoPlay
              muted
              playsInline
              preload="auto"
              onPlaying={handleVideoPlaying}
              onEnded={handleVideoEnd}
              onError={() => {
                dispatchWarmupEvent();
                setHasVideoEnded(true);
              }}
              aria-hidden="true"
            >
              <source src="/media/hero-bundaran-hi.mp4" type="video/mp4" />
            </video>
          ) : null}

          <div className="absolute inset-0 z-[2] bg-black/45" />
          <div className="hero-vignette" />
          <div className="hero-grid" />
          <div
            className={`absolute inset-0 z-20 bg-black transition-opacity duration-1000 ${
              isFadingToBlack ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>

        <div
          className={`relative z-20 mx-auto flex min-h-[100svh] w-full max-w-7xl flex-col justify-between px-4 pb-6 pt-28 text-white transition-opacity duration-1000 sm:px-6 sm:pb-8 sm:pt-30 lg:px-10 ${
            hasVideoEnded ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="grid gap-6 sm:gap-8 lg:grid-cols-[minmax(0,340px)_auto] lg:items-start">
            <div
              aria-hidden="true"
              className="ux-hero-kicker h-[14px] max-w-sm"
            />

            <div
              aria-hidden="true"
              className="ux-hero-meta grid w-full max-w-md grid-cols-2 gap-x-3 gap-y-4 sm:max-w-sm sm:gap-x-6 lg:justify-self-end"
            >
              {Array.from({ length: heroMetaPlaceholderCount }).map((_, index) => (
                <div
                  key={index}
                  className="min-h-[3.6rem] border-t border-transparent pt-3 opacity-0"
                />
              ))}
            </div>
          </div>

          <div className="grid gap-10 sm:gap-12 lg:grid-cols-[minmax(0,1.15fr)_280px] lg:items-end">
            <div className="max-w-5xl">
              <span className="ux-hero-kicker block text-[10px] uppercase tracking-[0.28em] text-white/56 sm:tracking-[0.4em]">
                Editorial luxury / landmark arrival
              </span>
              <h1 className="ux-hero-main mt-5 font-serif text-[clamp(3.6rem,19vw,7rem)] uppercase leading-[0.82] tracking-[0.04em] text-white sm:mt-6 md:text-[clamp(4.8rem,15vw,10rem)]">
                Aura
              </h1>
              <p className="ux-hero-sub mt-4 max-w-2xl font-serif text-[clamp(0.95rem,4vw,1.2rem)] italic leading-tight text-white/82 md:text-[clamp(1rem,2vw,1.3rem)]">
                Bundaran HI edition,
              </p>
              <p className="ux-hero-sub mt-3 max-w-2xl font-serif text-[clamp(0.95rem,4vw,1.2rem)] italic leading-tight text-white/82 md:mt-4 md:text-[clamp(1rem,2vw,1.3rem)]">
                designed to feel quieter than the city below.
              </p>
              <p className="ux-hero-copy mt-6 max-w-2xl text-sm leading-6 tracking-[0.18em] text-white/54 sm:tracking-[0.24em] md:tracking-[0.28em]">
                private butler service, seamless digital booking, and skyline
                suites for slow evenings in the capital.
              </p>

              <div aria-hidden="true" className="ux-hero-cta mt-10 h-12 sm:w-fit" />

            </div>
          </div>
        </div>

        <div
          aria-hidden="true"
          className={`pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2 transition-opacity duration-700 sm:bottom-8 ${
            hasVideoEnded ? "opacity-100 delay-[2000ms]" : "opacity-0 delay-0"
          }`}
        >
          <div className="ux-hero-scroll-indicator flex w-max flex-col items-center justify-center gap-2.5">
            <div className="flex flex-col items-center">
              <div className="ux-hero-scroll-mouse">
                <span className="ux-hero-scroll-wheel" />
              </div>
              <span className="ux-hero-scroll-tail" />
            </div>
            <span className="block whitespace-nowrap text-center text-[9px] uppercase tracking-[0.28em] text-white/52 sm:text-[10px]">
              Scroll down
            </span>
          </div>
        </div>
      </section>

      <section
        id="facilities"
        ref={philosophyRef}
        className="relative z-20 -mt-8 scroll-mt-28 px-4 pb-14 sm:-mt-[10vh] md:-mt-[14vh] md:px-6 md:pb-16"
      >
        <div className="mx-auto max-w-7xl">
          <div className="ux-stack-panel ux-section-shell rounded-[1.5rem] border-border/80 pb-10 sm:rounded-t-[2rem] sm:rounded-b-[1.75rem] sm:pb-12">
            <div className="ux-philosophy-accent ux-accent-line" />
            <span className="ux-philosophy-kicker mt-8 block text-center text-[11px] uppercase tracking-[0.34em] text-primary/75">
              Facilities curated for wellness and leisure
            </span>

            <h2 className="ux-philosophy-heading mt-8 text-center text-2xl font-serif leading-[1.08] text-foreground sm:text-3xl md:text-5xl">
              Hotel facilities designed <br className="hidden sm:block" />
              <span className="text-foreground/50 italic">for slower, richer stays</span>
            </h2>

            <p className="ux-philosophy-copy mx-auto mt-6 max-w-3xl text-center text-base font-light leading-relaxed text-foreground/70 sm:mt-8 sm:text-lg">
              From sunrise workouts and skyline swims to destination dining and
              deeply restorative rituals, every shared space is composed to make
              your stay feel quieter, warmer, and unmistakably elevated.
            </p>

            <div className="ux-philosophy-grid mt-12 grid grid-cols-1 gap-5 pb-8 text-left sm:mt-16 sm:gap-6 md:mt-20 md:grid-cols-2 xl:grid-cols-3">
              {facilityFeatures.map((feature, index) => (
                <div
                  key={feature.title}
                  className="ux-philosophy-card ux-glass-card rounded-[1.5rem] border-border/80 p-6 sm:p-8"
                  style={{ "--card-delay": `${index * 140}ms` } as CSSProperties}
                >
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                    {feature.icon}
                  </div>
                  <h3 className="font-serif text-xl text-foreground">{feature.title}</h3>
                  <p className="mt-4 text-sm font-light leading-relaxed text-foreground/62">
                    {feature.desc}
                  </p>
                  <div className="mt-8 h-px w-full bg-gradient-to-r from-primary/40 via-border to-transparent" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        id="collection"
        ref={collectionRef}
        className="relative z-20 scroll-mt-28 px-4 pb-20 pt-6 sm:pt-8 md:px-6 md:pb-32"
      >
        <div className="mx-auto max-w-7xl">
          <div className="ux-section-shell rounded-[1.5rem] border-border/80 pb-10 sm:rounded-[2rem] sm:pb-12">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <span className="ux-collection-kicker text-[11px] uppercase tracking-[0.34em] text-primary/78">
                  The Collection
                </span>
                <h2 className="ux-collection-heading mt-6 font-serif text-2xl leading-[1.08] text-foreground sm:text-3xl md:text-5xl">
                  Every suite and villa, now woven into the main arrival
                  journey.
                </h2>
                <p className="ux-collection-copy mt-5 max-w-2xl text-sm leading-7 text-foreground/62 md:text-base">
                  Browse the full accommodation lineup without leaving the
                  homepage. Compare capacity and size, then continue straight
                  into the reservation flow.
                </p>
              </div>
            </div>

            <div className="ux-collection-grid mt-10 grid grid-cols-1 gap-5 pb-8 sm:mt-14 sm:gap-6 lg:grid-cols-2">
              {catalogRooms.map((room, index) => (
                <article
                  key={room.id}
                  className="ux-collection-card group overflow-hidden rounded-[1.75rem] border border-white/8 bg-[linear-gradient(180deg,rgba(28,31,42,0.96)_0%,rgba(18,21,30,0.98)_100%)] transition-all duration-500 transform-gpu hover:-translate-y-1.5 hover:border-primary/28 hover:shadow-[0_28px_60px_rgba(255,215,0,0.36)]"
                >
                  <div className="grid h-full sm:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]">
                    <Link
                      href={`/rooms/${room.id}`}
                      className="relative min-h-[220px] overflow-hidden bg-[#0d1118] sm:min-h-full"
                    >
                      <div className="absolute inset-0 z-10 bg-black/24 transition-colors duration-500 group-hover:bg-black/8" />
                      <Image
                        src={room.images[0]}
                        alt={room.name}
                        fill
                        quality={92}
                        priority={index === 0}
                        loading={index === 0 ? "eager" : "lazy"}
                        sizes="(min-width: 1280px) 240px, (min-width: 640px) 220px, 100vw"
                        className="object-cover transform-gpu will-change-transform transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                        style={{ backfaceVisibility: "hidden" }}
                      />
                    </Link>

                    <div className="flex h-full flex-col justify-between p-5 sm:p-6 lg:p-7">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[10px] uppercase tracking-[0.26em] text-primary">
                            {room.type}
                          </span>
                          {room.isFeatured ? (
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.26em] text-white/58">
                              Signature pick
                            </span>
                          ) : null}
                        </div>

                        <Link href={`/rooms/${room.id}`}>
                          <h3 className="mt-5 font-serif text-[1.55rem] leading-tight text-white transition-colors duration-300 group-hover:text-primary sm:text-[1.75rem] xl:text-[1.9rem]">
                            {room.name}
                          </h3>
                        </Link>

                        <p className="mt-4 line-clamp-3 text-sm leading-7 text-white/58">
                          {room.description}
                        </p>

                        <div className="mt-7 flex flex-wrap gap-6 text-[11px] uppercase tracking-[0.24em] text-white/46">
                          <span className="inline-flex items-center gap-2">
                            <Users className="h-4 w-4 text-primary" />
                            {room.capacity} Guests
                          </span>
                          <span className="inline-flex items-center gap-2">
                            <LayoutDashboard className="h-4 w-4 text-primary" />
                            {room.size}
                          </span>
                        </div>
                      </div>

                      <div className="mt-8 flex flex-col gap-4 border-t border-white/8 pt-6 sm:gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                          <span className="block text-[10px] uppercase tracking-[0.26em] text-white/42">
                            Per night
                          </span>
                          <span className="mt-2 block font-serif text-2xl text-white">
                            IDR {room.basePrice.toLocaleString("id-ID")}
                          </span>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                          <Link
                            href={`/rooms/${room.id}`}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-2 text-[11px] uppercase tracking-[0.26em] text-white/72 transition-all duration-300 hover:border-primary/35 hover:text-primary sm:w-auto"
                          >
                            View details
                          </Link>
                          <Link
                            href={`/booking?room=${room.id}`}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-[11px] uppercase tracking-[0.26em] text-primary-foreground transition-all duration-300 hover:shadow-[0_14px_28px_rgba(198,155,73,0.3)] sm:w-auto"
                          >
                            Reserve now
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
