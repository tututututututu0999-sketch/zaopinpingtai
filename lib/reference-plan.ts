import {buildReferencePlan} from '@/visual-rules/generation.mjs';
import {taskContext} from './design-tasks';
// One adapter for both branches. Uploads stay in task storage and never acquire
// catalog review/index eligibility merely by being used in one design.
export function contextReferencePlan(context:Awaited<ReturnType<typeof taskContext>>,options?:{sellingSourceId?:string;sellingType?:string;creativity?:import('@/visual-rules/generation.mjs').Creativity}){
 const refs=context.reference_source==='upload'?context.upload_reference_snapshot.map(ref=>({id:ref.id,profile:ref.profile})):context.reference_snapshot;
 return buildReferencePlan(refs,{...options,allowEmpty:context.reference_source==='none'});
}
