"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type CSSProperties,
} from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Building2,
  Dumbbell,
  Edit3,
  ImagePlus,
  LayoutDashboard,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Users,
  UtensilsCrossed,
  Waves,
  X,
} from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  getStaticRooms,
  resolveRoomDetails,
  type RoomCatalogItem,
} from "@/lib/roomCatalog";
import {
  getStaticFacilities,
  type FacilityCatalogItem,
} from "@/lib/facilityCatalog";
import { createClient } from "@/utils/supabase/client";

gsap.registerPlugin(ScrollTrigger);

const heroMetaPlaceholderCount = 4;
const HERO_VIDEO_SESSION_KEY = "aura-hero-video-seen-v1";
const roomPlaceholderImage =
  "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?q=80&w=1600&auto=format&fit=crop";
const facilityIconOptions = [
  { value: "fitness", label: "Fitness" },
  { value: "pool", label: "Pool" },
  { value: "view", label: "City View" },
  { value: "restaurant", label: "Restaurant" },
  { value: "spa", label: "Spa" },
  { value: "concierge", label: "Concierge" },
];

type StatusValue = "AVAILABLE" | "UNAVAILABLE";

type RoomFormState = {
  id?: string;
  name: string;
  type: string;
  base_price: string;
  capacity: string;
  imagesText: string;
  description: string;
  status: StatusValue;
};

type FacilityFormState = {
  id?: string;
  title: string;
  description: string;
  icon: string;
  image_url: string;
  status: StatusValue;
  sort_order: string;
};

type CrudModalState =
  | { kind: "room"; mode: "create" | "edit"; form: RoomFormState }
  | { kind: "facility"; mode: "create" | "edit"; form: FacilityFormState }
  | null;

const emptyRoomForm: RoomFormState = {
  name: "",
  type: "Suite",
  base_price: "",
  capacity: "2",
  imagesText: "",
  description: "",
  status: "AVAILABLE",
};

const emptyFacilityForm: FacilityFormState = {
  title: "",
  description: "",
  icon: "concierge",
  image_url: "",
  status: "AVAILABLE",
  sort_order: "70",
};

function renderFacilityIcon(icon: string) {
  const className = "h-5 w-5";

  switch (icon) {
    case "fitness":
      return <Dumbbell className={className} />;
    case "pool":
      return <Waves className={className} />;
    case "view":
      return <Building2 className={className} />;
    case "restaurant":
      return <UtensilsCrossed className={className} />;
    case "spa":
      return <Sparkles className={className} />;
    default:
      return <BellRing className={className} />;
  }
}

function subscribeHeroVideoSession() {
  return () => {};
}

