import { reviewAsset, type ReviewInput } from "@/lib/archive";
import { NextResponse } from "next/server";

const materialTypes = new Set(["BOOK_COVER", "TITLE_PAGE", "GIFT_BOX", "PRODUCT_BOOKLET", "WALL_CHART", "OTHER"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json() as ReviewInput;
    if (!body || typeof body.projectName !== 'string' || typeof body.suiteName !== 'string' || typeof body.isPrimary !== 'boolean' || !materialTypes.has(body.materialType) || !Array.isArray(body.colors) || !Array.isArray(body.tags) || !Array.isArray(body.coreElements)) return NextResponse.json({ error: "审核字段无效，请检查项目、套系和物料类型" }, { status: 400 });
    return NextResponse.json(await reviewAsset((await params).id, body));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "保存审核失败" }, { status: 400 }); }
}
