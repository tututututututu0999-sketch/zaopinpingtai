import type {ReferencePlan,Creativity} from './generation.mjs';
export function editReferenceRoles(refs?:{role:'character'|'style'|'layout';note:string}[]):string[];
export function referenceInstruction(reference:{role:'character'|'style'|'layout';note:string}):string;
export function buildReferenceRoles(input:{references?:{id:string}[];uploads?:{id:string;role:'character'|'style'|'layout';note:string}[];baseKind?:'edit'|'parent';referencePlan?:ReferencePlan;creativity?:Creativity}):string[];
