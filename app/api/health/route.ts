import { databaseHealthy } from "@/lib/db";
import { objectStoreHealthy } from "@/lib/storage";
import { NextResponse } from "next/server";

export async function GET() {
  const checks = await Promise.allSettled([databaseHealthy(), objectStoreHealthy(), fetch(`${process.env.EMBEDDING_SERVICE_URL?.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(3_000) })]);
  const healthy = checks.every((entry) => entry.status === "fulfilled" && (entry.value instanceof Response ? entry.value.ok : true));
  return NextResponse.json({ status: healthy ? "ok" : "degraded", dependencies: checks.map((entry) => entry.status === "fulfilled" ? "ok" : "unavailable") }, { status: healthy ? 200 : 503 });
}
