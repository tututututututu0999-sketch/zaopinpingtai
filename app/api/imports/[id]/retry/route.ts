import { requeueBatch } from "@/lib/archive";
import { NextResponse } from "next/server";

async function retry(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await requeueBatch((await params).id); return NextResponse.json({ status: "PROCESSING" }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "重试失败" }, { status: 404 }); }
}

export const POST = retry;
export const GET = retry;
