import type { Database } from "@/types/supabase";

type FacilityRow = Database["public"]["Tables"]["facilities"]["Row"];

export type LiveFacilityLookup = Pick<
  FacilityRow,
  | "id"
  | "title"
  | "description"
  | "icon"
  | "image_url"
  | "status"
  | "sort_order"
  | "deleted_at"
  | "created_at"
>;

export type ResolvedFacilityDetails = {
  id: string;
  title: string;
  description: string;
  icon: string;
  imageUrl: string | null;
  status: string | null;
  sortOrder: number;
};

export type FacilityCatalogItem = ResolvedFacilityDetails;

const staticFacilities: FacilityCatalogItem[] = [
  {
    id: "skyline-fitness-club",
    title: "Skyline Fitness Club",
    description:
      "A fully equipped gym with Technogym stations, sunrise yoga corners, and sweeping city views to start the day in rhythm.",
    icon: "fitness",
    imageUrl: null,
    status: "AVAILABLE",
    sortOrder: 10,
  },
  {
    id: "infinity-pool-deck",
    title: "Infinity Pool Deck",
    description:
      "An elevated pool lined with cabanas, evening lighting, and soft skyline reflections for slow afternoons above Jakarta.",
    icon: "pool",
    imageUrl: null,
    status: "AVAILABLE",
    sortOrder: 20,
  },
  {
    id: "panoramic-city-view",
    title: "Panoramic City View",
    description:
      "Floor-to-ceiling vantage points frame Bundaran HI, golden-hour traffic trails, and the capital's most cinematic nightscape.",
    icon: "view",
    imageUrl: null,
    status: "AVAILABLE",
    sortOrder: 30,
  },
  {
    id: "signature-restaurant",
    title: "Signature Restaurant",
    description:
      "A destination dining room serving refined Indonesian and international plates with a late-night ambience shaped by live jazz.",
    icon: "restaurant",
    imageUrl: null,
    status: "AVAILABLE",
    sortOrder: 40,
  },
  {
    id: "spa-wellness-rituals",
    title: "Spa & Wellness Rituals",
    description:
      "Private treatment suites, aromatherapy journeys, and restorative massage programs designed to quiet the pace of the city.",
    icon: "spa",
    imageUrl: null,
    status: "AVAILABLE",
    sortOrder: 50,
  },
  {
    id: "concierge-lounge",
    title: "Concierge Lounge",
    description:
      "A discreet lounge for bespoke itineraries, priority transfers, and private check-in guided by our round-the-clock concierge team.",
    icon: "concierge",
    imageUrl: null,
    status: "AVAILABLE",
    sortOrder: 60,
  },
];

const staticFacilityMap = new Map(staticFacilities.map((facility) => [facility.id, facility]));

export function getStaticFacilities() {
  return staticFacilities;
}

export function getStaticFacilityById(facilityId: string | null | undefined) {
  if (!facilityId) {
    return null;
  }

  return staticFacilityMap.get(facilityId) ?? null;
}

export function resolveFacilityDetails(
  facilityId: string | null | undefined,
  liveFacility?: LiveFacilityLookup | null,
): ResolvedFacilityDetails {
  const staticFacility = getStaticFacilityById(facilityId);
  const imageUrl = liveFacility?.image_url?.trim() || staticFacility?.imageUrl || null;

  return {
    id: facilityId ?? liveFacility?.id ?? "",
    title: liveFacility?.title?.trim() || staticFacility?.title || "Untitled Facility",
    description:
      liveFacility?.description?.trim() ||
      staticFacility?.description ||
      "Facility details unavailable.",
    icon: liveFacility?.icon?.trim() || staticFacility?.icon || "concierge",
    imageUrl,
    status: liveFacility?.status ?? staticFacility?.status ?? "AVAILABLE",
    sortOrder: Number(liveFacility?.sort_order ?? staticFacility?.sortOrder ?? 999),
  };
}

export function mergeFacilityCatalogItems(facilities: LiveFacilityLookup[]) {
  const hiddenFacilityIds = new Set(
    facilities
      .filter((facility) => facility.deleted_at || facility.status === "UNAVAILABLE")
      .map((facility) => facility.id),
  );
  const liveFacilities = facilities
    .filter((facility) => !facility.deleted_at && facility.status !== "UNAVAILABLE")
    .map((facility) => resolveFacilityDetails(facility.id, facility));
  const liveFacilityIds = new Set(facilities.map((facility) => facility.id));
  const fallbackFacilities = staticFacilities.filter(
    (facility) => !liveFacilityIds.has(facility.id) && !hiddenFacilityIds.has(facility.id),
  );

  return [...liveFacilities, ...fallbackFacilities].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.title.localeCompare(right.title);
  });
}
