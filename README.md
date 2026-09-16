# 视觉资产库

面向教育产品设计资料的项目/视觉套系归档、人工审核与多模态参考检索工具。

## 本地启动

```bash
npm install
npm run dev
```

浏览器访问 `http://localhost:3000`。首页通过 ZIP 导入素材；项目库是唯一的资料浏览入口，“待审核”用于确认 AI 识别字段、套系归属、主参考与可复用状态。

## 生产部署

```bash
cp .env.example .env
docker compose up -d --build
curl -f http://localhost:3000/api/health
```

`docker-compose.yml` 启动 Next.js、PostgreSQL + pgvector、MinIO、本地 Jina CLIP v2 Embedding 与 PostgreSQL 任务队列 Worker。数据库首次创建时启用 `vector` 扩展。当前 Embedding 配置为离线运行，需要已有 `new-embedding` 基础镜像和包含模型的 `embedding_models` 数据卷；新机器须先准备这些依赖，不会在离线模式自动下载。

为首批 33 张素材创建可重复导入的 ZIP：

```bash
./scripts/create-first-import-zip.sh
```

在页面点击“导入 ZIP”上传该文件。Worker 会保存原文件、生成 PNG/JPEG/WebP 预览、通过 Responses 图片输入调用 `VISION_MODEL`（默认 `gpt-5.6-luna`）识别图片候选字段；Luna 同时负责文字需求分析。只有人工确认的可复用素材才会自动建立向量。基础设施不可用时，系统返回明确错误，绝不回退到样本排序。

### 内网 ccproxy 路由

本机可访问、Docker 虚拟机不可直接访问的公司内网网关，需要先在 Mac 上启动受限转发器：

```bash
node scripts/gateway-forwarder.mjs
```

它只接受 Docker Desktop 的本机来源，并转发 TLS 字节流到 `ccproxy.yukework.com`；不保存或打印 API Key。`docker-compose.yml` 已将这个主机名映射到宿主机，因此 `.env` 中应使用：

```dotenv
AI_GATEWAY_BASE_URL="https://ccproxy.yukework.com:8443"
```

若网关改为 Docker 可直接访问的公网地址，则删除该映射与端口，恢复标准 `https://<gateway>/v1` 地址即可。

## AI 网关配置

`zcode login` 只为本机 ZCode 命令行完成登录，服务端不会读取或转发它的个人令牌。要让本工具调用 ccproxy，需要为服务设置单独的 API 凭据：

```dotenv
AI_GATEWAY_BASE_URL="https://ccproxy.yukework.com:8443"
AI_GATEWAY_API_KEY="你的服务端 API Key"
LUNA_MODEL="gpt-5.6-luna"
VISION_MODEL="gpt-5.6-luna"
TERRA_MODEL="gpt-5.6-terra"
IMAGE_MODEL="gpt-image-2"
```

- Luna：把设计需求解析为年级、学科、物料类型、风格和检索条件。
- 本地 Jina CLIP v2：将文字需求与预览图写成同一 1024 维向量，供 pgvector 相似度召回。
- Terra：生成参考报告和可编辑的生图提示词。
- gpt-image-2：仅在人工确认提示词后生成图片。

未填写 `AI_GATEWAY_API_KEY`，或 Luna/Terra 未返回合格 JSON 时，需求分析、报告和提示词会明确失败并停止流程；系统不会以本地规则或静态文字伪造 AI 成功。

## 数据边界

- 导入 ZIP 内所有原文件保存到 MinIO；PDF、AI 等无预览格式会标记为“待补预览”，绝不进入识别和索引。
- 每项素材在 `asset_embeddings` 中有一条 1024 维文本向量和一条 1024 维预览图向量；检索先以物料类型、年级、学科、审核与复用状态过滤，再以文字 60% + 图片 40% 联合排序。
- 只有已确认、具有预览、且套系拥有已确认并索引的主参考图，才进入正式检索。
- 生成图片保存到 MinIO；任务记录已选参考、报告、提示词、模型、状态与失败原因。

## 从需求到生图

界面里的风格关键词为 3–4 个、每个 2–4 字的中文风格/情绪词；构图与主体信息仍保留在设计方向和检索描述中。报告与生图规则固定在 `visual-rules/generation.mjs`：报告为短摘要和少量要点，规则版本与最终请求均保存在生成记录中。

当前生成规则为 `image2-v3`，格式见 [提示词规范](visual-rules/image2-v3.md)。最终发送全文（含反向、参考职责及约束）限制 2000 字，编辑区显示完整计数和发送预览。先选画幅、创作自由度、卖点来源及 A–I 结构，上传需要的参考，再组合提示词；设置或参考变化后需重新组合。自由度支持贴近参考、适度发挥、大胆探索；明确文案、IP、硬约束和选定卖点类别始终保留。参考报告折叠，生成设置与提示词确认共用一张工作卡。普通重生不默认使用上一版结果，改图绑定明确历史版本。

审核页面统一为一张素材一次确认：基础信息和视觉候选事务性保存，支持套系筛选与批量确认；套系主参考独立显式选择，旧版视觉升级不重复改写已确认基础信息。处理中留在队列，发布成功后移入项目库。旧审核接口与历史版本保留兼容。

独立参考用途为「封面 IP／整体风格／排版参考」，每任务最多6张、其中封面 IP 最多1张。角色图负责身份，套系图负责风格与排版；实际图片与用途说明一并传给生图，生成版本保留来源快照。移除参考不删除历史版本依赖的对象。局部改图默认直接附加用户意见、不调用 Terra；复杂重组可选 Terra，模型请求与格式修复共用60秒等待预算，网络超时不自动重复请求。卖点分类细化版本为 `selling-2026-09-09`，不自动覆盖已审核素材档案。

