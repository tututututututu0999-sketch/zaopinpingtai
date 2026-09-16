import {query} from './db';
import {taskContext} from './design-tasks';
import {taskReferenceRows,referenceSummary} from './task-references';
import {buildReferenceRoles} from '@/visual-rules/reference-roles.mjs';
import type {ReferencePlan,Creativity} from '@/visual-rules/generation.mjs';

export async function generationContext(taskId:string,context:Awaited<ReturnType<typeof taskContext>>,referencePlan:ReferencePlan,creativity:Creativity,editBaseVersionId?:string){
 let baseKind:'edit'|'parent'|undefined;
 if(editBaseVersionId){
  const version=await query('SELECT id FROM design_versions WHERE id=$1 AND task_id=$2 AND output_key IS NOT NULL',[editBaseVersionId,taskId]);
  if(!version.rowCount)throw new Error('改图底图必须是当前任务已生成的历史版本');baseKind='edit';
 }else if((await query('SELECT p.generation_key FROM design_tasks t JOIN design_tasks p ON p.id=t.parent_task_id WHERE t.id=$1',[taskId])).rows[0]?.generation_key)baseKind='parent';
 const uploads=await taskReferenceRows(taskId);
 return {referenceRoles:buildReferenceRoles({references:context.reference_snapshot,uploads,baseKind,referencePlan,creativity}),referenceNotes:context.reference_snapshot.map(item=>item.adaptation_notes),uploadedReferences:referenceSummary(uploads)};
}
