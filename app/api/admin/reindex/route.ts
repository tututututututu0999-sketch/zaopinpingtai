import { transaction } from "@/lib/db";
import { enqueueEmbeddingsForSuite } from "@/lib/archive";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const count = await transaction(async (client) => {
      const suites = await client.query<{ id: string }>(
        `SELECT DISTINCT suite_id AS id FROM assets
         WHERE suite_id IS NOT NULL AND review_state='CONFIRMED' AND reuse_state <> 'NOT_REUSABLE' AND preview_key IS NOT NULL`,
      );
      for (const suite of suites.rows) await enqueueEmbeddingsForSuite(client, suite.id);
      return suites.rows.length;
    });
    return NextResponse.json({ status: "QUEUED", suites: count });
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "重建索引失败" }, { status: 502 }); }
}
