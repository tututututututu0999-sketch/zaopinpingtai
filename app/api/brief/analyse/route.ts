import { analyseDraft } from "@/lib/brief-drafts";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    return NextResponse.json(await analyseDraft(await request.json()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "需求分析失败" }, { status: 502 });
  }
}
