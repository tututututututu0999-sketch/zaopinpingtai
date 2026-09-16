import { query, transaction } from "@/lib/db";
import { ensureBucket, putObject } from "@/lib/storage";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const archive = form.get("archive");
    const projectInput = String(form.get("projectName") ?? "").trim();
    const suiteInput = String(form.get("suiteName") ?? "").trim();
    if (!(archive instanceof File) || !archive.name.toLowerCase().endsWith(".zip")) return NextResponse.json({ error: "请上传 ZIP 压缩包" }, { status: 400 });
    // One uploaded ZIP is one visual suite. Its filename is the project name
    // unless an API caller intentionally supplies an override.
    const derivedName = archive.name.replace(/\.zip$/i, "").replace(/[-_]+/g, " ").trim();
    const projectName = projectInput || derivedName;
    const suiteName = suiteInput || projectName;
    if (!projectName) return NextResponse.json({ error: "无法从压缩包名称识别项目名称" }, { status: 400 });
    const maximum = Number(process.env.MAX_IMPORT_BYTES ?? 262_144_000);
    if (!Number.isFinite(maximum) || archive.size > maximum) return NextResponse.json({ error: `压缩包不能超过 ${Math.floor(maximum / 1024 / 1024)} MB` }, { status: 413 });
    const id = crypto.randomUUID(); const archiveKey = `imports/${id}/source.zip`;
    await ensureBucket();
    await putObject(archiveKey, Buffer.from(await archive.arrayBuffer()), "application/zip");
    await transaction(async (client) => {
      await client.query(`INSERT INTO import_batches (id, archive_key, original_filename, project_name, suite_name, status) VALUES ($1, $2, $3, $4, $5, 'QUEUED')`, [id, archiveKey, archive.name, projectName, suiteName]);
      await client.query(`INSERT INTO jobs (job_type, dedupe_key, payload) VALUES ('IMPORT_BATCH', $1, jsonb_build_object('batchId', $2::uuid))`, [`IMPORT_BATCH:${id}`, id]);
    });
    return NextResponse.json({ batchId: id, status: "QUEUED" }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "创建导入批次失败" }, { status: 503 });
  }
}

export async function GET() {
  try {
    const result = await query<{ id: string; original_filename: string; project_name: string | null; suite_name: string | null; status: string; error_message: string | null; created_at: string; total: string; pending: string; failed: string }>(
      `SELECT b.id, b.original_filename, b.project_name, b.suite_name, b.status, b.error_message, b.created_at,
       count(f.id)::text AS total, count(*) FILTER (WHERE f.status = 'PENDING_REVIEW')::text AS pending,
       count(*) FILTER (WHERE f.status LIKE '%FAILED%')::text AS failed
       FROM import_batches b LEFT JOIN import_batch_files f ON f.batch_id = b.id GROUP BY b.id ORDER BY b.created_at DESC`,
    );
    return NextResponse.json(result.rows);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "读取批次失败" }, { status: 503 }); }
}
