import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminApi";

const BUCKET_NAME = "admin-media";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

function getSafeFilename(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

export async function POST(request: Request) {
  const access = await requireAdminApi();
  if ("error" in access) {
    return access.error;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const folder = String(formData.get("folder") ?? "uploads")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    if (!allowedMimeTypes.has(file.type)) {
      return NextResponse.json({ error: "Only JPG, PNG, WEBP, or AVIF images are allowed" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Image must be 5MB or smaller" }, { status: 400 });
    }

    const { data: bucket } = await access.supabaseAdmin.storage.getBucket(BUCKET_NAME);

    if (!bucket) {
      const { error: bucketError } = await access.supabaseAdmin.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: MAX_FILE_SIZE,
        allowedMimeTypes: Array.from(allowedMimeTypes),
      });

      if (bucketError) {
        return NextResponse.json({ error: "Failed to prepare upload bucket" }, { status: 500 });
      }
    }

    const safeName = getSafeFilename(file.name || "image");
    const filePath = `${folder || "uploads"}/${Date.now()}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await access.supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
    }

    const { data } = access.supabaseAdmin.storage.from(BUCKET_NAME).getPublicUrl(filePath);

    return NextResponse.json({ url: data.publicUrl, path: filePath });
  } catch {
    return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
  }
}
