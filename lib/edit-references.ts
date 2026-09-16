import {query} from './db';
import type {StoredReference} from './task-references';
export async function editReferences(taskId:string,ids:unknown):Promise<StoredReference[]>{
 if(ids===undefined)return [];
 if(!Array.isArray(ids)||ids.length>3||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id)))throw new Error('本次改图最多选择3张有效参考图');
 if(!ids.length)return [];
 const rows=(await query<StoredReference>('SELECT * FROM image_edit_references WHERE task_id=$1 AND id=ANY($2::uuid[])',[taskId,ids])).rows;
 if(rows.length!==ids.length)throw new Error('改图参考不存在或不属于当前任务');
 if(rows.filter(row=>row.role==='character').length>1)throw new Error('本次只选择一张人物/IP参考');
 return ids.map(id=>rows.find(row=>row.id===id)!);
}
