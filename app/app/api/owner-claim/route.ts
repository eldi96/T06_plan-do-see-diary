import {env} from 'cloudflare:workers';
import {requireSession,assertSameOrigin} from '../../../lib/auth-server';
const headers={'Cache-Control':'no-store'};
export async function POST(request:Request){
 const session=await requireSession(request);if(!session)return Response.json({error:'로그인이 필요합니다.'},{status:401,headers});
 const originError=assertSameOrigin(request);if(originError)return originError;
 const settings=env as typeof env&{PDS_LEGACY_OWNER_USERNAME?:string;PDS_LEGACY_CLAIM_SECRET?:string};
 const input:unknown=await request.json().catch(()=>null);
 const body=input&&typeof input==='object'?input as Record<string,unknown>:{};
 if(!settings.PDS_LEGACY_OWNER_USERNAME||session.user.username!==settings.PDS_LEGACY_OWNER_USERNAME||!settings.PDS_LEGACY_CLAIM_SECRET)return new Response(null,{status:404,headers});
 const digest=async(value:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
 const [actual,expected]=await Promise.all([digest(String(body.setupKey??'')),digest(settings.PDS_LEGACY_CLAIM_SECRET)]);
 let difference=0;for(let i=0;i<expected.length;i++)difference|=actual[i]^expected[i];
 if(difference)return new Response(null,{status:404,headers});
 const db=env.DB;if(!db)return new Response(null,{status:503,headers});
 const prior=await db.prepare("SELECT owner_id FROM ownership_claims WHERE id='t06'").first<{owner_id:string|null}>();
 if(prior)return prior.owner_id===session.user.id?Response.json({ok:true,alreadyClaimed:true},{headers}):new Response(null,{status:404,headers});
 try{
  await db.batch([
   db.prepare("INSERT INTO ownership_claims(id,owner_id,claimed_at) VALUES('t06',?,?)").bind(session.user.id,new Date().toISOString()),
   ...['records','history','completions','requests'].map(table=>db.prepare(`UPDATE ${table} SET owner_id=? WHERE owner_id IS NULL`).bind(session.user.id)),
  ]);
  return Response.json({ok:true},{headers});
 }catch{return Response.json({error:'기존 자료를 연결하지 못했습니다. 다시 확인해 주세요.'},{status:409,headers});}
}