function getHeroVideoSessionSnapshot() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(HERO_VIDEO_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export default function Home() {
  const fallbackRooms = getStaticRooms().map((room) => resolveRoomDetails(room.id));
  const fallbackFacilities = getStaticFacilities();
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);
  const pageRef = useRef<HTMLElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const philosophyRef = useRef<HTMLElement | null>(null);
  const collectionRef = useRef<HTMLElement | null>(null);
  const fadeTimeoutRef = useRef<number | null>(null);
  const heroContentAnimatedRef = useRef(false);
  const heroWarmupEventSentRef = useRef(false);

  const hasSeenHeroVideo = useSyncExternalStore(
    subscribeHeroVideoSession,
    getHeroVideoSessionSnapshot,
    () => false,
  );
  const [hasVideoFinished, setHasVideoFinished] = useState(false);
  const hasVideoEnded = hasSeenHeroVideo || hasVideoFinished;
  const [isFadingToBlack, setIsFadingToBlack] = useState(false);
  const [catalogRooms, setCatalogRooms] = useState<RoomCatalogItem[]>(fallbackRooms);
  const [catalogFacilities, setCatalogFacilities] =
    useState<FacilityCatalogItem[]>(fallbackFacilities);
  const [isAdmin, setIsAdmin] = useState(false);
  const [crudModal, setCrudModal] = useState<CrudModalState>(null);
  const [crudError, setCrudError] = useState<string | null>(null);
  const [crudSuccess, setCrudSuccess] = useState<string | null>(null);
  const [activeCrudId, setActiveCrudId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const dispatchWarmupEvent = () => {
    if (heroWarmupEventSentRef.current) {
      return;
    }

    heroWarmupEventSentRef.current = true;
    window.dispatchEvent(new Event("aura:start-global-warmup"));
  };

  const markHeroVideoSeen = () => {
    try {
      window.sessionStorage.setItem(HERO_VIDEO_SESSION_KEY, "1");
    } catch {
      // Session storage can be unavailable in restricted browser contexts.
    }
  };

  useEffect(() => {
    if (!heroVideoRef.current || hasVideoEnded) {
      return;
    }

    markHeroVideoSeen();
    heroVideoRef.current.currentTime = 0;

    void heroVideoRef.current.play().catch(() => {
      dispatchWarmupEvent();
      setHasVideoFinished(true);
    });
  }, [hasVideoEnded]);

  const loadRooms = async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/rooms", {
        cache: "no-store",
        signal,
      });

      if (!response.ok) {
        return;
      }

      const result = (await response.json()) as { rooms?: RoomCatalogItem[] };

      if (result.rooms) {
        setCatalogRooms(result.rooms);
      }
    } catch {
      // Fallback to static catalog when live data is unavailable.
    }
  };

  const loadFacilities = async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/facilities", {
        cache: "no-store",
        signal,
      });

      if (!response.ok) {
        return;
      }

      const result = (await response.json()) as { facilities?: FacilityCatalogItem[] };

      if (result.facilities) {
        setCatalogFacilities(result.facilities);
      }
    } catch {
      // Fallback to static facilities when live data is unavailable.
    }
  };

  const refreshPublicContent = async () => {
    await Promise.all([loadRooms(), loadFacilities()]);
  };

  useEffect(() => {
    const controller = new AbortController();

    void loadRooms(controller.signal);
    void loadFacilities(controller.signal);

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    const syncAdminRole = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        if (isMounted) {
          setIsAdmin(false);
        }
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (isMounted) {
        setIsAdmin(profile?.role === "admin");
      }
    };

    void syncAdminRole();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void syncAdminRole();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
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
    markHeroVideoSeen();
    setIsFadingToBlack(true);

    if (fadeTimeoutRef.current) {
      window.clearTimeout(fadeTimeoutRef.current);
    }

    fadeTimeoutRef.current = window.setTimeout(() => {
      setHasVideoFinished(true);
      setIsFadingToBlack(false);
      fadeTimeoutRef.current = null;
    }, 1000);
  };

  const handleVideoPlaying = () => {
    markHeroVideoSeen();
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

  const openCreateRoomModal = () => {
    setCrudError(null);
    setCrudSuccess(null);
    setCrudModal({ kind: "room", mode: "create", form: emptyRoomForm });
  };

  const openEditRoomModal = (room: RoomCatalogItem) => {
    setCrudError(null);
    setCrudSuccess(null);
    setCrudModal({
      kind: "room",
      mode: "edit",
      form: {
        id: room.id,
        name: room.name,
        type: room.type,
        base_price: String(room.basePrice),
        capacity: String(room.capacity),
        imagesText: room.images.join("\n"),
        description: room.description,
        status: room.status === "UNAVAILABLE" ? "UNAVAILABLE" : "AVAILABLE",
      },
    });
  };

  const openCreateFacilityModal = () => {
    setCrudError(null);
    setCrudSuccess(null);
    setCrudModal({ kind: "facility", mode: "create", form: emptyFacilityForm });
  };

  const openEditFacilityModal = (facility: FacilityCatalogItem) => {
    setCrudError(null);
    setCrudSuccess(null);
    setCrudModal({
      kind: "facility",
      mode: "edit",
      form: {
        id: facility.id,
        title: facility.title,
        description: facility.description,
        icon: facility.icon,
        image_url: facility.imageUrl ?? "",
        status: facility.status === "UNAVAILABLE" ? "UNAVAILABLE" : "AVAILABLE",
        sort_order: String(facility.sortOrder),
      },
    });
  };

  const updateRoomForm = (field: keyof RoomFormState, value: string) => {
    setCrudModal((current) => {
      if (!current || current.kind !== "room") {
        return current;
      }

      return {
        ...current,
        form: {
          ...current.form,
          [field]: value,
        },
      };
    });
  };

  const updateFacilityForm = (field: keyof FacilityFormState, value: string) => {
    setCrudModal((current) => {
      if (!current || current.kind !== "facility") {
        return current;
      }

      return {
        ...current,
        form: {
          ...current.form,
          [field]: value,
        },
      };
    });
  };

  const uploadCrudImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !crudModal) {
      return;
    }

    setIsUploading(true);
    setCrudError(null);
    setCrudSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", crudModal.kind === "room" ? "rooms" : "facilities");

      const response = await fetch("/api/admin/uploads", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !result.url) {
        throw new Error(result.error ?? "Failed to upload image.");
      }

      if (crudModal.kind === "room") {
        setCrudModal((current) => {
          if (!current || current.kind !== "room") {
            return current;
          }

          return {
            ...current,
            form: {
              ...current.form,
              imagesText: [...current.form.imagesText.split("\n").filter(Boolean), result.url!].join("\n"),
            },
          };
        });
      } else {
        setCrudModal((current) => {
          if (!current || current.kind !== "facility") {
            return current;
          }

          return {
            ...current,
            form: {
              ...current.form,
              image_url: result.url!,
            },
          };
        });
      }

      setCrudSuccess("Image uploaded.");
    } catch (uploadError) {
      setCrudError(uploadError instanceof Error ? uploadError.message : "Failed to upload image.");
    } finally {
      setIsUploading(false);
    }
  };

  const saveCrudItem = async () => {
    if (!crudModal) {
      return;
    }

    setActiveCrudId("saving");
    setCrudError(null);
    setCrudSuccess(null);

    try {
      const isEdit = crudModal.mode === "edit";
      const endpoint =
        crudModal.kind === "room"
          ? isEdit
            ? `/api/admin/rooms/${crudModal.form.id}`
            : "/api/admin/rooms"
          : isEdit
            ? `/api/admin/facilities/${crudModal.form.id}`
            : "/api/admin/facilities";
      const payload =
        crudModal.kind === "room"
          ? {
              name: crudModal.form.name.trim(),
              type: crudModal.form.type.trim(),
              base_price: Number(crudModal.form.base_price),
              capacity: Number(crudModal.form.capacity),
              images: crudModal.form.imagesText
                .split("\n")
                .map((value) => value.trim())
                .filter(Boolean),
              description: crudModal.form.description.trim() || null,
              status: crudModal.form.status,
            }
          : {
              title: crudModal.form.title.trim(),
              description: crudModal.form.description.trim(),
              icon: crudModal.form.icon,
              image_url: crudModal.form.image_url.trim() || null,
              status: crudModal.form.status,
              sort_order: crudModal.form.sort_order ? Number(crudModal.form.sort_order) : null,
            };
      const response = await fetch(endpoint, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to save content.");
      }

      await refreshPublicContent();
      setCrudSuccess(isEdit ? "Content updated." : "Content created.");
      setCrudModal(null);
    } catch (saveError) {
      setCrudError(saveError instanceof Error ? saveError.message : "Failed to save content.");
    } finally {
      setActiveCrudId(null);
    }
  };

  const deleteCrudItem = async (kind: "room" | "facility", id: string, label: string) => {
    const confirmed = window.confirm(`Archive "${label}" from the public page?`);

    if (!confirmed) {
      return;
    }

    setActiveCrudId(id);
    setCrudError(null);
    setCrudSuccess(null);

    try {
      const response = await fetch(
        kind === "room" ? `/api/admin/rooms/${id}` : `/api/admin/facilities/${id}`,
        { method: "DELETE" },
      );
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to archive content.");
      }

      await refreshPublicContent();
      setCrudSuccess("Content archived.");
    } catch (deleteError) {
      setCrudError(deleteError instanceof Error ? deleteError.message : "Failed to archive content.");
    } finally {
      setActiveCrudId(null);
    }
  };

  return (
    <main
      ref={pageRef}
      className="relative min-h-screen overflow-hidden bg-background selection:bg-primary/20"
    >
      {isAdmin && (crudError || crudSuccess) ? (
        <div className="fixed bottom-6 left-1/2 z-[70] w-[min(92vw,32rem)] -translate-x-1/2 rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-[0_20px_70px_rgba(0,0,0,0.24)]">
          <p className={crudError ? "text-destructive" : "text-primary"}>
            {crudError ?? crudSuccess}
          </p>
        </div>
      ) : null}

      <div className="pointer-events-none fixed right-6 top-1/2 z-30 hidden h-40 -translate-y-1/2 lg:flex">
        <div className="ux-scroll-rail">
          <div ref={progressRef} className="ux-scroll-progress" />
        </div>
      </div>

      <section
        id="home"
        className="ux-hero-stack-target hero-section relative z-0 flex min-h-[100svh] w-full scroll-mt-28 items-center justify-center overflow-hidden bg-muted dark:bg-[#050505] md:sticky md:top-0 md:h-screen"
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
              className="hero-video absolute inset-0 z-[1] bg-muted dark:bg-[#050505]"
              autoPlay
              muted
              playsInline
              preload="auto"
              onPlaying={handleVideoPlaying}
              onEnded={handleVideoEnd}
              onError={() => {
                dispatchWarmupEvent();
                setHasVideoFinished(true);
              }}
              aria-hidden="true"
            >
              <source src="/media/hero-bundaran-hi.mp4" type="video/mp4" />
            </video>
          ) : null}

          <div className="absolute inset-0 z-[2] bg-black/18 dark:bg-black/45" />
          <div className="hero-vignette" />
          <div className="hero-grid" />
          <div
            className={`absolute inset-0 z-20 bg-background transition-opacity duration-1000 dark:bg-black ${
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
            <div className="ux-hero-readable max-w-5xl text-foreground dark:text-white">
              <span className="ux-hero-kicker block text-[10px] uppercase tracking-[0.28em] text-black sm:tracking-[0.4em] dark:text-white/56">
                Editorial luxury / landmark arrival
              </span>
              <h1 className="ux-hero-main mt-5 font-serif text-[clamp(3.6rem,19vw,7rem)] uppercase leading-[0.82] tracking-[0.04em] text-black sm:mt-6 md:text-[clamp(4.8rem,15vw,10rem)] dark:text-white">
                Aura
              </h1>
              <p className="ux-hero-sub mt-4 max-w-2xl font-serif text-[clamp(0.95rem,4vw,1.2rem)] italic leading-tight text-black md:text-[clamp(1rem,2vw,1.3rem)] dark:text-white/82">
                Bundaran HI edition,
              </p>
              <p className="ux-hero-sub mt-3 max-w-2xl font-serif text-[clamp(0.95rem,4vw,1.2rem)] italic leading-tight text-black md:mt-4 md:text-[clamp(1rem,2vw,1.3rem)] dark:text-white/82">
                designed to feel quieter than the city below.
              </p>
              <p className="ux-hero-copy mt-6 max-w-xl text-sm leading-6 tracking-[0.18em] text-black sm:tracking-[0.24em] md:tracking-[0.28em] dark:max-w-2xl dark:text-white/54">
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

            {isAdmin ? (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={openCreateFacilityModal}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-[11px] uppercase tracking-[0.24em] text-primary-foreground transition-all hover:shadow-[0_14px_32px_rgba(198,155,73,0.28)]"
                >
                  <Plus className="h-4 w-4" />
                  Facility
                </button>
              </div>
            ) : null}

            <div className="ux-philosophy-grid mt-12 grid grid-cols-1 gap-5 pb-8 text-left sm:mt-16 sm:gap-6 md:mt-20 md:grid-cols-2 xl:grid-cols-3">
              {catalogFacilities.map((feature, index) => (
                <div
                  key={feature.id}
                  className="ux-philosophy-card ux-glass-card group relative overflow-hidden rounded-[1.5rem] border-border/80 p-6 sm:p-8"
                  style={{ "--card-delay": `${index * 140}ms` } as CSSProperties}
                >
                  {isAdmin ? (
                    <div className="absolute right-4 top-4 z-20 flex gap-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => openEditFacilityModal(feature)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-primary"
                        aria-label={`Edit ${feature.title}`}
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={activeCrudId === feature.id}
                        onClick={() => void deleteCrudItem("facility", feature.id, feature.title)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-500/25 bg-red-500/10 text-red-200 shadow-sm transition-colors hover:bg-red-500/18 disabled:opacity-60"
                        aria-label={`Archive ${feature.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                  {feature.imageUrl ? (
                    <div className="-mx-6 -mt-6 mb-6 h-40 overflow-hidden bg-muted sm:-mx-8 sm:-mt-8">
                      <Image
                        src={feature.imageUrl}
                        alt={feature.title}
                        width={720}
                        height={420}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    </div>
                  ) : null}
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                    {renderFacilityIcon(feature.icon)}
                  </div>
                  <h3 className="font-serif text-xl text-foreground">{feature.title}</h3>
                  <p className="mt-4 text-sm font-light leading-relaxed text-foreground/62">
                    {feature.description}
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
              {isAdmin ? (
                <button
                  type="button"
                  onClick={openCreateRoomModal}
                  className="inline-flex h-11 w-fit items-center justify-center gap-2 rounded-full bg-primary px-5 text-[11px] uppercase tracking-[0.24em] text-primary-foreground transition-all hover:shadow-[0_14px_32px_rgba(198,155,73,0.28)]"
                >
                  <Plus className="h-4 w-4" />
                  Suite
                </button>
              ) : null}
            </div>

            <div className="ux-collection-grid mt-10 grid grid-cols-1 gap-5 pb-8 sm:mt-14 sm:gap-6 lg:grid-cols-2">
              {catalogRooms.map((room, index) => (
                <article
                  key={room.id}
                  className="ux-collection-card group relative overflow-hidden rounded-[1.75rem] border border-border/80 bg-card transition-all duration-500 transform-gpu hover:-translate-y-1.5 hover:border-primary/28 hover:shadow-[0_24px_54px_rgba(95,72,38,0.16)] dark:border-white/8 dark:bg-[linear-gradient(180deg,rgba(28,31,42,0.96)_0%,rgba(18,21,30,0.98)_100%)] dark:hover:shadow-[0_28px_60px_rgba(255,215,0,0.36)]"
                >
                  {isAdmin ? (
                    <div className="absolute right-4 top-4 z-20 flex gap-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => openEditRoomModal(room)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-primary"
                        aria-label={`Edit ${room.name}`}
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={activeCrudId === room.id}
                        onClick={() => void deleteCrudItem("room", room.id, room.name)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-500/25 bg-red-500/10 text-red-200 shadow-sm transition-colors hover:bg-red-500/18 disabled:opacity-60"
                        aria-label={`Archive ${room.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                  <div className="grid h-full sm:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]">
                    <Link
                      href={`/rooms/${room.id}`}
                      className="relative min-h-[220px] overflow-hidden bg-muted sm:min-h-full dark:bg-[#0d1118]"
                    >
                      <div className="absolute inset-0 z-10 bg-transparent transition-colors duration-500 dark:bg-black/24 dark:group-hover:bg-black/8" />
                      <Image
                        src={room.images[0] ?? roomPlaceholderImage}
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
                            <span className="rounded-full border border-border bg-muted/70 px-3 py-1 text-[10px] uppercase tracking-[0.26em] text-foreground/58 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/58">
                              Signature pick
                            </span>
                          ) : null}
                        </div>

                        <Link href={`/rooms/${room.id}`}>
                          <h3 className="mt-5 font-serif text-[1.55rem] leading-tight text-foreground transition-colors duration-300 group-hover:text-primary dark:text-white sm:text-[1.75rem] xl:text-[1.9rem]">
                            {room.name}
                          </h3>
                        </Link>

                        <p className="mt-4 line-clamp-3 text-sm leading-7 text-foreground/62 dark:text-white/58">
                          {room.description}
                        </p>

                        <div className="mt-7 flex flex-wrap gap-6 text-[11px] uppercase tracking-[0.24em] text-foreground/48 dark:text-white/46">
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

                      <div className="mt-8 flex flex-col gap-4 border-t border-border pt-6 sm:gap-5 lg:flex-row lg:items-end lg:justify-between dark:border-white/8">
                        <div>
                          <span className="block text-[10px] uppercase tracking-[0.26em] text-foreground/44 dark:text-white/42">
                            Per night
                          </span>
                          <span className="mt-2 block font-serif text-2xl text-foreground dark:text-white">
                            IDR {room.basePrice.toLocaleString("id-ID")}
                          </span>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                          <Link
                            href={`/rooms/${room.id}`}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-2 text-[11px] uppercase tracking-[0.26em] text-foreground/72 transition-all duration-300 hover:border-primary/35 hover:text-primary dark:border-white/10 dark:text-white/72 sm:w-auto"
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

      {isAdmin && crudModal ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/62 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[88svh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-[0_32px_90px_rgba(0,0,0,0.36)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-primary">
                  {crudModal.mode === "edit" ? "Edit" : "Create"}{" "}
                  {crudModal.kind === "room" ? "Suite" : "Facility"}
                </p>
                <h3 className="mt-2 font-serif text-2xl text-foreground">
                  {crudModal.kind === "room"
                    ? crudModal.form.name || "New suite"
                    : crudModal.form.title || "New facility"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCrudModal(null)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-foreground/70 transition-colors hover:border-primary/40 hover:text-primary"
                aria-label="Close editor"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              {crudModal.kind === "room" ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-foreground/55">
                      Name
                      <input
                        value={crudModal.form.name}
                        onChange={(event) => updateRoomForm("name", event.target.value)}
                        className="h-11 rounded-xl border border-border bg-background px-4 text-sm normal-case tracking-normal text-foreground outline-none transition-colors focus:border-primary/40"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-foreground/55">
                      Type
                      <input
                        value={crudModal.form.type}
                        onChange={(event) => updateRoomForm("type", event.target.value)}
                        className="h-11 rounded-xl border border-border bg-background px-4 text-sm normal-case tracking-normal text-foreground outline-none transition-colors focus:border-primary/40"
                      />
                    </label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-foreground/55">
                      Price
                      <input
                        type="number"
                        min="0"
                        value={crudModal.form.base_price}
                        onChange={(event) => updateRoomForm("base_price", event.target.value)}
                        className="h-11 rounded-xl border border-border bg-background px-4 text-sm normal-case tracking-normal text-foreground outline-none transition-colors focus:border-primary/40"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-foreground/55">
                      Guests
                      <input
                        type="number"
                        min="1"
                        value={crudModal.form.capacity}
                        onChange={(event) => updateRoomForm("capacity", event.target.value)}
                        className="h-11 rounded-xl border border-border bg-background px-4 text-sm normal-case tracking-normal text-foreground outline-none transition-colors focus:border-primary/40"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-foreground/55">
                      Status
                      <select
                        value={crudModal.form.status}
                        onChange={(event) => updateRoomForm("status", event.target.value)}
                        className="h-11 rounded-xl border border-border bg-background px-4 text-sm normal-case tracking-normal text-foreground outline-none transition-colors focus:border-primary/40"
                      >
                        <option value="AVAILABLE">AVAILABLE</option>
                        <option value="UNAVAILABLE">UNAVAILABLE</option>
                      </select>
                    </label>
                  </div>
                  <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-foreground/55">
                    Description
                    <textarea
                      value={crudModal.form.description}
                      onChange={(event) => updateRoomForm("description", event.target.value)}
                      rows={4}
                      className="rounded-xl border border-border bg-background px-4 py-3 text-sm normal-case tracking-normal text-foreground outline-none transition-colors focus:border-primary/40"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-foreground/55">
                    Images
                    <span className="flex flex-wrap items-center gap-3">
                      <span className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-primary/35 bg-primary/10 px-4 text-xs text-primary transition-colors hover:bg-primary/15">
                        <ImagePlus className="h-4 w-4" />
                        Upload
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/avif"
                          disabled={isUploading}
                          onChange={(event) => void uploadCrudImage(event)}
                          className="sr-only"
                        />
                      </span>
                      {isUploading ? (
                        <span className="text-xs normal-case tracking-normal text-foreground/55">
                          Uploading image...
                        </span>
                      ) : null}
                    </span>
                    <textarea
                      value={crudModal.form.imagesText}
                      onChange={(event) => updateRoomForm("imagesText", event.target.value)}
                      rows={4}
                      placeholder="One image URL per line"
                      className="rounded-xl border border-border bg-background px-4 py-3 text-sm normal-case tracking-normal text-foreground outline-none transition-colors focus:border-primary/40"
                    />
                  </label>
                </>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                    <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-foreground/55">
                      Title
                      <input
                        value={crudModal.form.title}
                        onChange={(event) => updateFacilityForm("title", event.target.value)}
                        className="h-11 rounded-xl border border-border bg-background px-4 text-sm normal-case tracking-normal text-foreground outline-none transition-colors focus:border-primary/40"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-foreground/55">
                      Icon
                      <select
                        value={crudModal.form.icon}
                        onChange={(event) => updateFacilityForm("icon", event.target.value)}
                        className="h-11 rounded-xl border border-border bg-background px-4 text-sm normal-case tracking-normal text-foreground outline-none transition-colors focus:border-primary/40"
                      >
                        {facilityIconOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-foreground/55">
                      Status
                      <select
                        value={crudModal.form.status}
                        onChange={(event) => updateFacilityForm("status", event.target.value)}
                        className="h-11 rounded-xl border border-border bg-background px-4 text-sm normal-case tracking-normal text-foreground outline-none transition-colors focus:border-primary/40"
                      >
                        <option value="AVAILABLE">AVAILABLE</option>
                        <option value="UNAVAILABLE">UNAVAILABLE</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-foreground/55">
                      Order
                      <input
                        type="number"
                        min="0"
                        value={crudModal.form.sort_order}
                        onChange={(event) => updateFacilityForm("sort_order", event.target.value)}
                        className="h-11 rounded-xl border border-border bg-background px-4 text-sm normal-case tracking-normal text-foreground outline-none transition-colors focus:border-primary/40"
                      />
                    </label>
                  </div>
                  <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-foreground/55">
                    Description
                    <textarea
                      value={crudModal.form.description}
                      onChange={(event) => updateFacilityForm("description", event.target.value)}
                      rows={4}
                      className="rounded-xl border border-border bg-background px-4 py-3 text-sm normal-case tracking-normal text-foreground outline-none transition-colors focus:border-primary/40"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-foreground/55">
                    Image
                    <span className="flex flex-wrap items-center gap-3">
                      <span className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-primary/35 bg-primary/10 px-4 text-xs text-primary transition-colors hover:bg-primary/15">
                        <ImagePlus className="h-4 w-4" />
                        Upload
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/avif"
                          disabled={isUploading}
                          onChange={(event) => void uploadCrudImage(event)}
                          className="sr-only"
                        />
                      </span>
                      {isUploading ? (
                        <span className="text-xs normal-case tracking-normal text-foreground/55">
                          Uploading image...
                        </span>
                      ) : null}
                    </span>
                    <input
                      value={crudModal.form.image_url}
                      onChange={(event) => updateFacilityForm("image_url", event.target.value)}
                      placeholder="Image URL"
                      className="h-11 rounded-xl border border-border bg-background px-4 text-sm normal-case tracking-normal text-foreground outline-none transition-colors focus:border-primary/40"
                    />
                  </label>
                </>
              )}
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-border pt-5">
              <button
                type="button"
                onClick={() => setCrudModal(null)}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium text-foreground/72 transition-colors hover:border-primary/35 hover:text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveCrudItem()}
                disabled={activeCrudId === "saving" || isUploading}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-all hover:shadow-[0_14px_32px_rgba(198,155,73,0.28)] disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {activeCrudId === "saving" ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
