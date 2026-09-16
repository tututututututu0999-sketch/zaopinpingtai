import { deleteAssets, listAssets } from "@/lib/archive";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    return NextResponse.json(await listAssets({ reviewState: searchParams.get("reviewState") ?? undefined, projectId: searchParams.get("projectId") ?? undefined }));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "读取素材失败" }, { status: 503 }); }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as { ids?: unknown };
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    return NextResponse.json(await deleteAssets(ids));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "删除素材失败" }, { status: 400 }); }
}
