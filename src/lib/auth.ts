import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export type ProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "first_name" | "last_name" | "role"
>;

export type ProfileRole = ProfileRow["role"];

export function isAdminRole(role: ProfileRole | undefined | null) {
  return role === "admin";
}

export function isReceptionistRole(role: ProfileRole | undefined | null) {
  return role === "receptionist";
}

export function isStaffRole(role: ProfileRole | undefined | null) {
  return isAdminRole(role) || isReceptionistRole(role);
}

export function getRoleHomePath(role: ProfileRole | undefined | null) {
  if (isAdminRole(role)) {
    return "/admin";
  }

  if (isReceptionistRole(role)) {
    return "/dashboard";
  }

  return "/vip";
}

export function sanitizeInternalRedirect(redirectTo?: string | null) {
  if (!redirectTo) {
    return null;
  }

  if (
    !redirectTo.startsWith("/") ||
    redirectTo.startsWith("//") ||
    redirectTo.includes("\\") ||
    /[\r\n]/.test(redirectTo)
  ) {
    return null;
  }

  return redirectTo;
}

export function getPostAuthRedirect(
  role: ProfileRole | undefined | null,
  redirectTo?: string | null,
) {
  const safeRedirect = sanitizeInternalRedirect(redirectTo);

  if (safeRedirect) {
    if (safeRedirect.startsWith("/admin") && !isAdminRole(role)) {
      return "/dashboard";
    }

    return safeRedirect;
  }

  return getRoleHomePath(role);
}

function deriveProfileName(user: User) {
  const fullName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : "";

  if (fullName) {
    const [firstName = "", ...restNames] = fullName.split(/\s+/);

    return {
      first_name: firstName,
      last_name: restNames.join(" "),
    };
  }

  const fallbackName = user.email?.split("@")[0] ?? "Guest";

  return {
    first_name: fallbackName,
    last_name: "",
  };
}

export async function getProfileForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("Failed to load user profile");
  }

  return data;
}

export async function ensureProfileForUser(
  supabase: SupabaseClient<Database>,
  user: User,
) {
  const existingProfile = await getProfileForUser(supabase, user.id);

  if (existingProfile) {
    return existingProfile;
  }

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    ...deriveProfileName(user),
  });

  if (error && error.code !== "23505") {
    throw new Error("Failed to provision user profile");
  }

  const profile = await getProfileForUser(supabase, user.id);

  if (!profile) {
    throw new Error("User profile is not available");
  }

  return profile;
}

export function getPublicAuthErrorMessage(
  error: unknown,
  fallback = "Authentication failed. Please try again.",
) {
  const rawMessage =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";
  const normalizedMessage = rawMessage.toLowerCase();

  if (normalizedMessage.includes("invalid login credentials")) {
    return "Invalid email or password.";
  }

  if (normalizedMessage.includes("email not confirmed")) {
    return "Please verify your email before signing in.";
  }

  if (normalizedMessage.includes("user already registered")) {
    return "An account with this email already exists.";
  }

  if (normalizedMessage.includes("rate limit")) {
    return "Too many requests. Please wait a moment and try again.";
  }

  if (
    normalizedMessage.includes("password should be at least") ||
    normalizedMessage.includes("password is too short")
  ) {
    return "Password does not meet the minimum security requirements.";
  }

  if (normalizedMessage.includes("same password")) {
    return "Please choose a different password from your current password.";
  }

  if (normalizedMessage.includes("failed to load user profile")) {
    return "We could not load your account profile. Please try again.";
  }

  if (normalizedMessage.includes("failed to provision user profile")) {
    return "We could not finish preparing your account. Please try again.";
  }

  if (normalizedMessage.includes("profile is not available")) {
    return "Your account profile is not ready yet. Please try again.";
  }

  return fallback;
}
