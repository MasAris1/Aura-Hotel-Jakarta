"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import roomsData from "@/data/rooms.json";
import {
  CLIENT_WARMUP_KEYS,
  deriveGuestIdentity,
  enrichBookingWithRoomData,
  writeSessionCache,
  type BookingRecord,
  type UserProfile,
} from "@/lib/clientWarmup";
import { isAdminRole, isStaffRole } from "@/lib/auth";
import { createClient } from "@/utils/supabase/client";

declare global {
  interface Navigator {
    connection?: {
      effectiveType?: string;
      saveData?: boolean;
    };
  }
}

const CORE_ROUTES = ["/", "/booking", "/login", "/register", "/dashboard", "/vip"];
const ROOM_ROUTES = roomsData.map((room) => `/rooms/${room.id}`);
const STATIC_IMAGE_TARGETS = [
  "/media/hero-bundaran-hi.webp",
  ...roomsData.flatMap((room) => room.images.slice(0, 1)),
  "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?q=80&w=2940&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1542314831-c6a4d27ce66f?q=80&w=2940&auto=format&fit=crop",
];
const WARMUP_EVENT = "aura:start-global-warmup";
const SESSION_WARMUP_KEY = "aura-global-warmup-v1";

function warmImage(url: string) {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
}

export function AppWarmup() {
  const pathname = usePathname();
  const router = useRouter();
  const warmupStartedRef = useRef(false);

  useEffect(() => {
    const connection = navigator.connection;
    const isConstrainedConnection =
      connection?.saveData ||
      connection?.effectiveType === "slow-2g" ||
      connection?.effectiveType === "2g";

    const routeTargets = Array.from(new Set([...CORE_ROUTES, ...ROOM_ROUTES])).filter(
      (route) => route !== pathname,
    );

    const runWarmup = () => {
      if (warmupStartedRef.current) {
        return;
      }

      warmupStartedRef.current = true;

      const hasWarmedThisSession =
        window.sessionStorage.getItem(SESSION_WARMUP_KEY) === "1";
      window.sessionStorage.setItem(SESSION_WARMUP_KEY, "1");

      const startRoutePrefetch = () => {
        for (const route of routeTargets.slice(0, 4)) {
          router.prefetch(route);
        }

        window.setTimeout(() => {
          for (const route of routeTargets.slice(4)) {
            router.prefetch(route);
          }
        }, isConstrainedConnection ? 1200 : 320);
      };

      const startImageWarmup = () => {
        if (isConstrainedConnection || hasWarmedThisSession) {
          return;
        }

        for (const url of STATIC_IMAGE_TARGETS) {
          warmImage(url);
        }
      };

      const startUserWarmup = async () => {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          return;
        }

        const guestIdentity = deriveGuestIdentity(session.user);
        writeSessionCache(CLIENT_WARMUP_KEYS.bookingIdentity, guestIdentity);

        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name, role")
          .eq("id", session.user.id)
          .single();

        const userProfile =
          profile || ({ first_name: guestIdentity.firstName, last_name: guestIdentity.lastName } satisfies UserProfile);
        writeSessionCache(CLIENT_WARMUP_KEYS.userProfile, userProfile);

        if (isAdminRole(profile?.role)) {
          router.prefetch("/admin");
        } else if (profile?.role === "receptionist") {
          router.prefetch("/dashboard");
        }

        if (isConstrainedConnection) {
          return;
        }

        let query = supabase
          .from("bookings")
          .select("*")
          .order("created_at", { ascending: false });

        if (!isStaffRole(profile?.role)) {
          query = query.eq("user_id", session.user.id);
        }

        const { data: bookings } = await query;

        if (bookings) {
          writeSessionCache(CLIENT_WARMUP_KEYS.dashboardSnapshot, {
            userProfile,
            reservations: (bookings as BookingRecord[]).map(enrichBookingWithRoomData),
          });
        }
      };

      const requestIdle = window.requestIdleCallback;
      const cancelIdle = window.cancelIdleCallback;

      if (typeof requestIdle === "function") {
        const idleId = requestIdle(() => {
          startRoutePrefetch();
          window.setTimeout(startImageWarmup, 220);
          void startUserWarmup();
        });

        return () => {
          if (typeof cancelIdle === "function") {
            cancelIdle(idleId);
          }
        };
      }

      const fallbackId = window.setTimeout(() => {
        startRoutePrefetch();
        window.setTimeout(startImageWarmup, 220);
        void startUserWarmup();
      }, 180);

      return () => {
        window.clearTimeout(fallbackId);
      };
    };

    const handleWarmupEvent = () => {
      cleanupWarmupScheduler = runWarmup();
    };

    let cleanupWarmupScheduler: (() => void) | undefined;
    const fallbackDelay = pathname === "/" ? 4200 : 900;
    const fallbackTimer = window.setTimeout(() => {
      cleanupWarmupScheduler = runWarmup();
    }, fallbackDelay);

    window.addEventListener(WARMUP_EVENT, handleWarmupEvent);

    return () => {
      window.removeEventListener(WARMUP_EVENT, handleWarmupEvent);
      window.clearTimeout(fallbackTimer);
      cleanupWarmupScheduler?.();
    };
  }, [pathname, router]);

  return null;
}
