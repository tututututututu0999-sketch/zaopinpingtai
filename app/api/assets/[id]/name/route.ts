import { renameAsset } from "@/lib/archive";
import { NextResponse } from "next/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { displayName } = await request.json() as { displayName?: string };
    await renameAsset((await params).id, displayName ?? "");
    return NextResponse.json({ status: "RENAMED" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "重命名失败" }, { status: 400 });
  }
}
