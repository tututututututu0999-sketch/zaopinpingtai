// Read credentials from the configured environment; never print credentials or responses.
const base=process.env.AI_GATEWAY_BASE_URL?.replace(/\/$/,'');if(!base)throw new Error('Missing gateway configuration');
const root=base.endsWith('/v1')?base:`${base}/v1`,model=process.env.TERRA_MODEL||'gpt-5.6-terra';
const tasks=[
 ['chat','/chat/completions',{model,stream:false,messages:[{role:'user',content:'仅输出JSON：{"ok":true}'}]}],
 ['responses','/responses',{model,stream:false,reasoning:{effort:'low'},input:'仅输出JSON：{"ok":true}'}],
 ['stream','/chat/completions',{model,stream:true,reasoning_effort:'low',messages:[{role:'user',content:'仅输出JSON：{"ok":true}'}]}],
];
await Promise.allSettled(tasks.map(async([name,path,body])=>{const start=Date.now();try{const r=await fetch(root+path,{method:'POST',headers:{Authorization:`Bearer ${process.env.AI_GATEWAY_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});const text=await r.text();console.log(JSON.stringify({name,status:r.status,type:r.headers.get('content-type'),ms:Date.now()-start,bytes:text.length,hasAnswer:/"(?:content|text|output_text)"\s*:\s*"[^"\s]/.test(text),hasDelta:text.includes('output_text.delta')}));}catch(error){console.log(JSON.stringify({name,ms:Date.now()-start,error:error.name}));}}));
