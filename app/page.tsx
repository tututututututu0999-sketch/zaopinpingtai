"use client";

import { Archive, ArrowLeft, ArrowRight, BadgeCheck, Check, CheckSquare, ClipboardCheck, Download, Edit3, FileArchive, FileCheck2, FolderUp, ImageIcon, Layers3, Maximize2, Moon, Pencil, Plus, RefreshCw, Search, Sparkles, Square, Sun, Trash2, Upload, WandSparkles, X } from "./ui-icons";
import {BusyIcon as LoaderCircle} from './ui-progress';
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ArchiveAsset, CandidateSuite } from "@/lib/archive-types";
import type { BriefAnalysis, PromptDraft, ReferenceReport } from "@/lib/brief";
import UnifiedReview from './unified-review';
import {scopeBriefConstraints} from '@/visual-rules/constraint-scope.mjs';
import {buildReferenceRoles} from '@/visual-rules/reference-roles.mjs';
import VisualProfileView from './visual-profile';
import TextModelPicker from './text-model-picker';
import ArchiveCoverage,{type ArchiveStatus} from './archive-coverage';
import DirectionReview from './direction-review';
import FinalPrompt from './final-prompt';
import ReferenceReportView from './reference-report';
import ReferenceUpload,{type TaskReference,uploadRoleNames} from './reference-upload';
import {StatefulButton} from '@/components/motion/button/stateful';
import {canvasSizes,normalizeImageSize,previewImage2Prompt,creativityModes,type Creativity} from '@/visual-rules/generation.mjs';
import './visual-rules.css';
import './workflow-motion.css';
import {WorkflowButton,WorkflowFeedback} from './workflow-feedback';
import {normalizeBriefConstraints,SELLING_TYPES} from '@/visual-rules/v1/index.mjs';

type View = "create" | "import" | "projects" | "review";
type Project = { id: string; name: string; suites: { id: string; name: string; assets: ArchiveAsset[] }[] };
type Batch = { id: string; original_filename: string; project_name: string | null; suite_name: string | null; status: string; error_message: string | null; total: string; pending: string; failed: string };
type Task = { id: string; status: string;reference_source?:'catalog'|'upload'|'none' };
type ReferenceMode = 'catalog' | 'upload' | 'none';
type ExtensionModule = {
  id: string;
  name: string;
  brief: string;
  taskId?: string;
  image?: string;
  prompt?: PromptDraft;
  size: string;
  status: "DRAFT" | "WORKING" | "GENERATED";
  versions?: { id: string; imageUrl: string | null; size: string; created_at: string }[];
};
const materialNames: Record<string, string> = { BOOK_COVER: "主书封面", TITLE_PAGE: "扉页", GIFT_BOX: "礼盒", PRODUCT_BOOKLET: "产品说明书", WALL_CHART: "挂图", OTHER: "其他" };
const reuseNames: Record<string, string> = { REUSABLE: "可复用", ADAPT_REQUIRED: "需改造", NOT_REUSABLE: "不可复用" };

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" | "info" }) { return <span className={`badge badge-${tone}`}>{children}</span>; }
function DownloadImage({versionId,label='下载原图'}:{versionId?:string;label?:string}) { return versionId ? <a className="button button-secondary image-download" href={`/api/generated/versions/${encodeURIComponent(versionId)}?download=1`} download><Download size={15}/>{label}</a> : null; }
function AssetImage({ asset, className = "" }: { asset: ArchiveAsset; className?: string }) { return asset.previewUrl ? <img className={className} src={asset.previewUrl} alt={asset.displayName} /> : <div className={`asset-placeholder ${className}`}>待补预览</div>; }
function suiteNameFrom(filename: string) { return filename.replace(/\.zip$/i, "").replace(/[-_]+/g, " ").trim(); }
function embeddingLabel(asset: ArchiveAsset) {
  if (asset.reviewState !== "CONFIRMED") return asset.analysisStatus === "FAILED" ? "识别失败" : "待审核";
  if (asset.embeddingStatus === "READY") return "已确认 · 可检索";
  if (asset.embeddingStatus === 'WAITING_VISUAL') return '已确认素材 · 待审核视觉规则';
  if (asset.embeddingStatus === "PROCESSING") return "向量化中";
  if (asset.embeddingStatus === "PROCESSING_TEXT") return "正在生成文本向量";
  if (asset.embeddingStatus === "PROCESSING_IMAGE") return "正在生成图片向量";
  if (asset.embeddingStatus === "FAILED") return "向量化失败 · 可重试";
  if (asset.embeddingStatus === "QUEUED") return "已确认 · 排队向量化";
  return asset.reuseState === "NOT_REUSABLE" ? "不可复用 · 不参与检索" : !asset.previewUrl ? "待补预览 · 不参与检索" : "等待索引条件就绪";
}
function batchStatusLabel(status: string) { return ({ QUEUED: "排队中", PROCESSING: "处理中", AWAITING_REVIEW: "待审核", FAILED: "失败" } as Record<string, string>)[status] ?? status; }

async function parseJsonResponse<T>(response: Response, url: string): Promise<T> {
  const raw = await response.text();
  if (!raw.trim()) throw new Error(`${url} 未返回数据（HTTP ${response.status}）。服务可能正在重启，请重试。`);
  let payload: T & { error?: string };
  try { payload = JSON.parse(raw) as T & { error?: string }; }
  catch { throw new Error(`${url} 返回了非 JSON 响应（HTTP ${response.status}），请重试。`); }
  if (!response.ok) throw new Error(payload.error ?? `请求失败（${response.status}）`);
  return payload;
}

