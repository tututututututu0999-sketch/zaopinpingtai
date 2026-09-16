import {query} from './db';
export async function archiveStatus(){
 const projects=(await query<{id:string;name:string;total:number;indexed:number;searchable:number;pendingReview:number;waitingVector:number;missingPrimary:number}>(`
 SELECT p.id,p.name,count(a.id)::int AS total,
 count(a.id) FILTER(WHERE e.asset_id IS NOT NULL AND a.embedding_status='READY')::int AS indexed,
 count(a.id) FILTER(WHERE e.asset_id IS NOT NULL AND a.embedding_status='READY' AND a.review_state='CONFIRMED' AND a.reuse_state<>'NOT_REUSABLE' AND a.preview_key IS NOT NULL AND main.review_state='CONFIRMED' AND main.reuse_state<>'NOT_REUSABLE' AND main.embedding_status='READY' AND main.preview_key IS NOT NULL AND me.asset_id IS NOT NULL)::int AS searchable,
 count(a.id) FILTER(WHERE a.review_state<>'CONFIRMED')::int AS "pendingReview",
 count(a.id) FILTER(WHERE a.review_state='CONFIRMED' AND (e.asset_id IS NULL OR a.embedding_status<>'READY'))::int AS "waitingVector",
 count(DISTINCT s.id) FILTER(WHERE s.primary_asset_id IS NULL OR main.review_state<>'CONFIRMED' OR main.reuse_state='NOT_REUSABLE' OR main.embedding_status<>'READY' OR main.preview_key IS NULL OR me.asset_id IS NULL)::int AS "missingPrimary"
 FROM projects p LEFT JOIN visual_suites s ON s.project_id=p.id LEFT JOIN assets a ON a.suite_id=s.id
 LEFT JOIN asset_embeddings e ON e.asset_id=a.id LEFT JOIN assets main ON main.id=s.primary_asset_id LEFT JOIN asset_embeddings me ON me.asset_id=main.id
 GROUP BY p.id ORDER BY p.name`)).rows;
 return {total:projects.reduce((n,p)=>n+p.total,0),indexed:projects.reduce((n,p)=>n+p.indexed,0),searchable:projects.reduce((n,p)=>n+p.searchable,0),projects,checkedAt:new Date().toISOString()};
}
