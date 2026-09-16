import { query } from "@/lib/db";
import { getObject } from "@/lib/storage";
import { NextResponse } from "next/server";

export async function GET(_: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  try {
    const task = await query<{ generation_key: string | null }>(`SELECT generation_key FROM design_tasks WHERE id=$1`, [filename]);
    if (!task.rows[0]?.generation_key) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(await getObject(task.rows[0].generation_key), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" } });
  }
  catch { return new NextResponse("Not found", { status: 404 }); }
}
