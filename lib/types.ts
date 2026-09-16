export type MaterialType = "主书封面" | "扉页" | "礼盒" | "产品说明书" | "挂图";
export type ReviewStatus = "已确认" | "待确认";
export type ReuseStatus = "可复用" | "需改造" | "不可复用";

export interface Asset {
  id: string;
  projectId: string;
  suiteId: string;
  filename: string;
  collection: string;
  materialType: MaterialType;
  grade: string;
  subject: string;
  colors: string[];
  style: string;
  layout: string;
  elements: string[];
  ocr: string;
  description: string;
  reviewStatus: ReviewStatus;
  reuseStatus: ReuseStatus;
  isPrimary: boolean;
  relation: string;
  confidence: number;
}

export interface VisualSuite {
  id: string;
  projectId: string;
  name: string;
  productLine: string;
  summary: string;
  assets: Asset[];
}

export interface Project {
  id: string;
  name: string;
  productLine: string;
  grades: string;
  subjects: string[];
  suite: VisualSuite;
}
