import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
function storage(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}}
function app(){
 const localStorage=storage(),sessionStorage=storage();
 const c=vm.createContext({localStorage,sessionStorage,console,setTimeout,clearTimeout,AbortController,AbortSignal,crypto:webcrypto,Response,document:{querySelector:()=>null,querySelectorAll:()=>[]},window:{},navigator:{},fetch:async()=>Response.json({ok:true,data:[]})});
 vm.runInContext(source('app/core.js')+'\n'+source('app/comercial.js'),c);return c;
}
test('Brazilian prices and 1st + 12 installments retain exact cents',()=>{
 const c=app();assert.equal(vm.runInContext('parseMoney("R$ 12.345,67")',c),12345.67);
 assert.equal(vm.runInContext('gfPlanCalc([{CATEGORIA:"Mensalidade",SUBCATEGORIA:"Anuidade",VALOR_BASE:"7.788,00"}],12,0,0).total',c),7788);
 assert.equal(vm.runInContext('gfPlanCalc([{CATEGORIA:"Mensalidade",SUBCATEGORIA:"Anuidade",VALOR_BASE:7788}],12,25,0).total',c),7638.24);
});
test('changing environment clears selected attendance and catalogue',()=>{
 const c=app();vm.runInContext('state.runMode="TESTE";state.currentAttendanceId="ATE-1";state.resumeAttendance={};state.catalogProducts=[1];setRunMode("PRODUCAO")',c);
 assert.equal(vm.runInContext('state.currentAttendanceId',c),'');assert.equal(vm.runInContext('state.catalogProducts',c),null);
});
test('test draft cannot be restored in production',()=>{
 const c=app();c.localStorage.setItem('gestao_futuro_atendimento_rascunho_v1',JSON.stringify({MODO_REGISTRO:'TESTE',NOME_ALUNO:'Fixture'}));
 assert.equal(vm.runInContext('gfLoadAttendanceDraft()',c),null);
 vm.runInContext('state.runMode="TESTE"',c);assert.equal(vm.runInContext('gfLoadAttendanceDraft().NOME_ALUNO',c),'Fixture');
});
test('pending queue retains more than 100 unsynced records and reports quota failure',()=>{
 const c=app();vm.runInContext('for(let i=0;i<105;i++)gfUpsertLocalAttendance({ID_ATENDIMENTO:"LOCAL-"+i},[])',c);
 assert.equal(vm.runInContext('gfLocalAttendances().length',c),105);
 c.localStorage.setItem=()=>{throw new Error('quota')};assert.throws(()=>vm.runInContext('gfUpsertLocalAttendance({ID_ATENDIMENTO:"LOCAL-new"},[])',c),/Não foi possível salvar/);
});
test('expired session never reuses saved student data',async()=>{
 const c=app();vm.runInContext('state.staffToken="expired";state.role="staff";gfWriteBootstrapLocal({mode:"PRODUCAO",bootstrap:{alunos:[1]}})',c);
 c.fetch=async()=>Response.json({ok:false,error:'Sessão expirada.'});
 await assert.rejects(vm.runInContext('loadBootstrap()',c),/Sessão expirada/);
 assert.equal(vm.runInContext('state.bootstrap',c),null);
});
test('network failure permits same-environment offline cache only',async()=>{
 const c=app();vm.runInContext('state.staffToken="fixture";state.role="staff";gfWriteBootstrapLocal({mode:"TESTE",bootstrap:{alunos:[1]}})',c);
 c.fetch=async()=>{throw new TypeError('Failed to fetch')};await assert.rejects(vm.runInContext('loadBootstrap()',c));
 vm.runInContext('state.runMode="TESTE"',c);assert.equal((await vm.runInContext('loadBootstrap()',c)).alunos[0],1);
});
test('response arriving after invalidation cannot repopulate cache',async()=>{
 const c=app();let finish;c.fetch=()=>new Promise(r=>finish=r);
 const pending=vm.runInContext('api("listarProdutosPublicos")',c);vm.runInContext('clearApiCache()',c);finish(Response.json({ok:true,data:[1]}));await pending;
 assert.equal(vm.runInContext('state.apiCache.size',c),0);
});
test('concurrent reads share a single request',async()=>{
 const c=app();let count=0;c.fetch=async()=>{count++;return Response.json({ok:true,data:[]})};
 await Promise.all([vm.runInContext('api("listarProdutosPublicos")',c),vm.runInContext('api("listarProdutosPublicos")',c)]);assert.equal(count,1);
});
test('published output contains local PDF library, excludes backend and dependencies',()=>{
 assert.ok(existsSync('dist/vendor/jspdf.umd.min.js'));for(const name of ['backend','node_modules','netlify','package.json'])assert.equal(existsSync('dist/'+name),false);
 const html=source('dist/index.html');for(const match of html.matchAll(/(?:src|href)="(\/[^"?]+)(?:\?[^" ]*)?"/g)){assert.ok(existsSync('dist'+match[1]),match[1])}
});
test('offline service worker handles versioned scripts and never caches HTTP errors',async()=>{
 const events={},puts=[],waits=[];let matchOptions;
 const c=vm.createContext({URL,Response,self:{location:{origin:'https://example.test'},addEventListener:(n,f)=>events[n]=f},caches:{open:async()=>({put:async(...x)=>puts.push(x)}),match:async(req,opts)=>{matchOptions=opts;return new Response('cached-js')}},fetch:async()=>new Response('error',{status:500})});
 vm.runInContext(source('service-worker.js'),c);let result;
 const event={request:{url:'https://example.test/app/core.js?v=1',method:'GET',headers:new Headers()},respondWith:p=>result=p,waitUntil:p=>waits.push(p)};
 events.fetch(event);assert.equal((await result).status,500);assert.equal(puts.length,0);
 c.fetch=async()=>{throw new Error('offline')};events.fetch(event);assert.equal(await (await result).text(),'cached-js');assert.equal(matchOptions.ignoreSearch,true);
});


test('navigation uses only the valid multi-selector helper and header brand is transparent',()=>{
 const core=source('app/core.js'),brand=source('app/brand.js');
 assert.doesNotMatch(core,/\$\$\$/);
 assert.doesNotMatch(core,/(^|[^$])\$\("#nav button"\)\.forEach/);
 const navMatches=[...core.matchAll(/\$\$\("#nav button"\)\.forEach/g)];
 assert.equal(navMatches.length,2);
 assert.match(brand,/brand-mark-white\.svg/);
});


test('CSP allows secure CEP providers',()=>{
 const toml=source('netlify.toml');
 assert.match(toml,/connect-src 'self' https:\/\/viacep\.com\.br https:\/\/brasilapi\.com\.br;/);
});
