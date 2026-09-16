import { query } from "@/lib/db";
import { getObject } from "@/lib/storage";
import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return new NextResponse("Not found",{status:404});
    const result = await query<{ output_key: string | null }>(`SELECT output_key FROM design_versions WHERE id=$1`, [id]);
    if (!result.rows[0]?.output_key) return new NextResponse("Not found", { status: 404 });
    const download=new URL(request.url).searchParams.get('download')==='1';
    return new NextResponse(await getObject(result.rows[0].output_key), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600", ...(download?{"Content-Disposition":`attachment; filename="design-${id}.png"`}:{}) } });
  } catch { return new NextResponse("Not found", { status: 404 }); }
}
