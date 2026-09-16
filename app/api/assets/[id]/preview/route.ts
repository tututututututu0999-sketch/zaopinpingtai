import { query } from "@/lib/db";
import { getObject } from "@/lib/storage";
import { NextResponse } from "next/server";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const asset = await query<{ preview_key: string | null }>(`SELECT preview_key FROM assets WHERE id=$1`, [(await params).id]);
    if (!asset.rows[0]?.preview_key) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(await getObject(asset.rows[0].preview_key), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
  } catch { return new NextResponse("Not found", { status: 404 }); }
}
