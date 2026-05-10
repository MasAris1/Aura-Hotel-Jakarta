import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/adminApi";

const userSchema = z.object({
  email: z.string().email("Email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().nullable().optional(),
  role: z.enum(["guest", "receptionist", "admin"]),
});

export async function GET() {
  try {
    const access = await requireAdminApi();
    if ("error" in access) {
      return access.error;
    }

    const [{ data: profiles, error: profilesError }, { data: usersData, error: usersError }] =
      await Promise.all([
        access.supabaseAdmin
          .from("profiles")
          .select("id, first_name, last_name, role, created_at")
          .order("created_at", { ascending: false }),
        access.supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        }),
      ]);

    if (profilesError || usersError) {
      return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
    }

    const profileMap = new Map((profiles ?? []).map((entry) => [entry.id, entry]));
    const authUserIds = new Set((usersData.users ?? []).map((authUser) => authUser.id));
    const authRows = (usersData.users ?? []).map((authUser) => {
      const profile = profileMap.get(authUser.id);

      return {
        id: authUser.id,
        email: authUser.email ?? "",
        first_name: profile?.first_name ?? null,
        last_name: profile?.last_name ?? null,
        role: profile?.role ?? "guest",
        created_at: profile?.created_at ?? authUser.created_at ?? null,
        last_sign_in_at: authUser.last_sign_in_at ?? null,
        email_confirmed_at: authUser.email_confirmed_at ?? null,
        deleted_at: null,
        is_current_user: authUser.id === access.user.id,
      };
    });
    const profileOnlyRows = (profiles ?? [])
      .filter((entry) => !authUserIds.has(entry.id))
      .map((entry) => ({
        ...entry,
        email: "",
        last_sign_in_at: null,
        email_confirmed_at: null,
        deleted_at: null,
        is_current_user: entry.id === access.user.id,
      }));

    return NextResponse.json({
      users: [...authRows, ...profileOnlyRows].sort((left, right) => {
        const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
        const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;

        return rightTime - leftTime;
      }),
    });
  } catch {
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireAdminApi();
  if ("error" in access) {
    return access.error;
  }

  try {
    const parsed = userSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid user payload" }, { status: 400 });
    }

    const { email, password, first_name, last_name, role } = parsed.data;
    const { data: createdUser, error: createError } =
      await access.supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          first_name,
          last_name: last_name ?? "",
          full_name: `${first_name} ${last_name ?? ""}`.trim(),
        },
      });

    if (createError || !createdUser.user) {
      return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
    }

    const profilePayload = {
      id: createdUser.user.id,
      first_name,
      last_name: last_name ?? "",
      role,
    };
    const { data: profile, error: profileError } = await access.supabaseAdmin
      .from("profiles")
      .upsert(profilePayload, { onConflict: "id" })
      .select("id, first_name, last_name, role, created_at")
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Failed to create user profile" }, { status: 500 });
    }

    await access.supabaseAdmin.from("audit_logs").insert({
      table_name: "profiles",
      record_id: profile.id,
      action: "INSERT",
      new_data: profile,
      performed_by: access.user.id,
    });

    return NextResponse.json({
      user: {
        ...profile,
        deleted_at: null,
        email: createdUser.user.email ?? email,
        last_sign_in_at: createdUser.user.last_sign_in_at ?? null,
        email_confirmed_at: createdUser.user.email_confirmed_at ?? null,
        is_current_user: false,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
