import type { PoolClient } from "pg";
import { query, transaction } from "./db";
import { removeObject } from "./storage";
import type { ArchiveAsset } from "./archive-types";

type AssetRow = {
  id: string; filename: string; display_name: string | null; material_type: string; grade: string | null; subject: string | null;
  colors: string[]; tags: string[]; visual_style: string | null; layout_features: string | null;
  core_elements: string[]; ocr_text: string | null; description: string | null; review_state: string;
  reuse_state: string; confidence: number | null; analysis_status: string; embedding_status: string; error_message: string | null;
  suite_id: string | null; suite_name: string | null; project_id: string | null; project_name: string | null;
  primary_asset_id: string | null; preview_key: string | null; active_visual_revision_id:string|null; adaptation_notes:string;
  visual_profile:import('@/visual-rules/v1/index.mjs').VisualProfile|null;
};

const assetSelect = `SELECT a.id, a.filename, a.display_name, a.material_type, a.grade, a.subject, a.colors, a.tags, a.visual_style,
  a.layout_features, a.core_elements, a.ocr_text, a.description, a.review_state, a.reuse_state, a.confidence,
  a.analysis_status, a.embedding_status, a.error_message, a.preview_key, s.id AS suite_id, s.name AS suite_name, s.primary_asset_id,
  a.active_visual_revision_id,a.adaptation_notes,r.confirmed AS visual_profile,p.id AS project_id, p.name AS project_name FROM assets a
  LEFT JOIN visual_suites s ON s.id = a.suite_id LEFT JOIN projects p ON p.id = s.project_id
  LEFT JOIN visual_revisions r ON r.id=a.active_visual_revision_id`;

function mapAsset(row: AssetRow): ArchiveAsset {
  return {
    id: row.id, filename: row.filename, displayName: row.display_name || row.filename, projectId: row.project_id, projectName: row.project_name,
    suiteId: row.suite_id, suiteName: row.suite_name, materialType: row.material_type, grade: row.grade,
    subject: row.subject, colors: row.colors ?? [], tags: row.tags ?? [], visualStyle: row.visual_style,
    layoutFeatures: row.layout_features, coreElements: row.core_elements ?? [], ocrText: row.ocr_text,
    description: row.description, reviewState: row.review_state, reuseState: row.reuse_state,
    confidence: row.confidence, analysisStatus: row.analysis_status, embeddingStatus: row.embedding_status, errorMessage: row.error_message,
    isPrimary: row.primary_asset_id === row.id, previewUrl: row.preview_key ? `/api/assets/${row.id}/preview` : null,
    visualRevisionId:row.active_visual_revision_id,visualProfile:row.visual_profile, adaptationNotes:row.adaptation_notes,
  };
}

export async function listAssets(options: { reviewState?: string; projectId?: string } = {}) {
  const conditions: string[] = []; const values: string[] = [];
  if (options.reviewState) { values.push(options.reviewState); conditions.push(`a.review_state = $${values.length}`); }
  if (options.projectId) { values.push(options.projectId); conditions.push(`p.id = $${values.length}`); }
  const result = await query<AssetRow>(`${assetSelect} ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY a.created_at DESC`, values);
  return result.rows.map(mapAsset);
}

export async function getAsset(id: string) {
  const result = await query<AssetRow>(`${assetSelect} WHERE a.id = $1`, [id]);
  return result.rows[0] ? mapAsset(result.rows[0]) : null;
}

export async function listProjects() {
  const assets = await listAssets();
  const groups = new Map<string, { id: string; name: string; suites: Map<string, { id: string; name: string; assets: ArchiveAsset[] }> }>();
  for (const asset of assets) {
    if (!asset.projectId || !asset.projectName || !asset.suiteId || !asset.suiteName) continue;
    let project = groups.get(asset.projectId);
    if (!project) { project = { id: asset.projectId, name: asset.projectName, suites: new Map() }; groups.set(asset.projectId, project); }
    let suite = project.suites.get(asset.suiteId);
    if (!suite) { suite = { id: asset.suiteId, name: asset.suiteName, assets: [] }; project.suites.set(asset.suiteId, suite); }
    suite.assets.push(asset);
  }
  return [...groups.values()].map((project) => ({ ...project, suites: [...project.suites.values()] }));
}

