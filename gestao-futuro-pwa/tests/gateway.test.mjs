import test from 'node:test';
import assert from 'node:assert/strict';
import gateway from '../netlify/functions/gateway.mts';
globalThis.Netlify={env:{get:key=>key==='FUTURO_PWA_GATEWAY_KEY'?'fixture-key':''}};
const request=body=>new Request('https://example.test/api/gf',{method:'POST',body:JSON.stringify(body)});
test('gateway rejects null and arrays without crashing',async()=>{
 for(const input of [null,[]])assert.equal((await gateway(request(input),{})).status,400);
});
test('gateway validates allowed operations',async()=>{
 assert.equal((await gateway(request({action:'invalid'}),{})).status,400);
});
test('gateway confirms write without waiting for notification delivery',async()=>{
 const original=globalThis.fetch;let background;
 globalThis.fetch=async()=>Response.json({ok:true,data:{id:'fixture'}});
 try{
  const r=await gateway(request({action:'solicitarDesconto',data:{}}),{waitUntil:p=>background=p});
  assert.equal(r.status,200);assert.equal((await r.json()).data.id,'fixture');assert.ok(background instanceof Promise);await background;
 }finally{globalThis.fetch=original}
});
test('gateway reports malformed upstream response',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response('<html>error</html>');
 try{assert.equal((await gateway(request({action:'listarProdutosPublicos'}),{})).status,502)}finally{globalThis.fetch=original}
});
