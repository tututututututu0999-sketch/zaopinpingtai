import {query} from './db';
import type {PoolClient} from 'pg';

export const referenceRoles={character:'封面 IP',style:'整体风格',layout:'排版参考'} as const;
export type ReferenceRole=keyof typeof referenceRoles;
export type StoredReference={id:string;filename:string;mime_type:string;object_key:string;role:ReferenceRole;note:string;created_at:string};
export function validReferenceRole(value:unknown):value is ReferenceRole{return typeof value==='string'&&Object.hasOwn(referenceRoles,value);}
export async function taskReferenceRows(taskId:string){return (await query<StoredReference>('SELECT * FROM design_task_references WHERE task_id=$1 ORDER BY created_at,id',[taskId])).rows;}
export async function assertReferenceRevision(taskId:string,revision:number){
 const row=(await query<{reference_revision:number}>('SELECT reference_revision FROM design_tasks WHERE id=$1',[taskId])).rows[0];
 if(!row||row.reference_revision!==revision)throw new Error('参考图已修改，本次结果已过期，请重新确认参考后重试');
}
import {referenceInstruction} from "@/visual-rules/reference-roles.mjs";
export {referenceInstruction};
export function referenceSummary(rows:StoredReference[]){return rows.map((row,index)=>({index:index+1,role:row.role,instruction:referenceInstruction(row)}));}
export async function invalidateTaskReferences(client:PoolClient,taskId:string){
 await client.query(`UPDATE design_tasks SET reference_revision=reference_revision+1,
 status=CASE WHEN reference_source='upload' THEN 'REFERENCE_PENDING' ELSE 'REPORT_READY' END,
 report=CASE WHEN reference_source='upload' THEN NULL ELSE report END,
 upload_reference_snapshot='[]',prompt=NULL,updated_at=now() WHERE id=$1`,[taskId]);
}
