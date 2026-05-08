import { NextResponse } from "next/server";
import { midtransConfigDiagnostics } from "@/lib/midtrans";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      diagnostics: {
        midtrans: midtransConfigDiagnostics,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
