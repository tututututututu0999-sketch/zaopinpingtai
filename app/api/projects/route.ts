import { listProjects } from "@/lib/archive";
import { NextResponse } from "next/server";

export async function GET() {
  try { return NextResponse.json(await listProjects()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "读取项目失败" }, { status: 503 }); }
}