async function upsertSuite(client: PoolClient, projectName: string, suiteName: string) {
  const project = await client.query<{ id: string }>(
    `INSERT INTO projects (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [projectName.trim()],
  );
  const suite = await client.query<{ id: string }>(
    `INSERT INTO visual_suites (project_id, name) VALUES ($1, $2)
     ON CONFLICT (project_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [project.rows[0].id, suiteName.trim()],
  );
  return suite.rows[0].id;
}

async function enqueue(client: PoolClient, jobType: "ANALYZE_ASSET" | "EMBED_ASSET", assetId: string) {
  await client.query(
    `INSERT INTO jobs (job_type, dedupe_key, payload, status, attempts, error_message, started_at, completed_at, updated_at)
     VALUES ($1, $2, jsonb_build_object('assetId', $3::uuid), 'QUEUED', 0, NULL, NULL, NULL, NOW())
     ON CONFLICT (dedupe_key) DO UPDATE SET status = 'QUEUED', attempts = 0, error_message = NULL, started_at = NULL, completed_at = NULL, updated_at = NOW()`,
    [jobType, `${jobType}:${assetId}`, assetId],
  );
}

export async function enqueueEmbeddingsForSuite(client: PoolClient, suiteId: string) {
  await client.query(`UPDATE jobs j SET status='QUEUED',attempts=0,error_message=NULL FROM visual_revisions r JOIN assets a ON a.target_visual_revision_id=r.id
    WHERE a.suite_id=$1 AND r.confirmed IS NOT NULL AND r.status='WAITING_ELIGIBILITY' AND j.dedupe_key='EMBED_VISUAL:'||r.id::text`,[suiteId]);
  const eligible = await client.query<{ id: string }>(
    `SELECT a.id FROM assets a JOIN visual_suites s ON s.id = a.suite_id JOIN assets primary_asset ON primary_asset.id = s.primary_asset_id
     WHERE a.suite_id = $1 AND a.review_state = 'CONFIRMED' AND a.reuse_state <> 'NOT_REUSABLE' AND a.preview_key IS NOT NULL
       AND a.embedding_status NOT IN ('READY', 'PROCESSING', 'PROCESSING_TEXT', 'PROCESSING_IMAGE')
       AND EXISTS(SELECT 1 FROM visual_revisions r WHERE r.id=a.target_visual_revision_id AND r.confirmed IS NOT NULL)
       AND primary_asset.review_state = 'CONFIRMED' AND primary_asset.reuse_state <> 'NOT_REUSABLE'`, [suiteId],
  );
  for (const asset of eligible.rows) {
    await client.query(`UPDATE assets SET embedding_status='QUEUED', error_message=NULL WHERE id=$1`, [asset.id]);
    await enqueue(client, "EMBED_ASSET", asset.id);
  }
}

export type ReviewInput = {
  adaptationNotes?:string;
  displayName?: string | null; projectName: string; suiteName: string; materialType: string; grade?: string | null; subject?: string | null;
  colors: string[]; tags: string[]; visualStyle?: string | null; layoutFeatures?: string | null;
  coreElements: string[]; ocrText?: string | null; description?: string | null; reuseState?: string; isPrimary: boolean;
};

export async function reviewAsset(id: string, input: ReviewInput) {
  return transaction(client=>reviewAssetInTransaction(client,id,input));
}
export async function reviewAssetInTransaction(client:PoolClient,id:string,input:ReviewInput){
  // This curated library contains reusable references; confirmation is still explicit.
  input = { ...input, reuseState: 'REUSABLE' };
  if (!input.projectName.trim() || !input.suiteName.trim()) throw new Error("项目与套系名称不能为空");
    const before = await client.query(`SELECT * FROM assets WHERE id = $1 FOR UPDATE`, [id]);
    if (!before.rows[0]) throw new Error("素材不存在");
    const adaptationNotes=input.adaptationNotes?.trim() || before.rows[0].adaptation_notes || '';
    if(!before.rows[0].preview_key)throw new Error('请先补充预览图，再确认入库');
    await client.query('UPDATE assets SET adaptation_notes=$2 WHERE id=$1',[id,adaptationNotes]);
    const suiteId = await upsertSuite(client, input.projectName, input.suiteName);
    await client.query(
      `UPDATE assets SET display_name=$2, suite_id=$3, material_type=$4, grade=$5, subject=$6, colors=$7, tags=$8, visual_style=$9,
       layout_features=$10, core_elements=$11, ocr_text=$12, description=$13, reuse_state=$14, review_state='CONFIRMED',
       embedding_status=CASE WHEN preview_key IS NULL OR $14 = 'NOT_REUSABLE' THEN 'NOT_READY' WHEN NOT EXISTS(SELECT 1 FROM visual_revisions r WHERE r.id=assets.target_visual_revision_id AND r.confirmed IS NOT NULL) THEN 'WAITING_VISUAL' ELSE 'QUEUED' END,
       error_message=NULL, updated_at=NOW() WHERE id=$1`,
      [id, input.displayName?.trim() || before.rows[0].filename, suiteId, input.materialType, input.grade || null, input.subject || null,
        input.colors, input.tags, input.visualStyle || null, input.layoutFeatures || null, input.coreElements, input.ocrText || null,
        input.description || null, input.reuseState],
    );
    if (input.isPrimary) await client.query(`UPDATE visual_suites SET primary_asset_id=$2 WHERE id=$1`, [suiteId, id]);
    else await client.query(`UPDATE visual_suites SET primary_asset_id=NULL WHERE id=$1 AND primary_asset_id=$2`, [suiteId, id]);
    await client.query(`INSERT INTO reviews (asset_id, actor, before_state, after_state) VALUES ($1, 'local-admin', $2, $3)`, [id, JSON.stringify(before.rows[0]), JSON.stringify(input)]);
    await enqueueEmbeddingsForSuite(client, suiteId);
    const refreshed = await client.query<AssetRow>(`${assetSelect} WHERE a.id = $1`, [id]);
    const asset = mapAsset(refreshed.rows[0]);
    const suite = (await client.query('SELECT primary_asset_id FROM visual_suites WHERE id=$1',[suiteId])).rows[0];
    const remaining = [];
    if(asset.embeddingStatus==='WAITING_VISUAL')remaining.push('在上方「视觉规则审核」确认这张图的视觉字段');
    if(!suite.primary_asset_id)remaining.push('为该套系指定一张主参考图');
    return { ...asset, reviewMessage: remaining.length ? `「${asset.displayName}」已保存审核。下一步：${remaining.join('；')}。完成后自动向量化。` : `「${asset.displayName}」已确认，后台将自动向量化；完成后显示「已确认 · 可检索」。` };
}

export async function requeueBatch(id: string) {
  return transaction(async (client) => {
    const batch = await client.query<{ id: string }>(`UPDATE import_batches SET status='PROCESSING', error_message=NULL, updated_at=NOW() WHERE id=$1 RETURNING id`, [id]);
    if (!batch.rows[0]) throw new Error("导入批次不存在");

    // Once files have been persisted, retry their failed/pending analysis jobs directly.
    // Re-running IMPORT_BATCH would only classify those same checksums as duplicates.
    const assets = await client.query<{ id: string }>(
      `SELECT DISTINCT a.id FROM import_batch_files f
       JOIN assets a ON a.id = f.asset_id
       WHERE f.batch_id = $1 AND a.preview_key IS NOT NULL AND a.analysis_status <> 'ANALYZED'`,
      [id],
    );
    if (assets.rows.length) {
      await client.query(
        `UPDATE assets SET analysis_status='QUEUED', error_message=NULL, updated_at=NOW()
         WHERE id = ANY($1::uuid[])`,
        [assets.rows.map((asset) => asset.id)],
      );
      for (const asset of assets.rows) await enqueue(client, "ANALYZE_ASSET", asset.id);
      return;
    }

    await client.query(
      `INSERT INTO jobs (job_type, dedupe_key, payload, status, attempts, error_message, started_at, completed_at, updated_at)
       VALUES ('IMPORT_BATCH', $1, jsonb_build_object('batchId', $2::uuid), 'QUEUED', 0, NULL, NULL, NULL, NOW())
       ON CONFLICT (dedupe_key) DO UPDATE SET status='QUEUED', attempts=0, error_message=NULL, started_at=NULL, completed_at=NULL, updated_at=NOW()`,
      [`IMPORT_BATCH:${id}`, id],
    );
  });
}

export async function enqueueAnalysisForAsset(client: PoolClient, assetId: string) { await enqueue(client, "ANALYZE_ASSET", assetId); }

export async function retryAssetAnalysis(assetId: string) {
  return transaction(async (client) => {
    const asset = await client.query<{ id: string }>(
      `UPDATE assets SET analysis_status='QUEUED', error_message=NULL, updated_at=NOW()
       WHERE id=$1 AND preview_key IS NOT NULL AND review_state='PENDING' RETURNING id`,
      [assetId],
    );
    if (!asset.rows[0]) throw new Error("该素材没有可重试的预览图");
    await enqueueAnalysisForAsset(client, assetId);
  });
}

export async function retryAssetEmbedding(assetId: string) {
  return transaction(async (client) => {
    const revision=(await client.query(`SELECT r.id FROM assets a JOIN visual_revisions r ON r.id=a.target_visual_revision_id WHERE a.id=$1 AND a.review_state='CONFIRMED' AND a.reuse_state<>'NOT_REUSABLE' AND r.confirmed IS NOT NULL`,[assetId])).rows[0];
    if(!revision)throw new Error('请先在审核队列确认素材视觉规则');
    await client.query("INSERT INTO jobs(job_type,dedupe_key,payload) VALUES('EMBED_VISUAL',$1,$2::jsonb) ON CONFLICT(dedupe_key) DO UPDATE SET status='QUEUED',attempts=0,error_message=NULL WHERE jobs.status NOT IN ('RUNNING','QUEUED')",[`EMBED_VISUAL:${revision.id}`,JSON.stringify({assetId,revisionId:revision.id})]);
  });
}

export async function renameAsset(assetId: string, displayName: string) {
  const name = displayName.trim();
  if (!name) throw new Error("素材名称不能为空");
  const result = await query(`UPDATE assets SET display_name=$2, updated_at=NOW() WHERE id=$1 RETURNING id`, [assetId, name]);
  if (!result.rows[0]) throw new Error("素材不存在");
}

export async function reopenAssetForReview(assetId: string) {
  return transaction(async (client) => {
    const asset = await client.query<{ id: string; suite_id: string | null; filename: string }>(
      `SELECT id, suite_id, filename FROM assets WHERE id=$1 FOR UPDATE`, [assetId],
    );
    if (!asset.rows[0]) throw new Error("素材不存在");
    const current = asset.rows[0];
    await client.query(`DELETE FROM asset_embeddings WHERE asset_id=$1`, [assetId]);
    await client.query(
      `UPDATE assets SET review_state='PENDING', embedding_status='NOT_READY', error_message=NULL, updated_at=NOW() WHERE id=$1`,
      [assetId],
    );
    if (current.suite_id) {
      await client.query(
        `UPDATE visual_suites SET primary_asset_id=NULL WHERE id=$1 AND primary_asset_id=$2`,
        [current.suite_id, assetId],
      );
    }
  });
}

export async function deleteAssets(assetIds: string[]) {
  const ids = [...new Set(assetIds.filter(Boolean))];
  if (!ids.length) throw new Error("请选择要删除的素材");
  const removed = await transaction(async (client) => {
    const result = await client.query<{ id: string; source_key: string; preview_key: string | null }>(
      `SELECT id, source_key, preview_key FROM assets WHERE id = ANY($1::uuid[]) FOR UPDATE`, [ids],
    );
    if (!result.rows.length) throw new Error("未找到可删除的素材");
    await client.query(`DELETE FROM asset_embeddings WHERE asset_id = ANY($1::uuid[])`, [result.rows.map((row) => row.id)]);
    await client.query(`DELETE FROM assets WHERE id = ANY($1::uuid[])`, [result.rows.map((row) => row.id)]);
    await client.query(`DELETE FROM visual_suites s WHERE NOT EXISTS (SELECT 1 FROM assets a WHERE a.suite_id = s.id)`);
    await client.query(`DELETE FROM projects p WHERE NOT EXISTS (SELECT 1 FROM visual_suites s WHERE s.project_id = p.id)`);
    return result.rows;
  });
  await Promise.allSettled(removed.flatMap((row) => [removeObject(row.source_key), row.preview_key ? removeObject(row.preview_key) : Promise.resolve()]));
  return { deleted: removed.length };
}
