import { reopenAssetForReview } from "@/lib/archive";
import { NextResponse } from "next/server";

export async function PATCH(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await reopenAssetForReview(id);
    return NextResponse.json({ status: "PENDING_REVIEW" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "重新审核失败" }, { status: 503 });
  }
}
