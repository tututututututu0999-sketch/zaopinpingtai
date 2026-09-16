import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const separator = "\u001f";
const sql = `
  SELECT
    a.id,
    p.name,
    s.name,
    a.filename,
    COALESCE(a.display_name, a.filename),
    a.material_type,
    COALESCE(a.grade, ''),
    COALESCE(a.subject, ''),
    array_to_string(a.colors, '、'),
    array_to_string(a.tags, '、'),
    COALESCE(a.visual_style, ''),
    COALESCE(a.layout_features, ''),
    array_to_string(a.core_elements, '、'),
    COALESCE(a.ocr_text, ''),
    COALESCE(a.description, ''),
    a.review_state,
    a.reuse_state,
    a.embedding_status,
    e.model_name,
    e.updated_at::text,
    e.text_embedding::text,
    e.image_embedding::text
  FROM asset_embeddings e
  JOIN assets a ON a.id = e.asset_id
  JOIN visual_suites s ON s.id = a.suite_id
  JOIN projects p ON p.id = s.project_id
  WHERE a.review_state = 'CONFIRMED'
    AND a.reuse_state <> 'NOT_REUSABLE'
    AND a.embedding_status = 'READY'
  ORDER BY p.name, s.name, a.filename;
`;

function escapeMarkdown(value) {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

const output = execFileSync(
  "docker",
  ["compose", "exec", "-T", "postgres", "psql", "-U", "visual", "-d", "visual_archive", "-At", "-F", separator, "-c", sql],
  { cwd: process.cwd(), encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
);

const rows = output.trim().split("\n").filter(Boolean).map((line) => line.split(separator));
const generatedAt = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
const lines = [
  "# 视觉套系库向量数据库导出",
  "",
  `- 导出时间：${generatedAt}（Asia/Shanghai）`,
  "- 范围：已确认、可复用且已完成索引的素材。",
  "- 向量模型：`jinaai/jina-clip-v2`。每条记录包含 1024 维文本向量和 1024 维预览图向量。",
  `- 记录数：${rows.length}`,
  "",
  "## 索引清单",
  "",
  "| 项目 | 套系 | 素材 | 物料类型 | 年级/学科 | 标签 | 状态 | 模型 |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map((row) => `| ${escapeMarkdown(row[1])} | ${escapeMarkdown(row[2])} | ${escapeMarkdown(row[4])} | ${escapeMarkdown(row[5])} | ${escapeMarkdown([row[6], row[7]].filter(Boolean).join(" · "))} | ${escapeMarkdown(row[9])} | ${escapeMarkdown(row[17])} | ${escapeMarkdown(row[18])} |`),
  "",
  "## 完整向量记录",
  "",
];

for (const row of rows) {
  const [id, project, suite, filename, displayName, materialType, grade, subject, colors, tags, visualStyle, layoutFeatures, coreElements, ocrText, description, reviewState, reuseState, embeddingStatus, model, indexedAt, textEmbedding, imageEmbedding] = row;
  lines.push(
    `### ${displayName}`,
    "",
    `- Asset ID：\`${id}\``,
    `- 来源文件：\`${filename}\``,
    `- 项目 / 套系：${project} / ${suite}`,
    `- 物料类型：${materialType}`,
    `- 年级 / 学科：${[grade, subject].filter(Boolean).join(" · ") || "未标注"}`,
    `- 色彩：${colors || "未标注"}`,
    `- 标签：${tags || "未标注"}`,
    `- 视觉风格：${visualStyle || "未标注"}`,
    `- 版式特征：${layoutFeatures || "未标注"}`,
    `- 核心元素：${coreElements || "未标注"}`,
    `- OCR：${ocrText || "未识别"}`,
    `- 设计描述：${description || "未标注"}`,
    `- 审核 / 复用 / 索引：${reviewState} / ${reuseState} / ${embeddingStatus}`,
    `- 索引模型 / 更新时间：${model} / ${indexedAt}`,
    "",
    "#### 文本向量（1024 维）",
    "",
    "```text",
    textEmbedding,
    "```",
    "",
    "#### 预览图向量（1024 维）",
    "",
    "```text",
    imageEmbedding,
    "```",
    "",
  );
}

const outputDirectory = resolve(process.cwd(), "exports");
mkdirSync(outputDirectory, { recursive: true });
const outputPath = resolve(outputDirectory, "visual-suite-vector-database.md");
writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
console.log(outputPath);
