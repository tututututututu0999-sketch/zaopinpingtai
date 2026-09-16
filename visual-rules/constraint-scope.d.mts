import type {Constraint,Preferences} from './v1/index.mjs';
export function constraintLabel(rule:Constraint):string;
export function isReferenceRequirement(evidence:string,source:string):boolean;
export function scopeBriefConstraints<T extends {originalBrief?:string;supplements?:string[];hardConstraints?:Constraint[];generationConstraints?:Constraint[];unsupportedConstraints?:string[];generationNotes?:string[];preferences?:Preferences}>(analysis:T):T & {constraintScopeVersion:2;hardConstraints:Constraint[];generationConstraints:Constraint[];generationNotes:string[];unsupportedConstraints:string[];preferences:Preferences};
export function referenceConstraintsForRole(constraints:Constraint[],role:string):Constraint[];
