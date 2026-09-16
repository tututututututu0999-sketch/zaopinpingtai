export const GENERATION_RULE_VERSION:string;
export const MAX_GENERATION_CHARS:number;
export type Creativity='faithful'|'balanced'|'exploratory';
export const creativityModes:Record<Creativity,{label:string;description:string}>;
export function normalizeCreativity(value?:unknown):Creativity;
export function creativityInstruction(value:Creativity,sellingType?:string):string;
export function promptLength(value?:string):number;
export interface ReferencePlan {sellingSourceId:string;sellingType:string;sellingInstruction:string;sellingRuleVersion?:string}
export function buildReferencePlan(references:{id:string;profile:import('./v1/index.mjs').VisualProfile|null}[],options?:{sellingSourceId?:string;sellingType?:string;creativity?:Creativity;allowEmpty?:boolean}):ReferencePlan;
export function generationPromptBudget(input:{analysis:{hardConstraints:{operator:string;value:string}[];mustAvoid:string[]};size:string;referencePlan?:ReferencePlan;referenceNotes?:string[];referenceRoles?:string[];creativity?:Creativity}):number;
export const canvasSizes:{value:string;label:string}[];
export function normalizeImageSize(size?:string):string;
export const REPORT_PROMPT:string;
export const IMAGE_PROMPT:string;
export function validReport(report:unknown):boolean;
export type AssemblyInput={draft:{prompt:string;negativePrompt?:string;referencePlan?:ReferencePlan;creativity?:Creativity;revisionMode?:'direct'|'terra';editInstruction?:string;revisionInstruction?:string};analysis:{designDirection:string;originalBrief?:string;supplements?:string[];generationConstraints?:import('./v1/index.mjs').Constraint[];generationNotes?:string[];hardConstraints:{operator:string;value:string}[];mustAvoid:string[]};size:string;referenceNotes?:string[];referenceRoles?:string[]};
export function previewImage2Prompt(input:AssemblyInput):{prompt:string;length:number;limit:number};
export function assembleImage2Prompt(input:AssemblyInput):string;
