import { createDesignTask } from "@/lib/design-tasks";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { brief?: string; analysis?: unknown; referenceAssetIds?: string[]; parentTaskId?: string;draftId?:string;revision?:number;referenceSource?:'catalog'|'upload'|'none';textModel?:string };
    if (!body.draftId || !body.revision || !Array.isArray(body.referenceAssetIds) || (!body.referenceAssetIds.length&&!['upload','none'].includes(body.referenceSource||'')) || (body.referenceSource&&!['catalog','upload','none'].includes(body.referenceSource))) return NextResponse.json({ error: "任务数据不完整" }, { status: 400 });
    return NextResponse.json(await createDesignTask({ brief: body.brief??'', analysis: body.analysis, referenceAssetIds: body.referenceAssetIds, parentTaskId: body.parentTaskId,draftId:body.draftId,revision:body.revision,referenceSource:body.referenceSource,textModel:body.textModel }), { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "创建设计任务失败" }, { status: 503 }); }
}
