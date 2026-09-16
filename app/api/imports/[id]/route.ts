import { query } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const batch = await query<{ id: string; original_filename: string; project_name: string | null; suite_name: string | null; status: string; error_message: string | null; created_at: string }>(`SELECT id, original_filename, project_name, suite_name, status, error_message, created_at FROM import_batches WHERE id=$1`, [id]);
    if (!batch.rows[0]) return NextResponse.json({ error: "导入批次不存在" }, { status: 404 });
    const files = await query<{ source_path: string; status: string; error_message: string | null; asset_id: string | null }>(`SELECT source_path, status, error_message, asset_id FROM import_batch_files WHERE batch_id=$1 ORDER BY source_path`, [id]);
    return NextResponse.json({ ...batch.rows[0], files: files.rows });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "读取批次失败" }, { status: 503 }); }
}
