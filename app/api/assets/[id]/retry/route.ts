import { retryAssetAnalysis } from "@/lib/archive";
import { NextResponse } from "next/server";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await retryAssetAnalysis((await params).id);
    return NextResponse.json({ status: "QUEUED" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "重试识别失败" }, { status: 400 });
  }
}
