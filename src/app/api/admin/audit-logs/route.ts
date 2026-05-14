import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminApi";

export async function GET(request: Request) {
  try {
    const access = await requireAdminApi();
    if ("error" in access) {
      return access.error;
    }

    const url = new URL(request.url);
    const tableName = url.searchParams.get("table_name");
    const action = url.searchParams.get("action");
    const performedBy = url.searchParams.get("performed_by");
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");
    const supabaseAdmin = access.supabaseAdmin;

    let query = supabaseAdmin
      .from("audit_logs")
      .select("id, table_name, record_id, action, old_data, new_data, performed_by, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (tableName) {
      query = query.ilike("table_name", `%${tableName}%`);
    }

    if (action) {
      query = query.ilike("action", `%${action}%`);
    }

    if (performedBy) {
      query = query.eq("performed_by", performedBy);
    }

    if (dateFrom) {
      query = query.gte("created_at", `${dateFrom}T00:00:00`);
    }

    if (dateTo) {
      query = query.lte("created_at", `${dateTo}T23:59:59`);
    }

    const { data: logs, error } = await query;

    if (error) {
      return NextResponse.json({ error: "Failed to load audit logs" }, { status: 500 });
    }

    const actorIds = Array.from(
      new Set((logs ?? []).map((log) => log.performed_by).filter(Boolean)),
    ) as string[];
    const actorProfiles =
      actorIds.length > 0
        ? await supabaseAdmin
            .from("profiles")
            .select("id, first_name, last_name")
            .in("id", actorIds)
        : { data: [], error: null };

    const actorMap = new Map(
      (actorProfiles.data ?? []).map((actor) => [
        actor.id,
        `${actor.first_name ?? ""} ${actor.last_name ?? ""}`.trim() || null,
      ]),
    );

    const actorEmailEntries = await Promise.all(
      actorIds.map(async (actorId) => {
        const result = await supabaseAdmin.auth.admin.getUserById(actorId);
        return [actorId, result.data.user?.email ?? null] as const;
      }),
    );
    const actorEmailMap = new Map(actorEmailEntries);

    return NextResponse.json({
      logs: (logs ?? []).map((log) => ({
        ...log,
        actor_name: log.performed_by ? actorMap.get(log.performed_by) ?? null : null,
        actor_email: log.performed_by ? actorEmailMap.get(log.performed_by) ?? null : null,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Failed to load audit logs" }, { status: 500 });
  }
}