参考区左列展示套系图、右列展示本次上传。已上传图片的使用说明须在图片下保存；未保存时阻止组合和生图。IP 是必须可见的主体，「文字主导」不能变成人物禁令；组合后的已知正反向冲突最多修复一次，未修复及手动引入的冲突会在生图前拦截。该规则检查不等同于完整语义验证。

选定 A–I 卖点分类时，附带 `public/selling-layouts` 中对应的单元样图，原始来源由 `visual-rules/selling-examples.mjs` 记录；图按内容校验值保存到对象存储供生成历史追溯，不导入项目库。选择继承套系时不加样图。更新样图可运行 `node scripts/build-selling-examples.mjs <卖点目录>`。

需求分析、检索、报告、提示词及生图都在当前操作位置显示等待反馈。beUI 状态按钮、加载图形与文字微光配合真实等待秒数，不显示虚构完成百分比；图标统一线条，只在鼠标悬停或键盘聚焦时轻量变化，尊重系统减少动态效果设置。提示词成功后自动定位编辑区；保存失败时当前页面保留已收到结果，重试只重新保存，不重复调用 Terra。

文本网关每次请求最长等待 90 秒，兼容字符串、文本块和 Responses 公开回答；空 chat 回答可切换 Responses 协议一次，仍要求合法 JSON，不使用推理或拒绝文本替代结果。授权错误不自动重试。运行 `node tests/model-response.mjs` 和 `node tests/generation-ui.mjs` 可覆盖这些故障及交互（后者需要 Playwright 和浏览器，接口均模拟）。

画幅使用 16 的倍数：竖版 3:4 为 1152×1536，横版 4:3 为 1536×1152；旧版 1024×1365 / 1365×1024 会兼容转换。提交前校验参数，失败原因显示在生图按钮旁，生成图片必须可解码并存储成功才显示完成。测试不自动调用收费生图。

状态按钮与加载动画采用 beui 的源码组件，位于 `components/motion`，许可证同目录保存；图标继续使用 beui 同样采用的 Lucide。`app/beui.css` 只引入工具类，不加载 Tailwind 的全局重置，保留原有主题。进度动画不代表虚构的完成百分比。Docker 使用 `package-lock.json` 和 `npm ci`；需要专用包源时可传 `--build-arg NPM_REGISTRY=...`，默认仍为 npm 官方源。

主入口为“创建设计”。标准流程是：输入需求 → Luna 设计方向与 3–4 个关键词 → 补充修正或确认方向 → 本地 Jina CLIP / pgvector 检索 → 人工确认主参考与最多两张辅助图 → Terra 报告与提示词 → 人工确认 → `gpt-image-2`。后续补充生成新需求版本，旧任务与图片留作历史，但不能继续使用过期确认。

在未配置 AI 网关、Embedding 服务或 pgvector 数据时，流程会停止并说明未就绪原因，防止将演示结果误认为正式语义检索。

## 视觉规则 v1

共享规则位于 `visual-rules/v1/index.mjs`，包含六组视觉档案、八类标题和九类卖点。规则是结构参考，不强制扁平字效，不推测具体字体名称。OCR 原文不进入新版视觉摘要。Embedding 服务按真实 tokenizer 上限检查六组预算，超限明确失败，不静默截断。

“审核队列 → 视觉规则审核 → 识别／重试未完成素材”会为有预览的现有素材生成候选。可以按套系全选待审项，也可点击素材逐字段修改；上传素材默认可复用，审核不再要求选择复用状态或填写改造说明。新视觉字段确认后才向量化，成功时原子替换活动索引；候选、失败和处理中的修订不覆盖旧索引。主参考必须人工指定，系统不再自动选择。旧版索引仍可做语义参考，但不能证明其满足新版硬约束。

Web 和 Worker 启动时以数据库锁运行 `prisma/migrations/02-visual-rules.sql`；对已有库也生效，不依赖首次初始化。`visual_revisions` 保存候选和确认快照，`asset_embeddings.visual_revision_id` 关联当前索引，`brief_drafts/brief_revisions` 保存需求历史，任务保存参考快照与规则版本。旧生成任务仅保留历史，新创作需重新确认需求。

接口变化：`POST /api/brief/analyse` 接收 `{brief}` 或 `{draftId,revision,supplement}`；`POST /api/brief/confirm` 和 `/api/retrieve` 接收 `{draftId,revision}`。`/api/visual-revisions` 的 GET 查看进度，POST 提交升级，PATCH 提交 `{items:[{id,profile}]}`。报告与提示词接口接收 `{taskId}`，由服务端读取快照，不信任客户端参考描述。

带硬约束的请求只检索能验证约束的已发布档案；不支持的约束会阻止检索并要求修正，不暗中放宽。文本／图片基础分仍为 60%／40%，存在视觉偏好时以基础分 80%＋分类分 20% 排序。HNSW 迭代扫描在筛选范围召回，不足时精确补检；分数是排序依据，不是成功概率。历史改造备注仍保留并传入 Terra；上传图及生成底图在存在硬约束时额外由 Luna 核验，未通过不调用生图。

验证命令（集成测试使用随机隔离 schema，结束后只移除该测试 schema）：

```bash
npm run typecheck
npm run lint
node --test tests/*.test.mjs
DATABASE_URL=postgresql://visual:visual@localhost:5432/visual_archive node tests/visual-integration.mjs
# 安装或提供 Playwright 运行时后；仅 mock 测试浏览器，不写正式素材
node tests/visual-ui.mjs
```

浏览器测试可通过 `PLAYWRIGHT_MODULE` 指定已有模块路径、`CHROME_PATH` 指定本机 Chrome 可执行文件、`APP_URL` 指定测试网站；截图输出到 `/private/tmp/visual-v1-*.png`。验收不自动调用付费生图。
