import { redirect } from "next/navigation";
import { sanitizeInternalRedirect } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { VerifyTwoFactorClient } from "./VerifyTwoFactorClient";

type VerifyTwoFactorPageProps = {
  searchParams?: Promise<{
    redirect?: string | string[];
  }>;
};

export default async function VerifyTwoFactorPage({
  searchParams,
}: VerifyTwoFactorPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect("/login");
  }

  const params = searchParams ? await searchParams : {};
  const rawRedirect = Array.isArray(params.redirect)
    ? params.redirect[0]
    : params.redirect;
  const redirectTo = sanitizeInternalRedirect(rawRedirect) ?? "/vip";

  return <VerifyTwoFactorClient email={user.email} redirectTo={redirectTo} />;
}