async function requestJson<T>(url: string, body?: unknown, method = body === undefined && !/\/(retry|reindex)$/.test(url) ? "GET" : "POST"): Promise<T> {
  try {
    const response = await fetch(url, { method, cache: "no-store", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
    return await parseJsonResponse<T>(response, url);
  } catch (error) {
    if (error instanceof Error && !/^(fetch failed|Failed to fetch)$/i.test(error.message)) throw error;
    throw new Error(`${url} 暂时无法连接，请确认 Docker 服务正常后重试。`);
  }
}

export default function Home() {
  const [supplement,setSupplement]=useState('');
  const [briefConfirmed,setBriefConfirmed]=useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [view, setView] = useState<View>("create");
  const [assets, setAssets] = useState<ArchiveAsset[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [, setReviewAssetId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [previewAsset, setPreviewAsset] = useState<ArchiveAsset | null>(null);
  const [detailAssetId, setDetailAssetId] = useState("");
  const detailAsset = assets.find((asset) => asset.id === detailAssetId);
  const detailDialog = useRef<HTMLDialogElement>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [libraryError, setLibraryError] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const archiveInput = useRef<HTMLInputElement>(null);
  const libraryLoading = useRef(false);
  const [brief, setBrief] = useState("为二年级小学生制作一款数学思维礼盒，风格明快、有机械感，避免复制既有品牌文字。");
  const [analysis, setAnalysis] = useState<BriefAnalysis | null>(null);
  const [candidates, setCandidates] = useState<CandidateSuite[]>([]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [helperIds, setHelperIds] = useState<string[]>([]);
  const [report, setReport] = useState<ReferenceReport | null>(null);
  const [promptDraft, setPromptDraft] = useState<PromptDraft | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [referenceMode,setReferenceMode]=useState<ReferenceMode>('catalog');
  const branchDrafts=useRef<Partial<Record<ReferenceMode,ReturnType<typeof captureBranch>>>>({});
  const [taskAssetIds,setTaskAssetIds]=useState<string[]>([]);
  const taskAssets=taskAssetIds.map(id=>assets.find(asset=>asset.id===id)).filter((asset):asset is ArchiveAsset=>Boolean(asset));
  const [generatedImage, setGeneratedImage] = useState("");
  const [generationState,setGenerationState]=useState<'idle'|'loading'|'success'|'error'>('idle');
  const [generationFeedback,setGenerationFeedback]=useState('');
  const [promptError,setPromptError]=useState('');
  const [reportError,setReportError]=useState('');
  const [revisionError,setRevisionError]=useState('');
  const promptPanel=useRef<HTMLElement>(null);
  const pendingPrompt=useRef<{taskId:string;draft:PromptDraft}|null>(null);
  const [textModel,setTextModel]=useState("gpt-5.6-luna");
  const [archiveStatus,setArchiveStatus]=useState<ArchiveStatus|null>(null);
  const [archiveStatusError,setArchiveStatusError]=useState(false);
  const pendingReport=useRef<{taskId:string;report:ReferenceReport}|null>(null);
  const workflowBusy=useRef(false);
  function showPromptPanel(){requestAnimationFrame(()=>{promptPanel.current?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});promptPanel.current?.focus({preventScroll:true});});}
  const [canvasSize, setCanvasSize] = useState("1024x1536");
  const [sellingSourceId,setSellingSourceId]=useState('');
  const [sellingType,setSellingType]=useState('');
  const [creativity,setCreativity]=useState<Creativity>('faithful');
  const [currentVersionId,setCurrentVersionId]=useState('');
  const [taskReferences, setTaskReferences] = useState<TaskReference[]>([]);
  const [uploadRole,setUploadRole]=useState<TaskReference['role']>('character');
  const [referenceNoteEdits,setReferenceNoteEdits]=useState<Record<string,string>>({});
  const unsavedReferenceNotes=taskReferences.some(reference=>referenceNoteEdits[reference.id]!==undefined&&referenceNoteEdits[reference.id]!==reference.note);
  const [revisionMode,setRevisionMode]=useState<'direct'|'terra'>('direct');
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [editRefs,setEditRefs]=useState<TaskReference[]>([]);
  const [editRefRole,setEditRefRole]=useState<'style'|'character'|'layout'>('style');
  const [editRefNote,setEditRefNote]=useState('');
  const [extensionName, setExtensionName] = useState("");
  const [extensionBrief, setExtensionBrief] = useState("");
  const [extensionParentTaskId, setExtensionParentTaskId] = useState("");
  const [extensionSourceImage, setExtensionSourceImage] = useState("");
  const [mainVisual, setMainVisual] = useState<{ taskId: string; image: string; prompt?: PromptDraft; size: string;versionId?:string } | null>(null);
  const [mainVisualConfirmed, setMainVisualConfirmed] = useState(false);
  const [mainVersions, setMainVersions] = useState<{ id: string; prompt: PromptDraft; imageUrl: string | null; size: string; created_at: string }[]>([]);
  const [extensionModules, setExtensionModules] = useState<ExtensionModule[]>([]);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const reviewQueue = useMemo(() => assets.filter((asset) => asset.reviewState === "PENDING" && (asset.analysisStatus === "ANALYZED" || asset.analysisStatus === "FAILED")), [assets]);
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const selectedProjectAssets = selectedProject?.suites.flatMap((suite) => suite.assets) ?? [];
  const allProjectAssetsSelected = selectedProjectAssets.length > 0 && selectedProjectAssets.every((asset) => selectedAssetIds.includes(asset.id));
  const selectedCandidate = candidates[candidateIndex];
  const selectedHelpers = selectedCandidate?.helpers.filter((asset) => helperIds.includes(asset.id)) ?? [];

  async function loadLibrary() {
    if (libraryLoading.current) return;
    libraryLoading.current = true;
    try {
      const [assetsResult, projectsResult, batchesResult, statusResult] = await Promise.allSettled([
        requestJson<ArchiveAsset[]>("/api/assets"),
        requestJson<Project[]>("/api/projects"),
        requestJson<Batch[]>("/api/imports"),
        requestJson<ArchiveStatus>("/api/archive-status"),
      ]);
      if(statusResult.status==="fulfilled"){setArchiveStatus(statusResult.value);setArchiveStatusError(false);}else setArchiveStatusError(true);
      const nextAssets = assetsResult.status === "fulfilled" ? assetsResult.value : assets;
      const nextProjects = projectsResult.status === "fulfilled" ? projectsResult.value : projects;
      const nextBatches = batchesResult.status === "fulfilled" ? batchesResult.value : batches;
      if (assetsResult.status === "fulfilled") setAssets(nextAssets);
      if (projectsResult.status === "fulfilled") setProjects(nextProjects);
      if (batchesResult.status === "fulfilled") setBatches(nextBatches);
      setSelectedProjectId((current) => current || nextProjects[0]?.id || "");
      setReviewAssetId((current) => nextAssets.some((asset) => asset.id === current && asset.reviewState === "PENDING" && (asset.analysisStatus === "ANALYZED" || asset.analysisStatus === "FAILED")) ? current : nextAssets.find((asset) => asset.reviewState === "PENDING" && (asset.analysisStatus === "ANALYZED" || asset.analysisStatus === "FAILED"))?.id || "");
      setSelectedAssetIds((current) => current.filter((id) => nextAssets.some((asset) => asset.id === id)));
      const failures = [assetsResult, projectsResult, batchesResult].filter((result) => result.status === "rejected");
      if (failures.length === 3) throw failures[0].reason;
      setLibraryError(failures.length ? "项目库部分数据暂时不可用，正在自动重试。" : "");
    } catch (error) { setLibraryError(error instanceof Error ? error.message : "项目库尚未就绪"); }
    finally { libraryLoading.current = false; }
  }
  useEffect(() => { loadLibrary(); const id = window.setInterval(loadLibrary, 4_000); return () => window.clearInterval(id); }, []);
  useEffect(() => { if (detailAssetId) detailDialog.current?.showModal(); else detailDialog.current?.close(); }, [detailAssetId]);
  useEffect(() => { document.documentElement.classList.toggle("dark", theme === "dark"); }, [theme]);
  function captureBranch() {
    return {candidates,candidateIndex,helperIds,report,promptDraft,task,taskAssetIds,generatedImage,generationState,generationFeedback,promptError,reportError,analysisError,revisionError,canvasSize,sellingSourceId,sellingType,creativity,currentVersionId,taskReferences,uploadRole,referenceNoteEdits,textModel,pendingPrompt:pendingPrompt.current,pendingReport:pendingReport.current};
  }
  // Drafts belong to one analysed requirement and one material. Switching the
  // reference source never deletes tasks or silently re-runs paid AI steps.
  function switchReferenceMode(mode:ReferenceMode) {
    if(referenceMode===mode)return false;
    branchDrafts.current[referenceMode]=captureBranch();
    const saved=branchDrafts.current[mode];
    setReferenceMode(mode);setRevisionOpen(false);setMessage('');
    clearReferenceOutputs();setCandidates([]);setHelperIds([]);setCandidateIndex(0);setAnalysisError('');setRevisionError('');
    if(!saved){setCanvasSize('1024x1536');setCreativity('faithful');return false;}
    setCandidates(saved.candidates);setCandidateIndex(saved.candidateIndex);setHelperIds(saved.helperIds);setReport(saved.report);setPromptDraft(saved.promptDraft);setTask(saved.task);setTaskAssetIds(saved.taskAssetIds);setGeneratedImage(saved.generatedImage);setGenerationState(saved.generationState);setGenerationFeedback(saved.generationFeedback);setPromptError(saved.promptError);setReportError(saved.reportError);setAnalysisError(saved.analysisError);setRevisionError(saved.revisionError);setCanvasSize(saved.canvasSize);setSellingSourceId(saved.sellingSourceId);setSellingType(saved.sellingType);setCreativity(saved.creativity);setCurrentVersionId(saved.currentVersionId);setTaskReferences(saved.taskReferences);setUploadRole(saved.uploadRole);setReferenceNoteEdits(saved.referenceNoteEdits);setTextModel(saved.textModel);pendingPrompt.current=saved.pendingPrompt;pendingReport.current=saved.pendingReport;
    return Boolean(saved.task||saved.candidates.length);
  }
  function resetWorkflow() { branchDrafts.current={};setReferenceMode('catalog');clearReferenceOutputs();setRevisionError('');setCandidates([]);setHelperIds([]);setCandidateIndex(0);setRevisionOpen(false);setBriefConfirmed(false); }
  async function reviseBrief(){if(!analysis||!supplement.trim())return;setLoading('reviseBrief');setAnalysisError('');resetWorkflow();try{setAnalysis(scopeBriefConstraints(normalizeBriefConstraints(await requestJson<BriefAnalysis>('/api/brief/analyse',{draftId:analysis.draftId,revision:analysis.revision,supplement,textModel}))));setSupplement('');}catch(error){setAnalysisError(error instanceof Error?error.message:'修正失败');}finally{setLoading('');}}
  async function confirmAndRetrieve(retry=false){if(!analysis||loading)return;const restored=switchReferenceMode('catalog');if(!retry&&(restored||(referenceMode==='catalog'&&(task||candidates.length))))return;clearReferenceOutputs();setCandidates([]);setLoading('retrieve');setAnalysisError('');try{await requestJson('/api/brief/confirm',{draftId:analysis.draftId,revision:analysis.revision});setBriefConfirmed(true);const retrieval=await requestJson<{candidates:CandidateSuite[];reason?:string}>('/api/retrieve',{draftId:analysis.draftId,revision:analysis.revision,excludeMaterialType:extensionParentTaskId?'GIFT_BOX':undefined});if(!retrieval.candidates.length)throw new Error(retrieval.reason||'暂无匹配素材');setCandidates(retrieval.candidates);setCandidateIndex(0);setHelperIds(retrieval.candidates[0].helpers.map(asset=>asset.id));}catch(error){setAnalysisError(error instanceof Error?error.message:'检索失败');}finally{setLoading('');}}
  function selectImportFile(file: File | null) { setImportFile(file); }

  async function uploadArchive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!importFile) { setMessage("请选择一个 ZIP 套系包"); return; }
    setLoading("upload"); setMessage("");
    try {
      const form = new FormData(); form.append("archive", importFile);
      const response = await fetch("/api/imports", { method: "POST", body: form }); await parseJsonResponse(response, "/api/imports");
      setImportFile(null); if (archiveInput.current) archiveInput.current.value = "";
      setMessage("已按 ZIP 名称创建项目与视觉套系。预览、识别和人工审核将按该套系归档。"); await loadLibrary();
    } catch (error) { setMessage(error instanceof Error ? error.message : "导入失败"); } finally { setLoading(""); }
  }
  async function retryBatch(id: string) { setLoading(`retry-${id}`); try { await requestJson(`/api/imports/${id}/retry`); setMessage("该套系的未完成素材已重新入队。"); await loadLibrary(); } catch (error) { setMessage(error instanceof Error ? error.message : "重试失败"); } finally { setLoading(""); } }
  async function retryAsset(asset: ArchiveAsset) { setLoading(`retry-asset-${asset.id}`); setMessage(""); try { await requestJson(`/api/assets/${asset.id}/retry`); setMessage("已重新提交 AI 识别。若网关持续失败，会保留失败原因供人工补录。"); await loadLibrary(); } catch (error) { setMessage(error instanceof Error ? error.message : "重试识别失败"); } finally { setLoading(""); } }
  async function retryEmbedding(asset: ArchiveAsset) { setLoading(`reindex-${asset.id}`); setMessage(""); try { await requestJson(`/api/assets/${asset.id}/reindex`); setMessage("已重新提交向量化，完成后会显示“已确认 · 可检索”。"); await loadLibrary(); } catch (error) { setMessage(error instanceof Error ? error.message : "重试向量化失败"); } finally { setLoading(""); } }
  function toggleAssetSelection(id: string) { setSelectedAssetIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function toggleSelectAll() { setSelectedAssetIds((current) => allProjectAssetsSelected ? current.filter((id) => !selectedProjectAssets.some((asset) => asset.id === id)) : [...new Set([...current, ...selectedProjectAssets.map((asset) => asset.id)])]); }
  async function deleteSelectedAssets() {
    if (!selectedAssetIds.length || !window.confirm(`确定删除已选 ${selectedAssetIds.length} 个素材？原始文件、预览和向量记录都会删除。`)) return;
    setLoading("delete-assets"); setMessage("");
    try { const result = await requestJson<{ deleted: number }>("/api/assets", { ids: selectedAssetIds }, "DELETE"); setSelectedAssetIds([]); setMessage(`已删除 ${result.deleted} 个素材，相关向量索引已同步移除。`); await loadLibrary(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "删除素材失败"); }
    finally { setLoading(""); }
  }
  async function renameAsset(asset: ArchiveAsset) { const displayName = window.prompt("素材名称", asset.displayName); if (displayName === null || displayName.trim() === asset.displayName) return; setLoading(`rename-${asset.id}`); try { await requestJson(`/api/assets/${asset.id}/name`, { displayName: displayName.trim() }, "PATCH"); await loadLibrary(); } catch (error) { setMessage(error instanceof Error ? error.message : "重命名失败"); } finally { setLoading(""); } }
  async function reopenAsset(asset: ArchiveAsset) { setLoading(`reopen-${asset.id}`); setMessage(""); try { await requestJson(`/api/assets/${asset.id}/reopen`, {}, "PATCH"); setMessage("素材已移回审核队列，并从正式索引移除。修正素材信息后确认，才会重新生成向量并入库。"); setView("review"); await loadLibrary(); } catch (error) { setMessage(error instanceof Error ? error.message : "重新审核失败"); } finally { setLoading(""); } }
  async function analyseAndRetrieve() {
    setLoading("analyse"); setMessage(""); setAnalysisError(""); setAnalysis(null); resetWorkflow();
    let stage = "需求分析";
    try {
      setBriefConfirmed(false);setSupplement('');
      const nextAnalysis = await requestJson<BriefAnalysis>("/api/brief/analyse", { brief,textModel });
      setAnalysis(scopeBriefConstraints(normalizeBriefConstraints(nextAnalysis)));
    } catch (error) { setAnalysisError(`${stage}未完成：${error instanceof Error ? error.message : "服务暂时不可用，请重试。"}`); }
    finally { setLoading(""); }
  }
  function clearReferenceOutputs(){pendingPrompt.current=null;pendingReport.current=null;setSellingSourceId('');setSellingType('');setPromptError('');setReportError('');setGenerationState('idle');setGenerationFeedback('');setReport(null);setPromptDraft(null);setTask(null);setGeneratedImage('');setTaskReferences([]);setReferenceNoteEdits({});setTaskAssetIds([]);setCurrentVersionId('');}
  function chooseCandidate(index: number) { if(loading)return;clearReferenceOutputs();setCandidateIndex(index); setHelperIds(candidates[index].helpers.map((asset) => asset.id)); }
  function toggleHelper(id: string) { if(loading)return;clearReferenceOutputs();setHelperIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 2 ? [...current, id] : [...current.slice(1), id]); }
  async function startUploadBranch(){
    if(!analysis||loading)return;
    if(switchReferenceMode('upload')||(referenceMode==='upload'&&task?.reference_source==='upload'))return;
    clearReferenceOutputs();setCandidates([]);setLoading('start-upload');setAnalysisError('');
    try{await requestJson('/api/brief/confirm',{draftId:analysis.draftId,revision:analysis.revision});setBriefConfirmed(true);
      const created=await requestJson<Task>('/api/design-tasks',{draftId:analysis.draftId,revision:analysis.revision,textModel,referenceSource:'upload',referenceAssetIds:[],parentTaskId:extensionParentTaskId||undefined});
      setTask({...created,reference_source:'upload'});setUploadRole('style');
    }catch(error){setAnalysisError(error instanceof Error?error.message:'无法开始独立上传');}finally{setLoading('');}
  }
  async function startNoReferenceBranch(){
    if(!analysis||loading)return;
    if(switchReferenceMode('none'))return;
    setLoading('start-none');setAnalysisError('');
    try {
      await requestJson('/api/brief/confirm',{draftId:analysis.draftId,revision:analysis.revision});setBriefConfirmed(true);
      const created=referenceMode==='none'&&task?task:await requestJson<Task>('/api/design-tasks',{draftId:analysis.draftId,revision:analysis.revision,textModel,referenceSource:'none',referenceAssetIds:[],parentTaskId:extensionParentTaskId||undefined});
      setTask({...created,reference_source:'none'});setCreativity('exploratory');
      const next=await requestJson<ReferenceReport>('/api/brief/report',{taskId:created.id});
      await requestJson(`/api/design-tasks/${created.id}`,{report:next,status:'REPORT_READY'},'PATCH');
      setReport(next);setTask({...created,reference_source:'none',status:'REPORT_READY'});
    }catch(error){setAnalysisError(error instanceof Error?error.message:'无法开始无参考创作');}finally{setLoading('');}
  }
  async function changeTextModel(model:string){
    if(loading||model===textModel)return;setLoading('model');setMessage('');
    try{if(task){const result=await requestJson<Task>(`/api/design-tasks/${task.id}`,{action:'text-model',model},'PATCH');setTask({...task,...result});setReport(null);pendingReport.current=null;invalidatePrompt();}
      setTextModel(model);setMessage('已切换创作模型，参考和历史保留。');
    }catch(error){setMessage(error instanceof Error?error.message:'模型切换失败');}finally{setLoading('');}
  }
  async function confirmUploadBranch(){
    if(!task||loading||unsavedReferenceNotes)return;
    setLoading('confirm-uploads');setReportError('');
    let phase='参考图识别';
    try{await requestJson(`/api/design-tasks/${task.id}/confirm-uploads`,{});
      setTask({...task,status:'REFERENCE_CONFIRMED'});setLoading('report');phase='参考报告生成';
      const next=pendingReport.current?.taskId===task.id?pendingReport.current.report:await requestJson<ReferenceReport>('/api/brief/report',{taskId:task.id});
      pendingReport.current={taskId:task.id,report:next};
      await requestJson(`/api/design-tasks/${task.id}`,{report:next,status:'REPORT_READY'},'PATCH');
      setReport(next);setTask({...task,status:'REPORT_READY'});pendingReport.current=null;
    }catch(error){setReportError(`${phase}未完成：${error instanceof Error?error.message:'请重试'}`);}finally{setLoading('');}
  }
  function invalidateReferences(){invalidatePrompt();if(task?.reference_source==='upload'){setReport(null);pendingReport.current=null;setTask({...task,status:'REFERENCE_PENDING'});}}
  const uploadPanel=<ReferenceUpload references={taskReferences} edits={referenceNoteEdits} role={uploadRole} busy={Boolean(loading)} onRole={setUploadRole} onEdit={(id,value)=>setReferenceNoteEdits(current=>({...current,[id]:value}))} onSave={saveReferenceNote} onRemove={removeTaskReference} onUpload={uploadTaskReferences}/>;
  async function confirmReferences(){
    if(loading||workflowBusy.current)return;
    if(!analysis||(!task&&(!selectedCandidate||!briefConfirmed))){setReportError('请先确认需求方向并选择参考图');return;}
    workflowBusy.current=true;setLoading('report');setReportError('');
    try{const nextTask=task??await requestJson<Task>('/api/design-tasks',{brief,analysis,draftId:analysis.draftId,revision:analysis.revision,textModel,referenceAssetIds:[selectedCandidate!.primary.id,...selectedHelpers.map(asset=>asset.id)],parentTaskId:extensionParentTaskId||undefined});setTask(nextTask);if(!task&&selectedCandidate)setTaskAssetIds([selectedCandidate.primary.id,...selectedHelpers.map(asset=>asset.id)]);
      const nextReport=pendingReport.current?.taskId===nextTask.id?pendingReport.current.report:await requestJson<ReferenceReport>('/api/brief/report',{taskId:nextTask.id});
      pendingReport.current={taskId:nextTask.id,report:nextReport};await requestJson(`/api/design-tasks/${nextTask.id}`,{report:nextReport,status:'REPORT_READY'},'PATCH');setReport(nextReport);pendingReport.current=null;
    }catch(error){setReportError(error instanceof Error?error.message:'报告生成失败，请重试');}finally{setLoading('');workflowBusy.current=false;}
  }
  async function createPrompt(force=false){
    if(loading||workflowBusy.current)return;
    if(supplement.trim()){setPromptError('有尚未提交的需求补充，请先点击补充修正，让本次提示词采用最新需求');return;}
    if(unsavedReferenceNotes){setPromptError('请先保存参考图下方修改的使用说明');return;}
    if(!task||!report){setPromptError('当前设计任务缺少参考报告，请重新确认参考图');return;}
    if(promptDraft&&!force){showPromptPanel();return;}
    if(force)pendingPrompt.current=null;
    workflowBusy.current=true;setLoading('prompt');setPromptError('');
    try{const next=pendingPrompt.current?.taskId===task.id?pendingPrompt.current.draft:await requestJson<PromptDraft>('/api/brief/prompt',{taskId:task.id,creativity,size:normalizeImageSize(canvasSize),sellingSourceId:sellingSourceId||(task.reference_source==='upload'?taskReferences[0]?.id:taskAssets[0]?.id),sellingType});
      pendingPrompt.current={taskId:task.id,draft:next};
      await requestJson(`/api/design-tasks/${task.id}`,{prompt:next,status:'PROMPT_DRAFT'},'PATCH');setPromptDraft(next);pendingPrompt.current=null;showPromptPanel();
    }catch(error){setPromptError(`${error instanceof Error?error.message.replace(/[。.!！]+$/u,''):'提示词生成失败'}${pendingPrompt.current?'。提示词已收到，点击重试仅重新保存。':'。可在此重试，已确认的参考和报告会保留。'}`);}finally{setLoading('');workflowBusy.current=false;}
  }
  function invalidatePrompt(){pendingPrompt.current=null;setPromptDraft(null);setPromptError('');setGenerationState('idle');setGenerationFeedback('');}
  function changeCanvasSize(size:string){if(size!==canvasSize){setCanvasSize(size);invalidatePrompt();}}
  async function uploadTaskReferences(files: FileList | null) { if (!task || !files?.length||loading) return; setLoading("references"); setMessage(""); try { const form = new FormData();form.append('role',uploadRole); Array.from(files).forEach((file) => form.append("files", file)); const response = await fetch(`/api/design-tasks/${task.id}/references`, { method: "POST", body: form }); const added = await parseJsonResponse<TaskReference[]>(response, "参考图上传"); setTaskReferences((current) => [...current, ...added]);invalidateReferences(); setMessage(`已添加 ${added.length} 张${uploadRoleNames[uploadRole]}，确认并组合提示词后会传入生图。`); } catch (error) { setMessage(error instanceof Error ? error.message : "上传参考图失败"); } finally { setLoading(""); } }
  async function removeTaskReference(id:string){if(loading)return;setLoading('references');try{await requestJson(`/api/design-tasks/references/${id}`,undefined,'DELETE');setTaskReferences(current=>current.filter(item=>item.id!==id));if(sellingSourceId===id)setSellingSourceId('');invalidateReferences();}catch(error){setMessage(error instanceof Error?error.message:'移除失败');}finally{setLoading('');}}
  async function saveReferenceNote(reference:TaskReference){if(loading)return;setLoading('references');try{const result=await requestJson<{note:string}>(`/api/design-tasks/references/${reference.id}`,{note:referenceNoteEdits[reference.id]??reference.note},'PATCH');setTaskReferences(current=>current.map(item=>item.id===reference.id?{...item,note:result.note}:item));setReferenceNoteEdits(current=>{const next={...current};delete next[reference.id];return next;});invalidateReferences();setMessage(task?.reference_source==='upload'?'说明已保存，请重新确认上传参考':'参考说明已保存，请重新组合提示词');}catch(error){setMessage(error instanceof Error?error.message:'保存失败');}finally{setLoading('');}}
  async function uploadEditReference(file:File|undefined){
    if(!task||!file||loading)return;
    if(editRefs.length>=3){setRevisionError('本次最多3张参考图');return;}
    if(editRefRole==='character'&&editRefs.some(ref=>ref.role==='character')){setRevisionError('请先移除本次旧IP参考');return;}
    setLoading('edit-upload');setRevisionError('');
    try{const form=new FormData();form.append('file',file);form.append('role',editRefRole);form.append('note',editRefNote);
      const response=await fetch(`/api/design-tasks/${task.id}/edit-references`,{method:'POST',body:form});
      const ref=await parseJsonResponse<TaskReference>(response,'本次改图参考');setEditRefs(current=>[...current,ref]);setEditRefNote('');
    }catch(error){setRevisionError(error instanceof Error?error.message:'上传失败');}finally{setLoading('');}
  }
  async function revisePrompt(){
    if(loading||workflowBusy.current)return;
    if(!promptDraft||!task||!revisionInstruction.trim()){setRevisionError('请先选择要修改的设计任务，并填写修改意见');return;}
    workflowBusy.current=true;setLoading('revise');setRevisionError('');
    try{
      const next=await requestJson<PromptDraft>('/api/brief/prompt/revise',{taskId:task.id,instruction:revisionInstruction,size:canvasSize,creativity,baseVersionId:currentVersionId||undefined,mode:revisionMode,editReferenceIds:revisionMode==='direct'?editRefs.map(ref=>ref.id):[]});
      await requestJson(`/api/design-tasks/${task.id}`,{prompt:next,status:'PROMPT_DRAFT'},'PATCH');
      setPromptDraft(next);setActiveModuleId(extensionParentTaskId?activeModuleId:'__main__');
      if(revisionMode==='direct'){
        if(!await generateDraft(next))return;
      }else{setGenerationState('idle');setGenerationFeedback('');showPromptPanel();}
      setRevisionInstruction('');setRevisionOpen(false);setEditRefs([]);setEditRefNote('');
    }catch(error){setRevisionError(error instanceof Error?error.message:'修改失败，请重试');}
    finally{setLoading('');workflowBusy.current=false;}
  }
  async function generate() {
    if(!task||!promptDraft||loading||workflowBusy.current)return;
    if(supplement.trim()){setMessage('有尚未提交的需求补充，请先补充修正并重新组合提示词');return;}
    if(unsavedReferenceNotes){setMessage('请先保存参考图使用说明并重新组合提示词');return;}
    workflowBusy.current=true;
    try{await generateDraft(promptDraft);}finally{workflowBusy.current=false;}
  }
  async function generateDraft(draft:PromptDraft) {
    if(!task)return false;
    const direct=draft.revisionMode==='direct'&&typeof draft.editInstruction==='string';
    setLoading('image');setGenerationState('loading');setGenerationFeedback('正在保存已确认的提示词…');
    try {
      const size=normalizeImageSize(direct?draft.size:canvasSize);setCanvasSize(size);
      await requestJson(`/api/design-tasks/${task.id}`,{prompt:draft,status:'PROMPT_CONFIRMED'},'PATCH');
      setGenerationFeedback(direct?'正在修改所选图片，通常需要几分钟，请勿重复提交。':'正在使用参考图生成设计，通常需要几分钟，请勿重复提交。');
      const result=await requestJson<{imageUrl:string;size:string;usedImageReferences:number;versionId:string}>('/api/images/generate',{taskId:task.id,size});
      setGeneratedImage(result.imageUrl);setGenerationState('success');
      setCurrentVersionId(result.versionId);setPromptDraft(direct?draft:{...draft,editBaseVersionId:undefined});
      setGenerationFeedback(`生成完成 · ${result.size} · ${direct?'已按本次意见修改底图，原版本已保留。':`已使用 ${result.usedImageReferences} 张参考图，图片已保存。`}`);
      const stored=await requestJson<{versions?:typeof mainVersions}>(`/api/design-tasks/${task.id}`).catch(()=>({versions:[]}));
      if(extensionParentTaskId)setExtensionModules(current=>current.map(module=>module.id===activeModuleId?{...module,taskId:task.id,image:result.imageUrl,prompt:draft,size:result.size,versions:(stored.versions??[]).filter(version=>version.imageUrl),status:'GENERATED'}:module));
      else {setMainVisual({taskId:task.id,image:result.imageUrl,prompt:draft,size:result.size,versionId:result.versionId});setMainVersions((stored.versions??[]).filter(version=>version.imageUrl));setMainVisualConfirmed(false);}
      return true;
    } catch(error) {
      const message=error instanceof Error?error.message:'生成失败，请重试';
      setGenerationState('error');setGenerationFeedback(message);
      if(direct)setRevisionError(message);
      return false;
    } finally {setLoading('');}
  }
  async function selectMainVersion(version:typeof mainVersions[number]){
    if(!version.imageUrl||!mainVisual||loading)return;
    if(task?.id!==mainVisual.taskId){
      setLoading('open-main');
      try{
        const [stored,uploads]=await Promise.all([requestJson<{analysis:BriefAnalysis;report:ReferenceReport;reference_ids:string[];reference_source:'catalog'|'upload'|'none';text_model?:string}>(`/api/design-tasks/${mainVisual.taskId}`),requestJson<TaskReference[]>(`/api/design-tasks/${mainVisual.taskId}/references`)]);
        branchDrafts.current={};setReferenceMode(stored.reference_source||'catalog');setReferenceNoteEdits({});setTask({id:mainVisual.taskId,status:'GENERATED',reference_source:stored.reference_source});setTextModel(stored.text_model||stored.analysis.textModel||"gpt-5.6-terra");setAnalysis(scopeBriefConstraints(normalizeBriefConstraints(stored.analysis)));setReport(stored.report);setTaskAssetIds(stored.reference_ids);setTaskReferences(uploads);setCandidates([]);
      }catch(error){setMessage(error instanceof Error?error.message:'主视觉读取失败，请重试');return;}finally{setLoading('');}
    }
    const legacy=version.prompt.prompt.match(/【生图提示词】\s*([\s\S]*?)\s*【反向提示词】/);
    const draft={...version.prompt,prompt:legacy?legacy[1]:version.prompt.prompt,editBaseVersionId:version.prompt.editInstruction?version.prompt.editBaseVersionId:undefined};
    setSellingSourceId(draft.referencePlan?.sellingSourceId||'');setSellingType(draft.referencePlan?.sellingType||'');
    setTask(current=>({id:mainVisual.taskId,status:'GENERATED',reference_source:current?.reference_source}));setActiveModuleId('__main__');setExtensionParentTaskId('');setExtensionSourceImage('');
    const snapshot=(version.prompt as PromptDraft&{referenceSnapshot?:{id:string}[]}).referenceSnapshot;if(snapshot)setTaskAssetIds(snapshot.map(item=>item.id));
    setMainVisual({...mainVisual,image:version.imageUrl,prompt:draft,size:version.size,versionId:version.id});setMainVisualConfirmed(false);setCurrentVersionId(version.id);setGeneratedImage(version.imageUrl);setPromptDraft(draft);setCreativity(draft.creativity??"faithful");setCanvasSize(version.size);setGenerationFeedback('');setGenerationState('idle');
    return true;
  }
  async function openMainEditor(editImage=false){
    if(!mainVisual?.prompt||!mainVisual.versionId)return;
    if(await selectMainVersion({id:mainVisual.versionId,prompt:mainVisual.prompt,imageUrl:mainVisual.image,size:mainVisual.size,created_at:''})){
      if(editImage){setRevisionError('');setRevisionInstruction('');setEditRefs([]);setEditRefNote('');setRevisionOpen(true);}else showPromptPanel();
    }
  }
  function changeSellingPolicy(sourceId:string,type:string){setSellingSourceId(sourceId);setSellingType(type);pendingPrompt.current=null;setPromptDraft(null);setPromptError('');}
  async function confirmMainVisual(){
    if(!mainVisual?.versionId||loading)return;setLoading('confirm-main');
    try{await requestJson(`/api/design-tasks/${mainVisual.taskId}`,{action:'confirm-reference',versionId:mainVisual.versionId},'PATCH');setMainVisualConfirmed(true);setMessage('已确认所选版本，后续新建延展模块将以此图为统一参考。');}catch(error){setMessage(error instanceof Error?error.message:'确认失败');}finally{setLoading('');}
  }
  function beginExtension() { const name = extensionName.trim(); if (loading||!mainVisualConfirmed||!mainVisual || !name) { setMessage("请先确认一个主视觉版本，并填写延展物料名称。"); return; } const id = crypto.randomUUID(); const childBrief = extensionBrief.trim() ? `${extensionBrief.trim()}\n延展物料：${name}。需延续已确认主视觉的色彩、图形语言与系列识别，但针对该物料重新组织版式。` : `为已确认的礼盒封面主视觉延展「${name}」。保持同一系列的色彩、图形语言与识别系统，针对该物料重新组织版式。`; setExtensionModules((current) => [...current, { id, name, brief: childBrief, size: "1024x1536", status: "DRAFT" }]); setExtensionName(""); setExtensionBrief(""); setActiveModuleId(id); setExtensionParentTaskId(mainVisual.taskId); setExtensionSourceImage(mainVisual.image); setBrief(childBrief); resetWorkflow();setCurrentVersionId('');setTaskAssetIds([]); setMessage(`已添加「${name}」模块。现在可独立分析、选参考、组装提示词并生成。`); window.scrollTo({ top: 0, behavior: "smooth" }); }
  async function openExtension(module: ExtensionModule,editImage=false) {
    if(loading)return;branchDrafts.current={};setReferenceMode('catalog');setReferenceNoteEdits({});pendingPrompt.current=null;pendingReport.current=null;setLoading('open-module');setActiveModuleId(module.id);setExtensionParentTaskId(mainVisual?.taskId??'');setExtensionSourceImage(mainVisual?.image??'');setBrief(module.brief);setCanvasSize(module.size);setGeneratedImage(module.image??'');setCurrentVersionId('');setTaskAssetIds([]);setPromptDraft(module.prompt??null);setTask(module.taskId?{id:module.taskId,status:module.image?'GENERATED':'REFERENCE_CONFIRMED'}:null);setAnalysis(null);setCandidates([]);setReport(null);setTaskReferences([]);setMessage('');
    try{if(module.taskId){const stored=await requestJson<{text_model?:string;reference_source:'catalog'|'upload'|'none';versions?:ExtensionModule['versions'];reference_ids?:string[];analysis:BriefAnalysis;report:ReferenceReport;prompt:PromptDraft;status:string}>(`/api/design-tasks/${module.taskId}`);setExtensionModules(current=>current.map(item=>item.id===module.id?{...item,versions:(stored.versions??[]).filter(version=>version.imageUrl)}:item));const version=stored.versions?.find(version=>version.imageUrl===module.image)??stored.versions?.find(version=>version.imageUrl);setCurrentVersionId(version?.id??'');setGeneratedImage(version?.imageUrl??module.image??'');setReferenceMode(stored.reference_source||'catalog');setTask({id:module.taskId,status:stored.status,reference_source:stored.reference_source});setTaskAssetIds(stored.reference_ids??[]);setAnalysis(scopeBriefConstraints(normalizeBriefConstraints(stored.analysis)));setReport(stored.report);setPromptDraft(stored.prompt);setCreativity(stored.prompt?.creativity??"faithful");setSellingSourceId(stored.prompt?.referencePlan?.sellingSourceId??'');setSellingType(stored.prompt?.referencePlan?.sellingType??'');setTaskReferences(await requestJson<TaskReference[]>(`/api/design-tasks/${module.taskId}/references`));if(editImage){if(!version)throw new Error('没有可修改的生成版本');setRevisionError('');setRevisionInstruction('');setEditRefs([]);setEditRefNote('');setRevisionOpen(true);}}setMessage(`正在编辑「${module.name}」`);}catch(error){setMessage(error instanceof Error?error.message:'模块读取失败，请重试');}finally{setLoading('');}
    window.scrollTo({top:0,behavior:'smooth'});
  }
  const finalPromptPreview=promptDraft&&analysis?previewImage2Prompt({draft:promptDraft,analysis,size:canvasSize,referenceRoles:promptDraft.editInstruction?promptDraft.referenceRoles:buildReferenceRoles({references:taskAssetIds.map(id=>({id})),uploads:taskReferences,baseKind:promptDraft.editBaseVersionId?'edit':extensionSourceImage?'parent':undefined,referencePlan:promptDraft.referencePlan,creativity:promptDraft.creativity}),referenceNotes:promptDraft.referenceNotes??[]}):null;

  return <main className="app-shell">
<aside className="sidebar">
<div className="brand">
<span className="brand-mark">
<Layers3 size={18} />
</span>
<span>视觉套系库</span>
</div>
<p className="workspace-label">造品平台 · 内部设计资产</p>
<nav className="main-nav" aria-label="主导航">
<button className={view === "create" ? "nav-active" : ""} onClick={() => setView("create")}>
<WandSparkles size={17} />创建设计</button>
<button className={view === "import" ? "nav-active" : ""} onClick={() => setView("import")}>
<FolderUp size={17} />导入套系</button>
<button className={view === "review" ? "nav-active" : ""} onClick={() => setView("review")}>
<ClipboardCheck size={17} />审核队列{reviewQueue.length > 0 && <span className="nav-count">{reviewQueue.length}</span>}</button>
</nav>
<div className="sidebar-divider" />
<p className="sidebar-section-title">项目库</p>
<label className="mobile-project-picker">项目库<select aria-label="打开项目库" value={view==='projects'?selectedProjectId:''} onChange={event=>{if(event.target.value){setSelectedProjectId(event.target.value);setView('projects');}}}><option value="">选择项目</option>{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
<div className="project-nav">{projects.map((project) => <button className={selectedProjectId === project.id && view === "projects" ? "nav-active" : ""} key={project.id} onClick={() => { setSelectedProjectId(project.id); setView("projects"); }}>
<span>{project.name}</span>
<small>{project.suites.length}</small>
</button>)}</div>
<div className="sidebar-footer">
<div className="sidebar-index-count" aria-live="polite"><span>{archiveStatus?`${archiveStatus.indexed} 已索引素材`:'索引统计加载中'}</span>{archiveStatus&&<small>{archiveStatus.total} 已上传 · {archiveStatus.searchable} 可检索</small>}{archiveStatusError&&<small>统计更新失败，正在重试</small>}</div>
<button title="切换深浅模式" className="icon-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button>
</div>
</aside>
    <section className="content">
<header className="topbar">
        <div>
<p className="eyebrow">VISUAL SUITE ARCHIVE</p>
<h1>{view === "create" ? "创建设计" : view === "import" ? "导入视觉套系" : view === "review" ? "审核队列" : selectedProject?.name ?? "项目库"}</h1>
</div>{view === "projects" && <button className="button button-primary" onClick={() => setView("import")}>
<FolderUp size={16} />导入套系</button>}</header>{libraryError && <div className="notice" role="status">{libraryError}</div>}{message && <div className="notice" role="status">{message}</div>}
      {view === "create" && <section className={`create-view ${mainVisual && !activeModuleId ? "board-focus" : ""}`}>
<div className="create-intro">
<div>
<p className="eyebrow">DESIGN PIPELINE</p>
<h2>{extensionParentTaskId ? `创建延展物料${activeModuleId ? ` · ${extensionModules.find((module) => module.id === activeModuleId)?.name ?? ""}` : ""}` : "先生成礼盒封面主视觉"}</h2>
<p>{extensionParentTaskId ? "当前模块独立维护需求、提示词、画幅、参考图和历史版本，同时自动继承主视觉作为图生图底图。" : "第一步固定生成礼盒封面主视觉；确认后再按模块生成课程卡、说明卡、挂图等延展物料。"}</p>
</div>
<div className="pipeline-status">
<Badge tone="info">{textModel}</Badge>
{referenceMode==='catalog'&&<Badge tone="info">CLIP 检索</Badge>}

<Badge tone="success">gpt-image-2</Badge>
</div>
</div>
<TextModelPicker value={textModel} disabled={Boolean(loading)} onChange={changeTextModel}/>
<section className="work-card brief-card">
<div className="card-heading">
<div>
<p className="eyebrow">01 · 设计需求</p>
<h2>{extensionParentTaskId ? "描述这个延展模块" : "描述礼盒封面主视觉"}</h2>
</div>{analysis && <Badge tone="success">已解析</Badge>}</div>
<textarea className="brief-input" value={brief} disabled={Boolean(loading)} onChange={(event) => { setBrief(event.target.value);setAnalysis(null);resetWorkflow(); }} placeholder={extensionParentTaskId ? "模块用途、内容、版式和尺寸要求" : "年级、学科、礼盒封面用途、视觉气质、色彩和禁用内容"} />
<WorkflowButton className="button button-primary" onClick={analyseAndRetrieve} disabled={Boolean(loading)||!brief.trim()} busy={loading==='analyse'} loadingText="正在分析需求…" icon={<Search size={16}/>}>分析设计需求</WorkflowButton>
<WorkflowFeedback busy={loading==='analyse'} title={`${textModel} 正在分析设计需求`} detail="提炼设计方向、风格关键词与检索条件。"/>

{analysis&&<DirectionReview onNone={startNoReferenceBranch} noneReady={Boolean(referenceMode==='none'?task:branchDrafts.current.none?.task)} mode={referenceMode} catalogReady={Boolean(referenceMode==='catalog'?(task||candidates.length):(branchDrafts.current.catalog?.task||branchDrafts.current.catalog?.candidates.length))} uploadReady={Boolean(referenceMode==='upload'?task:branchDrafts.current.upload?.task)} analysis={analysis} supplement={supplement} onSupplement={setSupplement} loading={loading} confirmed={briefConfirmed} onRevise={reviseBrief} onRetrieve={()=>confirmAndRetrieve()} onUpload={startUploadBranch}/>}
{analysisError&&<div className="step-error" role="alert">{analysisError}<button className="button button-secondary" onClick={analysis?supplement.trim()?reviseBrief:referenceMode==='upload'?startUploadBranch:referenceMode==='none'?startNoReferenceBranch:()=>confirmAndRetrieve(true):analyseAndRetrieve} disabled={Boolean(loading)}><RefreshCw size={14}/>重试</button></div>}
</section>{analysis && referenceMode==='catalog' && <section className="analysis-strip">
<span>物料：<b>{materialNames[analysis.materialType] ?? analysis.materialType}</b>
</span>
<span>对象：<b>{analysis.grade} · {analysis.subject}</b>
</span>
<span>检索：<b>{analysis.searchQuery}</b>
</span>
</section>}{referenceMode==='catalog'&&<ArchiveCoverage status={candidates.length?null:archiveStatus}/>}{referenceMode==='upload'&&task?.reference_source==='upload'&&!report&&<section id="upload-branch" className="work-card upload-branch"><div className="card-heading"><div><p className="eyebrow">02 · 独立上传</p><h2>确认本次参考图</h2></div><Badge>无需套系检索</Badge></div>{uploadPanel}<WorkflowButton className="button button-primary" onClick={confirmUploadBranch} disabled={Boolean(loading)||!taskReferences.length||unsavedReferenceNotes} busy={loading==='report'||loading==='confirm-uploads'} loadingText={loading==='report'?'正在生成参考报告…':'正在确认参考图…'} icon={<Check size={16}/>}>确认上传参考并继续</WorkflowButton>{task.status==='REFERENCE_CONFIRMED'&&<p className="upload-stage-note"><Check size={14}/>参考图已确认；重试只继续生成报告。</p>}{unsavedReferenceNotes&&<p>请先保存图片的使用说明。</p>}<WorkflowFeedback busy={loading==='report'||loading==='confirm-uploads'} title={loading==='report'?`${textModel} 正在生成参考报告`:`${textModel} 正在识别参考图`} detail={loading==='report'?'图片已确认，本步只整合设计方向与参考规则。':'识别图片的字体、卖点与构图结构。'} error={reportError}/></section>}{referenceMode==='catalog'&&task&&task.reference_source!=='upload'&&!report&&!candidates.length&&<section className="work-card"><h2>继续当前参考任务</h2><WorkflowButton className="button button-primary" onClick={confirmReferences} disabled={Boolean(loading)} busy={loading==='report'}>重新生成参考报告</WorkflowButton><WorkflowFeedback busy={loading==='report'} title={`${textModel} 正在整理参考报告`} error={reportError}/></section>}{referenceMode==='catalog'&&candidates.length > 0 && <section className="work-card candidates-card">
<div className="card-heading">
<div>
<p className="eyebrow">02 · 视觉套系</p>
<h2>按匹配程度选择主参考与辅助素材</h2>
</div>
<div className="candidate-tools"><Badge tone="success">正式索引</Badge><button type="button" className="button button-secondary" disabled={Boolean(loading)} onClick={()=>confirmAndRetrieve(true)}><RefreshCw size={14}/>重新检索</button></div>
</div>
<ArchiveCoverage status={archiveStatus}/><small className="candidate-hint">已按匹配度从强到弱排列，最多展示 3 个视觉套系。</small>
<div className="candidate-grid">{candidates.map((candidate, index) => <button disabled={Boolean(loading)} className={`candidate-card ${index === candidateIndex ? "selected" : ""}`} key={candidate.suiteId} onClick={() => chooseCandidate(index)}>
<AssetImage asset={candidate.primary} />
<span>
<b>{candidate.suiteName}</b>
<small>{candidate.projectName} · 匹配 {candidate.score}</small>
<small className="reference-match-notes">{candidate.matchReasons.join('；')}</small>
</span>
<Check size={16} />
</button>)}</div>{selectedCandidate && <div className="reference-row">
<div className="primary-reference">
<p>主参考</p>
<AssetImage asset={selectedCandidate.primary} />
<span>{materialNames[selectedCandidate.primary.materialType]} · {selectedCandidate.primary.filename}</span>
{selectedCandidate.primary.adaptationNotes&&<p className="reference-match-notes">需改造：{selectedCandidate.primary.adaptationNotes}</p>}
</div>
<div className="helper-reference">
<p>辅助参考，最多 2 张</p>
<div>{selectedCandidate.helpers.map((asset) => <button disabled={Boolean(loading)} className={helperIds.includes(asset.id) ? "helper-picked" : ""} key={asset.id} onClick={() => toggleHelper(asset.id)}>
<AssetImage asset={asset} />
<span>{materialNames[asset.materialType]}</span>
{asset.adaptationNotes&&<small>需改造：{asset.adaptationNotes}</small>}
</button>)}</div>
</div>
</div>}<WorkflowButton className="button button-primary" onClick={confirmReferences} disabled={Boolean(loading) || Boolean(report)} busy={loading==='report'} error={Boolean(reportError)} errorText="重试生成报告" loadingText="正在生成参考报告…" icon={<FileCheck2 size={16}/>}>确认参考并生成报告</WorkflowButton>
<WorkflowFeedback busy={loading==='report'} title={`${textModel} 正在整理参考报告`} detail="结合已确认方向和参考图，提炼可采用的视觉语言。" error={reportError}/>
</section>}{report && <section className="work-card report-card">
<div className="card-heading">
<div>
<p className="eyebrow">03 · 参考与生图设置</p>
<h2>生成设置</h2>
</div>
<Badge tone="success">{report.model||textModel}</Badge>
</div>
<p className="reference-mode-caption">{referenceMode==='none'?'无参考创作':referenceMode==='upload'?'独立上传参考':'套系库参考'} · 以下设置用于本次生成</p><details className="generation-report-details"><summary>查看参考方案 · 设计方向与复用边界</summary><ReferenceReportView report={report}/></details>
{referenceMode!=='none'&&<fieldset className="creativity-picker" disabled={Boolean(loading)}><legend>整体创作自由度</legend><div>{Object.entries(creativityModes).map(([value,mode])=><button type="button" aria-pressed={creativity===value} key={value} onClick={()=>{setCreativity(value as Creativity);invalidatePrompt();}}><b>{mode.label}</b><small>{mode.description}</small></button>)}</div><p>配色优先级：需求指定色调 → 需求未指定时沿用参考配色 → 无参考时由 AI 配色。三个模式都遵循这一顺序，创作自由度不改变配色优先级。</p><div className="effective-policy" role="status"><Check size={15}/><span>{creativityModes[creativity].label} · {sellingType?`卖点锁定 ${sellingType}｜${SELLING_TYPES[sellingType]?.[0]}（优先执行）`:creativity==='exploratory'?'卖点由 AI 设计':creativity==='balanced'?'保留卖点单元，优化整组排列':'卖点跟随参考'}{sellingType&&<small>分类样图会一起传入生图，仅控制局部结构；卖点保持辅助层级，不按样图尺寸放大。</small>}</span>{sellingType&&<button type="button" className="button button-ghost" onClick={()=>changeSellingPolicy(sellingSourceId,'')}>解除分类锁定</button>}</div></fieldset>}
<fieldset className="size-picker" disabled={Boolean(loading)}><legend>画幅规格</legend>{canvasSizes.map((item) => <button type="button" key={item.value} className={canvasSize === item.value ? "size-active" : ""} onClick={() => changeCanvasSize(item.value)}>{item.label}<small>{item.value.replace('x',' × ')}</small></button>)}</fieldset>
<div className="selling-policy"><div><b>卖点排版</b><p>{sellingType?'已锁定所选分类；AI 可优化其余未指定部分。':referenceMode==='none'?'按本次文案自主设计排版；也可指定下方分类。':creativity==='exploratory'?'允许设计新的卖点排版；文案条数与内容保持不变。':creativity==='balanced'?'保留卖点单元形态，允许优化整组位置和排列。':'保留参考图结构，仅替换文案并适配条数。'}</p></div>{referenceMode!=='none'&&<label>参考来源<select aria-label="参考来源" disabled={Boolean(loading)} value={sellingSourceId||(task?.reference_source==='upload'?taskReferences[0]?.id:taskAssets[0]?.id)||''} onChange={event=>changeSellingPolicy(event.target.value,sellingType)}>{task?.reference_source==='upload'&&taskReferences.map(ref=><option key={ref.id} value={ref.id}>{uploadRoleNames[ref.role]} · {ref.filename}</option>)}{taskAssets.map((asset,index)=><option key={asset.id} value={asset.id}>{index===0?'主参考':'辅助参考'} · {asset.displayName}</option>)}</select></label>}<label>卖点结构<select aria-label="卖点结构" disabled={Boolean(loading)} value={sellingType} onChange={event=>changeSellingPolicy(sellingSourceId,event.target.value)}><option value="">{creativity==='exploratory'?'由 AI 设计，不锁定分类':'继承所选图片的实际排版'}</option>{Object.entries(SELLING_TYPES).map(([id,[name]])=><option key={id} value={id}>{id} · {name}</option>)}</select></label>{sellingType&&<figure className="selling-example"><img src={`/selling-layouts/${sellingType}.png`} alt={`${sellingType} 类卖点结构示例`}/><figcaption>{SELLING_TYPES[sellingType]?.[1]}。生图会附带此样图，仅参考结构，替换文字与配色。</figcaption></figure>}</div>
{referenceMode!=='none'&&<aside className="generation-references">
<b>本次生图参考图</b>
<small>在组合提示词之前上传。需要特定角色时选「封面 IP」：角色图决定身份，套系图提供风格与排版。</small>
<div className={`reference-columns ${task?.reference_source==='upload'&&!extensionSourceImage&&!promptDraft?.editBaseVersionId?'reference-columns-single':''}`}>{(task?.reference_source!=='upload'||extensionSourceImage||promptDraft?.editBaseVersionId)&&<section><h3>{task?.reference_source==='upload'?'独立参考创作':'已选套系参考'}</h3><p>提供风格、标题和卖点排版，不替代右侧上传的 IP。</p><div className="reference-thumbnails">{promptDraft?.editBaseVersionId&&generatedImage?<figure><img src={`/api/generated/versions/${promptDraft.editBaseVersionId}`} alt="改图底图"/><figcaption>所选历史版本 · 改图底图</figcaption></figure>:extensionParentTaskId && extensionSourceImage && <figure><img src={extensionSourceImage} alt="已生成主视觉" /><figcaption>父任务主视觉 · 自动参考</figcaption></figure>}{taskAssets.map((asset,index) => <figure key={asset.id}><AssetImage asset={asset} /><figcaption>{index===0?'主参考':'辅助参考'} · {asset.displayName}{asset.id===(promptDraft?.referencePlan?.sellingSourceId||taskAssetIds[0])?' · 卖点结构来源':''}</figcaption></figure>)}</div></section>}{uploadPanel}</div></aside>}
<WorkflowButton className="button button-primary" onClick={()=>createPrompt()} disabled={Boolean(loading)} busy={loading==='prompt'} error={Boolean(promptError)} loadingText="正在组装提示词…" errorText="重试组装提示词" icon={<WandSparkles size={16}/>}>{promptDraft?'查看已生成提示词':'组装生图提示词'}</WorkflowButton>
{promptDraft&&<button type="button" className="button button-secondary" disabled={Boolean(loading)} onClick={()=>createPrompt(true)}>重新组合提示词</button>}
<WorkflowFeedback busy={loading==='prompt'} title={`${textModel} 正在组装生图提示词`} detail="整合设计方向、参考视觉规则与画幅；返回后会自动展开编辑区。" error={promptError} success={promptDraft?'提示词已生成并保存，可继续编辑和确认。':undefined}/>
{promptDraft && <section ref={promptPanel} tabIndex={-1} className="prompt-card embedded-prompt" aria-label="生图提示词编辑区">
<div className="card-heading">
<div>
<p className="eyebrow">04 · 提示词确认</p>
<h2>确认提示词后生成</h2>
</div>
<Badge tone="warning">{canvasSizes.find(item=>item.value===canvasSize)?.label} · 待确认</Badge>
</div>
<div className="prompt-workspace prompt-single">
{finalPromptPreview&&<FinalPrompt text={finalPromptPreview.prompt} length={finalPromptPreview.length}/>}

</div>
<div className="generation-actions"><StatefulButton className="button button-primary" state={generationState} loadingText="正在生成…" successText="再次生成" errorText="重试生图" icon={<ImageIcon size={16}/>} onClick={generate} disabled={Boolean(loading)||Boolean(finalPromptPreview&&finalPromptPreview.length>2000)}>确认并生图</StatefulButton>{generatedImage && activeModuleId && <button className="button button-secondary" type="button" onClick={() => setRevisionOpen(true)}><Edit3 size={15} />修改当前物料</button>}</div>
{generatedImage&&extensionParentTaskId&&<section className="generated-result"><div className="result-toolbar"><b>模块生成结果</b><span>{canvasSizes.find(item=>item.value===canvasSize)?.label}</span></div><img className="generated-image" src={generatedImage} alt="生成的设计视觉"/></section>}
</section>}</section>}
<WorkflowFeedback busy={generationState==='loading'} title="正在生成设计图片" detail={generationFeedback} variant="comet" error={generationState==='error'?generationFeedback:undefined} success={generationState==='success'?generationFeedback:undefined}/>
{mainVisual && <section className="visual-suite-board">
<div className="board-heading"><div><p className="eyebrow">VISUAL SUITE WORKBENCH</p><h2>主视觉与延展物料</h2><p>先确认礼盒封面，再按模块逐个延展；每个模块都可单独参考、改图和保留版本。</p></div><Badge tone={mainVisualConfirmed ? "success" : "warning"}>{mainVisualConfirmed ? "主视觉已确认" : "待确认主视觉"}</Badge></div>
<article className="hero-visual-card">
<div className="hero-visual-image"><img src={mainVisual.image} alt="礼盒封面主视觉" /><span><Badge tone="success">主视觉</Badge></span></div>
<div className="hero-visual-copy"><div className="result-toolbar"><b>礼盒封面 · 当前版本</b><span>{canvasSizes.find((item) => item.value === mainVisual.size)?.label}</span></div><div className="hero-actions"><DownloadImage versionId={mainVisual.versionId}/><WorkflowButton className="button button-primary" busy={loading==='confirm-main'} loadingText="正在确认版本…" onClick={confirmMainVisual} disabled={Boolean(loading)||mainVisualConfirmed||!mainVisual.versionId} icon={<Check size={14}/>}>{mainVisualConfirmed?'已确认参考':'确认主视觉参考'}</WorkflowButton><button className="button button-secondary" disabled={Boolean(loading)||!mainVisual.versionId} onClick={()=>openMainEditor(true)}><Edit3 size={14}/>修改这个版本</button></div>
{mainVersions.length>0&&<div className="version-history unified-history"><div className="version-history-head"><b>历史版本 · {mainVersions.length}</b><small>点选预览，再下载或确认为延展参考</small></div><div className="version-history-grid">{mainVersions.map((version,index)=><div className="version-entry" key={version.id}><button type="button" className={`version-item ${mainVisual.versionId===version.id?'version-selected':''}`} disabled={!version.imageUrl||Boolean(loading)} aria-pressed={mainVisual.versionId===version.id} onClick={()=>selectMainVersion(version)}><span>V{mainVersions.length-index}</span>{version.imageUrl?<img src={version.imageUrl} alt={`历史版本 ${mainVersions.length-index}`}/>:<div className="asset-placeholder">生成失败</div>}<small>{version.size}</small></button></div>)}</div></div>}
{mainVisual.prompt && <details><summary>当前提示词</summary><pre>{mainVisual.prompt.prompt}</pre><button className="button button-ghost" disabled={Boolean(loading)} onClick={()=>openMainEditor()}><Edit3 size={14}/>编辑提示词</button></details>}</div>
</article>
<div className="extension-board-heading"><div><h3>延展物料模块</h3><small>每个模块独立运行需求分析 → 检索 → 提示词 → 生图链路；检索时自动排除礼盒。</small></div></div>
<div className="extension-grid">{extensionModules.map((module) => <article className={`extension-module-card ${activeModuleId === module.id ? "module-active" : ""}`} key={module.id}>
<div className="module-image">{module.image ? <img src={module.image} alt={module.name} /> : <div><Plus size={22} /><span>待生成</span></div>}<Badge tone={module.status === "GENERATED" ? "success" : "info"}>{module.status === "GENERATED" ? "已生成" : "待设计"}</Badge></div>
<div className="module-copy">{module.image&&<DownloadImage versionId={module.versions?.find(version=>version.imageUrl===module.image)?.id}/>}<div className="result-toolbar"><b>{module.name}</b><span>{canvasSizes.find((item) => item.value === module.size)?.label}</span></div><p>{module.brief}</p><small className="module-version-count">{module.versions?.length ? `已有 ${module.versions.length} 个历史版本` : "尚无历史版本"}</small><button className="button button-primary" type="button" onClick={() => openExtension(module)}><WandSparkles size={14} />{module.status === "GENERATED" ? "继续编辑" : "开始设计"}</button>{module.image && <button className="button button-secondary" type="button" onClick={() => openExtension(module,true)}><Edit3 size={14} />改图</button>}</div>
</article>)}<article className="extension-module-card add-module-card"><div><Plus size={28} /><b>新增延展模块</b><small>课程卡、说明卡、挂图、手册等</small></div><input value={extensionName} onChange={(event) => setExtensionName(event.target.value)} placeholder="模块名称" /><textarea value={extensionBrief} onChange={(event) => setExtensionBrief(event.target.value)} placeholder="用途与画面要求（可选）" /><button className="button button-secondary" type="button" onClick={beginExtension}><Plus size={14} />添加模块并开始设计</button></article></div>
</section>}
{revisionOpen && <div className="preview-modal" role="dialog" aria-modal="true" aria-label="修改生成图片">
  <div className="revision-dialog">
    <button className="icon-button preview-close" title="关闭" disabled={Boolean(loading)} onClick={() => {setRevisionOpen(false);setRevisionError('');}}><X size={18} /></button>
    <h2>修改当前图片</h2>
    <div className="revision-modes" role="group" aria-label="改图方式">
      <button type="button" disabled={Boolean(loading)} aria-pressed={revisionMode==='direct'} onClick={()=>{setRevisionMode('direct');setRevisionError('');}}><Edit3 size={14}/>直接改图</button>
      <button type="button" disabled={Boolean(loading)} aria-pressed={revisionMode==='terra'} onClick={()=>{setRevisionMode('terra');setRevisionError('');}}><WandSparkles size={14}/>重组提示词</button>
    </div>
    <p>{revisionMode==='direct'?'发送下方底图＋本次修改意见，可另加本次专用参考。沿用底图尺寸，不自动混入旧参考。':'由所选文本模型结合原设计上下文重组提示词，再确认生图。本次专用参考不参与重组；整体参考请在项目参考区设置。'}</p>
    {generatedImage && <img className="revision-image" src={generatedImage} alt="待修改的生成结果" />}
    {revisionMode==='direct'&&<section className="edit-reference-panel">
      <b>本次专用参考 · 可选</b>
      <div className="edit-reference-options"><select aria-label="本次参考用途" value={editRefRole} disabled={Boolean(loading)} onChange={event=>setEditRefRole(event.target.value as typeof editRefRole)}><option value="style">色彩 / 风格</option><option value="character">人物 / IP</option><option value="layout">排版结构</option></select><input aria-label="本次参考说明" value={editRefNote} maxLength={180} disabled={Boolean(loading)} onChange={event=>setEditRefNote(event.target.value)} placeholder="例如：只借鉴这张图的边框"/></div>
      <label className="button button-secondary"><Plus size={14}/>{loading==='edit-upload'?'正在上传…':'添加本次参考图'}<input className="visually-hidden" aria-label="上传本次改图参考" type="file" accept="image/png,image/jpeg,image/webp" disabled={Boolean(loading)||editRefs.length>=3} onChange={event=>{void uploadEditReference(event.target.files?.[0]);event.target.value='';}}/></label>
      <div className="edit-reference-list">{editRefs.map((ref,index)=><figure key={ref.id}><img src={ref.url} alt={`本次参考图${index+2}`}/><figcaption>图{index+2} · {uploadRoleNames[ref.role]}<small>{ref.note||ref.filename}</small></figcaption><button className="icon-button" title={`移除本次参考图${index+2}`} disabled={Boolean(loading)} onClick={()=>setEditRefs(current=>current.filter(item=>item.id!==ref.id))}><X size={14}/></button></figure>)}</div>
    </section>}
    <label className="revision-instruction">本次修改意见
      <textarea rows={3} disabled={Boolean(loading)} value={revisionInstruction} onChange={(event) => setRevisionInstruction(event.target.value)} placeholder="例如：底部卖点缩小一些，标题和人物保持不变。" />
    </label>
    {revisionMode==='direct'&&<small className="revision-hint">{Array.from(revisionInstruction.trim()).length} / 300 字 · 未提到的部分保持不变</small>}
    <WorkflowButton className="button button-primary" onClick={revisePrompt} disabled={!revisionInstruction.trim() || Boolean(loading) || (revisionMode==='direct'&&Array.from(revisionInstruction.trim()).length>300)} busy={loading==='revise'||loading==='image'} loadingText={revisionMode==='direct'?'正在修改图片…':'正在重组提示词…'} error={Boolean(revisionError)} errorText={revisionMode==='direct'?'重试改图':'重试修改提示词'} icon={<WandSparkles size={16}/>}>{revisionMode==='direct'?'确认修改并生成':'重新组合提示词'}</WorkflowButton>
    <WorkflowFeedback busy={loading==='revise'||loading==='image'} title={revisionMode==='direct'?'正在修改所选底图':`${textModel} 正在重组提示词`} detail={revisionMode==='direct'?'完成后保存为新版本，原图保留。通常需要几分钟，请勿重复提交。':'最多等待60秒；超时后可重试，或改用直接改图。'} error={revisionError}/>
  </div>
</div>}</section>}
      {view === "import" && <section className="import-view">
<div className="import-intro">
<FileArchive size={24} />
<div>
<h2>一个 ZIP 对应一个视觉套系</h2>
<p>系统自动取 ZIP 文件名作为项目名称和初始套系名称。ZIP 内的封面、礼盒、说明书、挂图会保持同一套系关系，AI 只补充逐图标签与描述。</p>
</div>
</div>
<form className="work-card import-form" onSubmit={uploadArchive}>
<div className="card-heading">
<div>
<p className="eyebrow">导入套系</p>
<h2>选择 ZIP 套系包</h2>
</div>
</div>
<label className="file-drop">
<input ref={archiveInput} type="file" accept=".zip,application/zip" onChange={(event) => selectImportFile(event.target.files?.[0] ?? null)} />
<span className="file-icon">
<FolderUp size={22} />
</span>
<b>{importFile ? importFile.name : "选择 ZIP 套系包"}</b>
<small>{importFile ? `将自动归档为「${suiteNameFrom(importFile.name)}」 · ${Math.ceil(importFile.size / 1024 / 1024)} MB` : "PNG、JPEG、WebP 将生成预览；AI/PDF 原文件会安全保存，等待补预览。"}</small>
</label>
<WorkflowButton className="button button-primary" type="submit" disabled={Boolean(loading)} busy={loading==='upload'} loadingText="正在上传套系…" icon={<FolderUp size={16}/>}>导入并开始识别</WorkflowButton>
<WorkflowFeedback busy={loading==='upload'} title="正在上传并创建导入批次" detail="上传完成后可在下方查看逐文件的识别状态。" variant="bars"/>
</form>
<section className="batch-list">
<div className="section-title">
<div>
<p className="eyebrow">IMPORT HISTORY</p>
<h2>套系导入记录</h2>
</div>
</div>{batches.length === 0 ? <div className="empty-panel">尚无导入记录</div> : batches.map((batch) => <article className="batch-row" key={batch.id}>
<span className="batch-icon">
<FileArchive size={18} />
</span>
<div>
<b>{batch.suite_name ?? suiteNameFrom(batch.original_filename)}</b>
<small>{batch.project_name ?? "未指定项目"} · {batch.total} 个素材 · {batch.pending} 待审核 · {batch.failed} 失败</small>{batch.error_message && <em>{batch.error_message}</em>}</div>
<Badge tone={batch.status === "FAILED" ? "warning" : batch.status === "AWAITING_REVIEW" ? "success" : "info"}>{batchStatusLabel(batch.status)}</Badge>{(batch.status === "FAILED" || Number(batch.failed) > 0) && <button className="button button-secondary" onClick={() => retryBatch(batch.id)} disabled={loading === `retry-${batch.id}`}>重试</button>}</article>)}</section>
</section>}
      {view === "projects" && <section className="projects-view">
        <section className="stat-row">
<div>
<span>
<Archive size={18} />
</span>
<b>{selectedProject?.suites.length ?? 0}</b>
<small>视觉套系</small>
</div>
<div>
<span>
<ImageIcon size={18} />
</span>
<b>{selectedProject?.suites.reduce((count, suite) => count + suite.assets.length, 0) ?? 0}</b>
<small>归档素材</small>
</div>
<div>
<span>
<ClipboardCheck size={18} />
</span>
<b>{reviewQueue.filter((asset) => asset.projectId === selectedProject?.id).length}</b>
<small>待审核</small>
</div>
<div>
<span>
<Sparkles size={18} />
</span>
<b>{assets.filter((asset) => asset.projectId === selectedProject?.id && asset.embeddingStatus === "READY").length}</b>
        <small>正式可检索</small>
        </div>
        </section>
        <div className="library-toolbar">
          <div className="library-selection"><button className="button button-secondary" onClick={toggleSelectAll} disabled={!selectedProjectAssets.length}>{allProjectAssetsSelected ? <CheckSquare size={15} /> : <Square size={15} />}{allProjectAssetsSelected ? "取消全选" : "全选项目素材"}</button><span>{selectedAssetIds.length ? `已选 ${selectedAssetIds.length} 项` : "可批量管理当前项目素材"}</span></div>
          <button className="button button-danger" onClick={deleteSelectedAssets} disabled={!selectedAssetIds.length || loading === "delete-assets"}>{loading === "delete-assets" ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}删除已选</button>
        </div>
        {selectedProject?.suites.map((suite) => <section className="suite-block" key={suite.id}>
<div className="section-title">
<div>
<p className="eyebrow">VISUAL SUITE</p>
<h2>{suite.name}</h2>
</div>
<span>{suite.assets.length} 个关联物料</span>
</div>
<div className="asset-grid">{suite.assets.map((asset) => <article className="asset-card" key={asset.id}>
<div className="asset-thumb">
<label className="asset-select"><input type="checkbox" checked={selectedAssetIds.includes(asset.id)} onChange={() => toggleAssetSelection(asset.id)} aria-label={`选择 ${asset.displayName}`} /></label>
<button className="preview-trigger" title="放大预览" onClick={() => setPreviewAsset(asset)}>
<AssetImage asset={asset} />
<Maximize2 size={16} />
</button>{asset.isPrimary && <span className="primary-mark">
<BadgeCheck size={13} />主参考</span>}</div>
<div className="asset-info" onClick={(event) => { if (!(event.target as HTMLElement).closest("button")) setDetailAssetId(asset.id); }}>
<div className="asset-name">
<button className="asset-detail-trigger" onClick={() => setDetailAssetId(asset.id)} aria-label={`查看 ${asset.displayName} 全部信息`}>
<b>{asset.displayName}</b>
</button>
<button title="重命名素材" className="asset-rename" onClick={() => renameAsset(asset)} disabled={loading === `rename-${asset.id}`}>
<Pencil size={12} />
</button>
</div>
<small>{materialNames[asset.materialType]} · 源文件：{asset.filename}</small>
<Badge tone={asset.embeddingStatus === "FAILED" || asset.analysisStatus === "FAILED" ? "warning" : asset.embeddingStatus === "READY" ? "success" : asset.reviewState === "CONFIRMED" ? "info" : "neutral"}>{embeddingLabel(asset)}</Badge>{asset.reviewState === "CONFIRMED" && asset.embeddingStatus === "FAILED" && <button className="asset-retry" onClick={() => retryEmbedding(asset)} disabled={loading === `reindex-${asset.id}`}>
<RefreshCw size={11} />{loading === `reindex-${asset.id}` ? "重试中" : "重试向量化"}</button>}{asset.reviewState === "CONFIRMED" && <button className="asset-retry" onClick={() => reopenAsset(asset)} disabled={loading === `reopen-${asset.id}`}>
<Pencil size={11} />{loading === `reopen-${asset.id}` ? "处理中" : "重新审核"}</button>}{asset.analysisStatus === "FAILED" && <>
<small className="asset-error">{asset.errorMessage?.includes("timeout") ? "AI 响应超时，可重试" : "AI 网关拒绝了本次图片识别，可重试或人工补录"}</small>
<button className="asset-retry" onClick={() => retryAsset(asset)} disabled={loading === `retry-asset-${asset.id}`}>
<RefreshCw size={11} />{loading === `retry-asset-${asset.id}` ? "重试中" : "重试识别"}</button>
</>}{asset.embeddingStatus.startsWith("PROCESSING") && <progress className="embedding-progress" aria-label={embeddingLabel(asset)} />}{asset.embeddingStatus === "FAILED" && <small className="asset-error">{asset.errorMessage || "向量化失败，请重试"}</small>}</div>
</article>)}</div>
</section>)}
      </section>}
      {view === "review" && <section className="review-view"><UnifiedReview assets={assets} onRefresh={loadLibrary}/></section>}
    </section>
<dialog ref={detailDialog} className="asset-detail-dialog" onClose={() => setDetailAssetId("")} onClick={(event) => { if (event.target === event.currentTarget) setDetailAssetId(""); }} aria-label="素材完整信息">
{detailAsset && <div className="asset-detail-body"><header><h2>{detailAsset.displayName}</h2><button className="icon-button" title="关闭详情" onClick={() => setDetailAssetId("")}><X size={18} /></button></header>
<AssetImage asset={detailAsset} className="detail-image" />
<Badge tone={detailAsset.embeddingStatus === "READY" ? "success" : "info"}>{embeddingLabel(detailAsset)}</Badge>
<p>{detailAsset.visualRevisionId?'视觉规则 v1':'旧版规则'}</p>
{detailAsset.visualProfile&&<section><h3>已发布视觉档案</h3><VisualProfileView profile={detailAsset.visualProfile}/></section>}
{detailAsset.adaptationNotes&&<p className="preserve-text">改造要求：{detailAsset.adaptationNotes}</p>}
{detailAsset.embeddingStatus.startsWith("PROCESSING") && <progress className="embedding-progress" aria-label={embeddingLabel(detailAsset)} />}
<dl>{Object.entries({ "素材 ID": detailAsset.id, "来源文件": detailAsset.filename, "项目": detailAsset.projectName, "视觉套系": detailAsset.suiteName, "物料类型": materialNames[detailAsset.materialType], "年级": detailAsset.grade, "学科": detailAsset.subject, "主要色彩": detailAsset.colors.join("、"), "标签": detailAsset.tags.join("、"), "视觉风格": detailAsset.visualStyle, "版式特征": detailAsset.layoutFeatures, "核心元素": detailAsset.coreElements.join("、"), "OCR 全文": detailAsset.ocrText, "设计描述": detailAsset.description, "复用状态": reuseNames[detailAsset.reuseState], "审核状态": detailAsset.reviewState === "CONFIRMED" ? "已确认" : "待审核", "主参考": detailAsset.isPrimary ? "是" : "否", "AI 置信度": detailAsset.confidence == null ? null : `${Math.round(detailAsset.confidence * 100)}%`, "失败原因": detailAsset.errorMessage }).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "未标注"}</dd></div>)}</dl>
</div>}
</dialog>{previewAsset && <div className="preview-modal" role="dialog" aria-modal="true" aria-label={`${previewAsset.displayName} 放大预览`} onClick={() => setPreviewAsset(null)}>
<div className="preview-modal-content" onClick={(event) => event.stopPropagation()}>
<button className="icon-button preview-close" title="关闭预览" onClick={() => setPreviewAsset(null)}>
<X size={18} />
</button>
<AssetImage asset={previewAsset} />
<div>
<b>{previewAsset.displayName}</b>
<small>源文件：{previewAsset.filename}</small>
</div>
</div>
</div>}</main>;
}
