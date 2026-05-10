import { NextResponse } from "next/server";
import { getStaticFacilities } from "@/lib/facilityCatalog";

export async function GET() {
  return NextResponse.json({ facilities: getStaticFacilities() });
}
