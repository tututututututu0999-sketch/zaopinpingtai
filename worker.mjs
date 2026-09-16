import crypto from "node:crypto";
import { Client as MinioClient } from "minio";
import pg from "pg";
import sharp from "sharp";
import unzipper from "unzipper";
import {migrate} from './scripts/migrate.mjs';
import {inferMaterialType} from './visual-rules/asset-filename.mjs';
import {RULE_VERSION} from './visual-rules/v1/index.mjs';
import {analyseVisual,embedVisual} from './visual-rules/v1/worker.mjs';

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const endpoint = new URL(process.env.S3_ENDPOINT);
const bucket = process.env.S3_BUCKET || "visual-assets";
const pool = new Pool({ connectionString: databaseUrl, max: 4 });
const store = new MinioClient({ endPoint: endpoint.hostname, port: endpoint.port ? Number(endpoint.port) : endpoint.protocol === "https:" ? 443 : 80, useSSL: endpoint.protocol === "https:", accessKey: process.env.S3_ACCESS_KEY || "", secretKey: process.env.S3_SECRET_KEY || "" });
const previewExtensions = new Map([[".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".webp", "image/webp"]]);
const materialTypes = new Set(["BOOK_COVER", "TITLE_PAGE", "GIFT_BOX", "PRODUCT_BOOKLET", "WALL_CHART", "OTHER"]);

function extension(filename) { const index = filename.lastIndexOf("."); return index < 0 ? "" : filename.slice(index).toLowerCase(); }
function safePath(filename) { return filename && !filename.startsWith("/") && !filename.split("/").includes("..") && !filename.includes("\\"); }
function isSystemArtifact(filename) { const parts = filename.split("/"); const basename = parts.at(-1) || ""; return parts.includes("__MACOSX") || basename === ".DS_Store" || basename.startsWith("._"); }
function contentType(filename) { return previewExtensions.get(extension(filename)) || "application/octet-stream"; }

async function ensureBucket() { if (!(await store.bucketExists(bucket))) await store.makeBucket(bucket); }
async function readObject(key) { const stream = await store.getObject(bucket, key); const chunks = []; for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); return Buffer.concat(chunks); }
async function putObject(key, buffer, type) { await store.putObject(bucket, key, buffer, buffer.length, { "Content-Type": type }); }

async function refreshBatchesForAsset(assetId) {
  const batches = await pool.query(`SELECT DISTINCT batch_id FROM import_batch_files WHERE asset_id=$1`, [assetId]);
  for (const batch of batches.rows) {
    const state = await pool.query(
      `SELECT count(*) FILTER (WHERE a.analysis_status IN ('QUEUED','PROCESSING'))::int AS active,
              count(*) FILTER (WHERE a.analysis_status='FAILED')::int AS failed
       FROM import_batch_files f JOIN assets a ON a.id=f.asset_id WHERE f.batch_id=$1`, [batch.batch_id],
    );
    const row = state.rows[0];
    await pool.query(`UPDATE import_batches SET status=$2, updated_at=NOW() WHERE id=$1`, [batch.batch_id, Number(row.active) > 0 ? "PROCESSING" : "AWAITING_REVIEW"]);
  }
}

async function waitForBucket() {
  let lastError;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await ensureBucket();
      return;
    } catch (error) {
      lastError = error;
      console.error(`对象存储尚未就绪，${attempt}/30 次重试`, error instanceof Error ? error.message : error);
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("对象存储未就绪");
}

async function enqueue(client, type, key, payload) {
  await client.query(
    `INSERT INTO jobs (job_type, dedupe_key, payload) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (dedupe_key) DO UPDATE SET status='QUEUED', attempts=0, error_message=NULL, started_at=NULL, completed_at=NULL, payload=EXCLUDED.payload, updated_at=NOW()`,
    [type, key, JSON.stringify(payload)],
  );
}

async function claimJob() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const claimed = await client.query(
      `WITH candidate AS (SELECT id FROM jobs WHERE status='QUEUED' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
       UPDATE jobs SET status='RUNNING', attempts=attempts+1, started_at=NOW(), updated_at=NOW()
       WHERE id IN (SELECT id FROM candidate) RETURNING id, job_type, payload, attempts`,
    );
    await client.query("COMMIT");
    return claimed.rows[0] || null;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

async function finishJob(id) { await pool.query(`UPDATE jobs SET status='COMPLETED', completed_at=NOW(), updated_at=NOW() WHERE id=$1`, [id]); }
async function failJob(job, error) {
  const message = error instanceof Error ? error.message.slice(0, 1000) : "未知 worker 错误";
  const status = job.attempts >= 3 ? "FAILED" : "QUEUED";
  if(job.payload.revisionId)await pool.query("UPDATE visual_revisions SET status=$2,error_message=$3,updated_at=now() WHERE id=$1",[job.payload.revisionId,status==='FAILED'?'FAILED':'QUEUED',message]);
  await pool.query(`UPDATE jobs SET status=$2, error_message=$3, updated_at=NOW() WHERE id=$1`, [job.id, status, message]);
}

async function importBatch(batchId) {
  const batch = await pool.query(`SELECT archive_key, project_name, suite_name FROM import_batches WHERE id=$1`, [batchId]);
  if (!batch.rows[0]) throw new Error("导入批次不存在");
  await pool.query(`UPDATE import_batches SET status='PROCESSING', error_message=NULL, updated_at=NOW() WHERE id=$1`, [batchId]);
  let suiteId = null;
  if (batch.rows[0].project_name && batch.rows[0].suite_name) {
    const project = await pool.query(
      `INSERT INTO projects (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [batch.rows[0].project_name],
    );
    const suite = await pool.query(
      `INSERT INTO visual_suites (project_id, name) VALUES ($1,$2)
       ON CONFLICT (project_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [project.rows[0].id, batch.rows[0].suite_name],
    );
    suiteId = suite.rows[0].id;
  }
  const archive = await unzipper.Open.buffer(await readObject(batch.rows[0].archive_key));
  const files = archive.files.filter((entry) => entry.type === "File" && !isSystemArtifact(entry.path));
  const maxFiles = Number(process.env.MAX_IMPORT_FILES || 2000);
  if (files.length > maxFiles) throw new Error(`压缩包文件数超过 ${maxFiles} 上限`);
  for (const entry of files) {
    if (!safePath(entry.path)) {
      await pool.query(`INSERT INTO import_batch_files (batch_id, source_path, status, error_message) VALUES ($1,$2,'REJECTED','压缩包含不安全路径') ON CONFLICT (batch_id,source_path) DO NOTHING`, [batchId, entry.path]);
      continue;
    }
    const raw = await entry.buffer(); const checksum = crypto.createHash("sha256").update(raw).digest("hex");
    const known = await pool.query(`SELECT id FROM assets WHERE checksum=$1`, [checksum]);
    if (known.rows[0]) {
      await pool.query(`INSERT INTO import_batch_files (batch_id,source_path,checksum,asset_id,status) VALUES ($1,$2,$3,$4,'DUPLICATE') ON CONFLICT (batch_id,source_path) DO UPDATE SET status='DUPLICATE', asset_id=EXCLUDED.asset_id`, [batchId, entry.path, checksum, known.rows[0].id]);
      continue;
    }
    const originalKey = `original/${checksum}/${encodeURIComponent(entry.path)}`;
    await putObject(originalKey, raw, contentType(entry.path));
    let previewKey = null; let analysisStatus = "PREVIEW_MISSING"; let fileStatus = "PREVIEW_MISSING";
    if (previewExtensions.has(extension(entry.path))) {
      try {
        const preview = await sharp(raw).rotate().resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
        previewKey = `preview/${checksum}.jpg`; await putObject(previewKey, preview, "image/jpeg");
        analysisStatus = "QUEUED"; fileStatus = "QUEUED";
      } catch (error) { fileStatus = "PREVIEW_FAILED"; analysisStatus = "PREVIEW_FAILED"; }
    }
    const inserted = await pool.query(
      `INSERT INTO assets (checksum, filename, display_name, source_key, preview_key, mime_type, suite_id, analysis_status, material_type, reuse_state)
       VALUES ($1,$2,$2,$3,$4,$5,$6,$7,$8,'REUSABLE')
       ON CONFLICT (checksum) DO UPDATE SET filename=EXCLUDED.filename, display_name=COALESCE(assets.display_name, EXCLUDED.display_name)
       RETURNING id`,
      [checksum, entry.path.split("/").pop(), originalKey, previewKey, contentType(entry.path), suiteId, analysisStatus, inferMaterialType(entry.path)],
    );
    const assetId = inserted.rows[0].id;
    await pool.query(`INSERT INTO import_batch_files (batch_id,source_path,checksum,asset_id,status) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (batch_id,source_path) DO UPDATE SET asset_id=EXCLUDED.asset_id,status=EXCLUDED.status`, [batchId, entry.path, checksum, assetId, fileStatus]);
    if (previewKey) await enqueue(pool, "ANALYZE_ASSET", `ANALYZE_ASSET:${assetId}`, { assetId, batchId });
  }
  await pool.query(`UPDATE import_batches SET status='AWAITING_REVIEW', updated_at=NOW() WHERE id=$1`, [batchId]);
}

async function chatJson(model, messages) {
  const configured = process.env.AI_GATEWAY_BASE_URL?.replace(/\/$/, ""); const key = process.env.AI_GATEWAY_API_KEY;
  if (!configured || !key) throw new Error("AI 网关未配置");
  const base = configured.endsWith("/v1") ? configured : `${configured}/v1`;
  const response = await fetch(`${base}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model, temperature: 0.1, response_format: { type: "json_object" }, messages }), signal: AbortSignal.timeout(90_000) });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 500);
    throw new Error(`Luna 图像识别返回 ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  const payload = await response.json(); const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Luna 图像识别没有返回内容");
  const normalized = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""); const start = normalized.indexOf("{"); const end = normalized.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Luna 图像识别返回不是 JSON");
  return JSON.parse(normalized.slice(start, end + 1));
}

async function visionJson(model, input) {
  const configured = process.env.AI_GATEWAY_BASE_URL?.replace(/\/$/, ""); const key = process.env.AI_GATEWAY_API_KEY;
  if (!configured || !key) throw new Error("AI 网关未配置");
  const base = configured.endsWith("/v1") ? configured : `${configured}/v1`;
  const response = await fetch(`${base}/responses`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model, text: { format: { type: "json_object" } }, input }), signal: AbortSignal.timeout(90_000) });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 500);
    throw new Error(`Luna 图像识别返回 ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  const payload = await response.json();
  const content = payload.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  if (!content) throw new Error("Luna 图像识别没有返回内容");
  const normalized = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""); const start = normalized.indexOf("{"); const end = normalized.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Luna 图像识别返回不是 JSON");
  return JSON.parse(normalized.slice(start, end + 1));
}

function normaliseAnalysis(input) {
  const materialType = materialTypes.has(input.materialType) ? input.materialType : "OTHER";
  const reuseState = "REUSABLE";
  if (!input.projectName || !input.suiteName || !input.description) throw new Error("视觉模型识别结果缺少项目、套系或描述");
  return { projectName: String(input.projectName).slice(0, 120), suiteName: String(input.suiteName).slice(0, 120), productLine: input.productLine ? String(input.productLine).slice(0, 120) : null, materialType, grade: input.grade ? String(input.grade).slice(0, 60) : null, subject: input.subject ? String(input.subject).slice(0, 60) : null, colors: Array.isArray(input.colors) ? input.colors.map(String).slice(0, 12) : [], tags: Array.isArray(input.tags) ? input.tags.map(String).slice(0, 20) : [], visualStyle: input.visualStyle ? String(input.visualStyle).slice(0, 240) : null, layoutFeatures: input.layoutFeatures ? String(input.layoutFeatures).slice(0, 500) : null, coreElements: Array.isArray(input.coreElements) ? input.coreElements.map(String).slice(0, 20) : [], ocrText: input.ocrText ? String(input.ocrText).slice(0, 4000) : null, description: String(input.description).slice(0, 4000), reuseState, confidence: Math.max(0, Math.min(1, Number(input.confidence) || 0)) };
}

async function analyseAsset(assetId) {
  const result = await pool.query(`SELECT id, filename, preview_key, suite_id,review_state FROM assets WHERE id=$1`, [assetId]); const asset = result.rows[0];
  if (!asset?.preview_key) throw new Error("素材没有可识别预览图");
  if(asset.review_state==='CONFIRMED')throw new Error('已确认素材请使用视觉规则升级，不覆盖人工字段');
  const preview = await readObject(asset.preview_key);
  // Keep the stored preview suitable for review/retrieval, but send a bounded
  // rendition to the vision gateway so individual large covers cannot exceed
  // the gateway's inline image request limit.
  const visionPreview = await sharp(preview)
    .resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();
  const analysis = normaliseAnalysis(await visionJson(process.env.VISION_MODEL || process.env.LUNA_MODEL || "gpt-5.6-luna", [
    { role: "system", content: [{ type: "input_text", text: "你是教育产品视觉资产识别器。只返回严格 JSON：projectName、suiteName、productLine、materialType(BOOK_COVER/TITLE_PAGE/GIFT_BOX/PRODUCT_BOOKLET/WALL_CHART/OTHER)、grade、subject、colors(string[])、tags(string[])、visualStyle、layoutFeatures、coreElements(string[])、ocrText、description、confidence(0-1)。不得把未看到的信息当事实。" }] },
    { role: "user", content: [{ type: "input_text", text: "识别这张教育产品设计素材，并给出候选项目与视觉套系。" }, { type: "input_image", image_url: `data:image/jpeg;base64,${visionPreview.toString("base64")}` }] },
  ]));
  analysis.materialType = inferMaterialType(asset.filename, analysis.materialType);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let suiteId = asset.suite_id;
    const current=(await client.query('SELECT review_state FROM assets WHERE id=$1 FOR UPDATE',[assetId])).rows[0];
    if(current?.review_state!=='PENDING'){await client.query('ROLLBACK');return;}
    if (!suiteId) {
      const project = await client.query(`INSERT INTO projects (name, product_line) VALUES ($1,$2) ON CONFLICT (name) DO UPDATE SET product_line=COALESCE(EXCLUDED.product_line, projects.product_line) RETURNING id`, [analysis.projectName, analysis.productLine]);
      const suite = await client.query(`INSERT INTO visual_suites (project_id,name) VALUES ($1,$2) ON CONFLICT (project_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING id`, [project.rows[0].id, analysis.suiteName]);
      suiteId = suite.rows[0].id;
    }
    await client.query(`UPDATE assets SET suite_id=$2, material_type=$3, grade=$4, subject=$5, colors=$6, tags=$7, visual_style=$8, layout_features=$9, core_elements=$10, ocr_text=$11, description=$12, reuse_state=$13, confidence=$14, analysis_json=$15::jsonb, analysis_status='ANALYZED', error_message=NULL, updated_at=NOW() WHERE id=$1`, [assetId, suiteId, analysis.materialType, analysis.grade, analysis.subject, analysis.colors, analysis.tags, analysis.visualStyle, analysis.layoutFeatures, analysis.coreElements, analysis.ocrText, analysis.description, analysis.reuseState, analysis.confidence, JSON.stringify(analysis)]);
    await client.query(`UPDATE import_batch_files SET status='PENDING_REVIEW' WHERE asset_id=$1 AND status='QUEUED'`, [assetId]);
    const revision=(await client.query('INSERT INTO visual_revisions(asset_id,rule_version) VALUES($1,$2) RETURNING id',[assetId,RULE_VERSION])).rows[0];
    await client.query('UPDATE assets SET target_visual_revision_id=$2 WHERE id=$1',[assetId,revision.id]);
    await enqueue(client,'ANALYZE_VISUAL',`ANALYZE_VISUAL:${revision.id}`,{assetId,revisionId:revision.id});
    await client.query("COMMIT");
    await refreshBatchesForAsset(assetId);
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

async function embed(type, content) {
  const base = process.env.EMBEDDING_SERVICE_URL?.replace(/\/$/, ""); if (!base) throw new Error("Embedding 服务未配置");
  const response = await fetch(`${base}/embed`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, content }), signal: AbortSignal.timeout(type === "image" ? 15 * 60_000 : 2 * 60_000) });
  if (!response.ok) throw new Error(`Embedding 服务返回 ${response.status}`); const payload = await response.json();
  if (!Array.isArray(payload.embedding) || payload.embedding.length !== 1024) throw new Error("Embedding 向量不是 1024 维");
  return payload.embedding;
}

async function embedAsset(assetId) {
  const revision=(await pool.query('SELECT target_visual_revision_id FROM assets WHERE id=$1',[assetId])).rows[0];
  if(revision?.target_visual_revision_id)return embedVisual(pool,readObject,embed,revision.target_visual_revision_id);
  throw new Error('请先识别并确认视觉规则，再发布向量');
}

async function work(job) {
  if(job.job_type==='ANALYZE_VISUAL')return analyseVisual(pool,readObject,visionJson,job.payload.revisionId);
  if(job.job_type==='EMBED_VISUAL')return embedVisual(pool,readObject,embed,job.payload.revisionId);
  if (job.job_type === "IMPORT_BATCH") return importBatch(job.payload.batchId);
  if (job.job_type === "ANALYZE_ASSET") return analyseAsset(job.payload.assetId);
  if (job.job_type === "EMBED_ASSET") return embedAsset(job.payload.assetId);
  throw new Error(`未知任务类型：${job.job_type}`);
}

let workerBusy = false;

async function tick() {
  if (workerBusy) return;
  workerBusy = true;
  try {
    const job = await claimJob(); if (!job) return;
    try { await work(job); await finishJob(job.id); }
    catch (error) { if (job.job_type === "IMPORT_BATCH") await pool.query(`UPDATE import_batches SET status='FAILED', error_message=$2, updated_at=NOW() WHERE id=$1`, [job.payload.batchId, error instanceof Error ? error.message : "导入失败"]); if (job.job_type === "ANALYZE_ASSET") { await pool.query(`UPDATE assets SET analysis_status='FAILED', error_message=$2 WHERE id=$1`, [job.payload.assetId, error instanceof Error ? error.message : "识别失败"]); await refreshBatchesForAsset(job.payload.assetId); } if (job.job_type === "EMBED_ASSET") await pool.query(`UPDATE assets SET embedding_status='FAILED', error_message=$2 WHERE id=$1`, [job.payload.assetId, error instanceof Error ? error.message : "向量化失败"]); await failJob(job, error); }
  } finally {
    workerBusy = false;
  }
}

await migrate(pool);
await waitForBucket();
// This deployment runs one worker; interrupted work resumes immediately on restart.
await pool.query(`UPDATE jobs SET status='QUEUED', started_at=NULL, updated_at=NOW() WHERE status='RUNNING'`);
await pool.query(`UPDATE assets a SET embedding_status='QUEUED' FROM jobs j WHERE j.dedupe_key='EMBED_ASSET:' || a.id::text AND j.status='QUEUED'`);
setInterval(() => { tick().catch((error) => console.error("worker tick failed", error)); }, 800);
tick().catch((error) => console.error("worker startup failed", error));
