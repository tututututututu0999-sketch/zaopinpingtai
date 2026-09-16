import type { MaterialType } from "./types";

export interface BriefAnalysis {
  textModel?:string;
  draftId?:string;
  revision?:number;
  ruleVersion:string;
  usageScenario:string;
  productValue:string;
  emotionalValue:string;
  designDirection:string;
  designKeywords:string[];
  assumptions:string[];
  preferences:import('@/visual-rules/v1/index.mjs').Preferences;
  hardConstraints:import('@/visual-rules/v1/index.mjs').Constraint[];
  generationConstraints?:import('@/visual-rules/v1/index.mjs').Constraint[];
  generationNotes?:string[];
  supplements?:string[];
  constraintScopeVersion?:number;
  unsupportedConstraints:string[];
  originalBrief: string;
  materialType: MaterialType | "未指定";
  grade: string;
  subject: string;
  productLine: string;
  audience: string;
  intent: string;
  styleKeywords: string[];
  colorKeywords: string[];
  mustAvoid: string[];
  searchQuery: string;
  source: "luna";
}

export interface ReferenceReport {
  model?:string;
  referenceRevision?:number;
  summary: string;
  reasons: string[];
  reusableElements: string[];
  riskNotes: string[];
  source: "terra";
}

export interface PromptDraft {
  creativity?:import('@/visual-rules/generation.mjs').Creativity;
  referenceRoles?:string[];
  referenceNotes?:string[];
  compiledPrompt?:string;
  model?:string;
  referenceRevision?:number;
  revisionMode?:'direct'|'terra';
  revisionInstruction?:string;
  editInstruction?:string;
  editReferenceIds?:string[];
  editReferenceSnapshot?:import('./task-references').StoredReference[];
  rewriteContext?:{prompt:string;negativePrompt:string};
  size?:string;
  referencePlan?:import('@/visual-rules/generation.mjs').ReferencePlan;
  editBaseVersionId?:string;
  generationRuleVersion?:string;
  prompt: string;
  negativePrompt: string;
  source: "terra";
}
