import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import * as XLSX from "xlsx";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwzZJUloa6YdIfJZdCmYw5ch_GkjuS20gUa5zyhulMiAiQj9pH9B3BOE7UU5jZvb_svig/exec";
const STORE = "gestao-futuro-integracoes";
const KEY_INDEX = "api-keys";
const JOB_INDEX = "jobs-index";

type Row = Record<string, any>;
type Job = {
  id:string;
  source:string;
  entity:string;
  mode:string;
  environment:string;
  channel:string;
  createdAt:string;
  createdBy:string;
  status:string;
  recordCount:number;
  preview:Row[];
  records:Row[];
  warnings:string[];
  result?:any;
  error?:string;
};

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
  });
}
function hash(v:string){return createHash("sha256").update(v).digest("hex")}
function id(prefix:string){return prefix+"-"+Date.now().toString(36).toUpperCase()+"-"+randomBytes(3).toString("hex").toUpperCase()}
function store(){return getStore(STORE)}

async function verifyAdmin(token:string){
  const gatewayKey=Netlify.env.get("FUTURO_PWA_GATEWAY_KEY");
  if(!gatewayKey||!token)return false;
  try{
    const r=await fetch(APPS_SCRIPT_URL,{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({action:"dashboardGestao",token,gatewayKey,modo:"PRODUCAO"}),redirect:"follow"
    });
    const out=await r.json() as any;
    return !!(r.ok&&out?.ok);
  }catch{return false}
}

async function readKeys(){
  return (await store().get(KEY_INDEX,{type:"json"}) as any[]|null)||[];
}
async function writeKeys(keys:any[]){await store().setJSON(KEY_INDEX,keys)}
async function verifyApiKey(req:Request){
  const auth=req.headers.get("authorization")||"";
  const raw=auth.replace(/^Bearer\s+/i,"").trim();
  if(!raw)return null;
  const h=hash(raw),keys=await readKeys();
  const key=keys.find(k=>k.hash===h&&k.active!==false);
  return key||null;
}

async function readJobIndex(){
  return (await store().get(JOB_INDEX,{type:"json"}) as any[]|null)||[];
}
async function writeJobIndex(rows:any[]){await store().setJSON(JOB_INDEX,rows.slice(0,250))}
async function saveJob(job:Job){
  await store().setJSON("job-"+job.id,job);
  const idx=await readJobIndex();
  const meta={id:job.id,source:job.source,entity:job.entity,mode:job.mode,environment:job.environment,channel:job.channel,createdAt:job.createdAt,createdBy:job.createdBy,status:job.status,recordCount:job.recordCount,error:job.error||""};
  await writeJobIndex([meta,...idx.filter(x=>x.id!==job.id)]);
}
async function loadJob(jobId:string){
  return await store().get("job-"+jobId,{type:"json"}) as Job|null;
}

function normalizeHeader(v:string){
  return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .trim().toUpperCase().replace(/[^A-Z0-9]+/g,"_").replace(/^_+|_+$/g,"");
}
const aliases:Record<string,Record<string,string>>={
  alunos:{
    NOME:"NOME_COMPLETO",ALUNO:"NOME_COMPLETO",NOME_ALUNO:"NOME_COMPLETO",NOME_COMPLETO:"NOME_COMPLETO",
    DATA_NASCIMENTO:"DATA_NASCIMENTO",NASCIMENTO:"DATA_NASCIMENTO",DT_NASCIMENTO:"DATA_NASCIMENTO",
    CPF:"CPF",RG:"RG",SERIE:"SÉRIE",ANO_SERIE:"SÉRIE",TURMA:"TURMA",TURNO:"TURNO",
    TIPO:"TIPO_ALUNO",TIPO_ALUNO:"TIPO_ALUNO",ESCOLA_ORIGEM:"ESCOLA_ORIGEM",CEP:"CEP",
    LOGRADOURO:"LOGRADOURO",ENDERECO:"LOGRADOURO",NUMERO:"NUMERO",BAIRRO:"BAIRRO",CIDADE:"CIDADE",
    MODALIDADE:"MODALIDADE",ANO_LETIVO:"ANO_LETIVO",ID:"ID_ALUNO",ID_ALUNO:"ID_ALUNO"
  },
  responsaveis:{
    NOME:"NOME_COMPLETO",RESPONSAVEL:"NOME_COMPLETO",NOME_RESPONSAVEL:"NOME_COMPLETO",NOME_COMPLETO:"NOME_COMPLETO",
    CPF:"CPF",TELEFONE:"TELEFONE",CELULAR:"TELEFONE",EMAIL:"EMAIL",PARENTESCO:"PARENTESCO",
    ID_ALUNO:"ID_ALUNO",ALUNO_ID:"ID_ALUNO",RESPONSAVEL_FINANCEIRO:"RESPONSAVEL_FINANCEIRO",
    FINANCEIRO:"RESPONSAVEL_FINANCEIRO",CEP:"CEP",ENDERECO:"ENDERECO",ID_RESPONSAVEL:"ID_RESPONSAVEL",ID:"ID_RESPONSAVEL"
  },
  matriculas:{
    ID:"ID_MATRÍCULA",ID_MATRICULA:"ID_MATRÍCULA",ID_ALUNO:"ID_ALUNO",ALUNO_ID:"ID_ALUNO",
    ANO:"ANO_LETIVO",ANO_LETIVO:"ANO_LETIVO",SERIE:"SÉRIE",TURNO:"TURNO",TIPO:"TIPO_MATRICULA",
    TIPO_MATRICULA:"TIPO_MATRICULA",PLANO:"ID_PRODUTO_PLANO",ID_PRODUTO_PLANO:"ID_PRODUTO_PLANO",
    PARCELAS:"PLANO_PARCELAS",PLANO_PARCELAS:"PLANO_PARCELAS",VALOR:"VALOR_ANUIDADE_CONTRATADO",
    VALOR_ANUIDADE:"VALOR_ANUIDADE_CONTRATADO",VALOR_ANUIDADE_CONTRATADO:"VALOR_ANUIDADE_CONTRATADO",
    DIA_VENCIMENTO:"DIA_VENCIMENTO",PRIMEIRO_VENCIMENTO:"PRIMEIRO_VENCIMENTO",OBSERVACAO:"OBSERVAÇÃO"
  },
  produtos:{
    ID:"ID_PRODUTO",ID_PRODUTO:"ID_PRODUTO",ANO:"ANO_LETIVO",ANO_LETIVO:"ANO_LETIVO",CATEGORIA:"CATEGORIA",
    SUBCATEGORIA:"SUBCATEGORIA",PRODUTO:"PRODUTO",NOME:"PRODUTO",SERIE:"SEGMENTO_SÉRIE",
    SEGMENTO_SERIE:"SEGMENTO_SÉRIE",DESCRICAO:"DESCRIÇÃO",VALOR:"VALOR_BASE",VALOR_BASE:"VALOR_BASE",
    PARCELAS:"QTD_PARCELAS",QTD_PARCELAS:"QTD_PARCELAS",TIPO_COBRANCA:"TIPO_COBRANCA",ATIVO:"ATIVO"
  },
  atendimentos:{
    ID:"ID_ATENDIMENTO",ID_ATENDIMENTO:"ID_ATENDIMENTO",ID_ALUNO:"ID_ALUNO",NOME:"NOME_ALUNO",NOME_ALUNO:"NOME_ALUNO",
    RESPONSAVEL:"RESPONSAVEL",TELEFONE:"TELEFONE",EMAIL:"EMAIL",TIPO_ALUNO:"TIPO_ALUNO",ANO:"ANO_LETIVO",
    ANO_LETIVO:"ANO_LETIVO",SERIE:"SERIE_PRETENDIDA",SERIE_PRETENDIDA:"SERIE_PRETENDIDA",TURNO:"TURNO",
    MODALIDADE:"MODALIDADE",ORIGEM:"ORIGEM",ETAPA:"ETAPA",STATUS:"STATUS",OBSERVACAO:"OBSERVACAO"
  }
};

function normalizeRows(entity:string,rows:Row[]){
  const map=aliases[entity]||{};
  const warnings:string[]=[];
  const out=rows.map((row,i)=>{
    const obj:Row={};
    Object.entries(row||{}).forEach(([k,v])=>{
      const nk=normalizeHeader(k),target=map[nk]||nk;
      obj[target]=v;
    });
    if(entity==="alunos"&&!obj.NOME_COMPLETO)warnings.push("Linha "+(i+2)+": aluno sem nome.");
    if(entity==="responsaveis"&&!obj.NOME_COMPLETO)warnings.push("Linha "+(i+2)+": responsável sem nome.");
    return obj;
  }).filter(r=>Object.values(r).some(v=>String(v??"").trim()!==""));
  return {rows:out,warnings};
}

function parseWorkbook(buffer:ArrayBuffer,filename:string){
  const wb=XLSX.read(Buffer.from(buffer),{type:"buffer",cellDates:false});
  const name=wb.SheetNames[0];
  if(!name)throw new Error("Arquivo sem planilha legível.");
  return XLSX.utils.sheet_to_json(wb.Sheets[name],{defval:"",raw:false}) as Row[];
}

function safeRemoteUrl(raw:string){
  const u=new URL(raw);
  if(u.protocol!=="https:")throw new Error("A integração remota exige HTTPS.");
  const host=u.hostname.toLowerCase();
  if(host==="localhost"||host==="127.0.0.1"||host==="0.0.0.0"||host.endsWith(".local"))throw new Error("Host remoto não permitido.");
  if(/^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(host))throw new Error("Rede privada não permitida.");
  return u.toString();
}

async function stageJob(input:{source:string,entity:string,mode?:string,environment?:string,channel:string,createdBy:string,records:Row[]}){
  const entity=String(input.entity||"").toLowerCase();
  if(!["alunos","responsaveis","matriculas","produtos","atendimentos"].includes(entity))throw new Error("Entidade não suportada.");
  const normalized=normalizeRows(entity,input.records||[]);
  if(!normalized.rows.length)throw new Error("Nenhum registro válido encontrado.");
  if(normalized.rows.length>5000)throw new Error("Limite por importação: 5.000 registros.");
  const job:Job={
    id:id("IMP"),source:input.source||"Integração",entity,mode:input.mode||"upsert",
    environment:String(input.environment||"PRODUCAO").toUpperCase()==="TESTE"?"TESTE":"PRODUCAO",
    channel:input.channel,createdAt:new Date().toISOString(),createdBy:input.createdBy||"API",
    status:"STAGED",recordCount:normalized.rows.length,preview:normalized.rows.slice(0,10),
    records:normalized.rows,warnings:normalized.warnings.slice(0,100)
  };
  await saveJob(job);
  return job;
}

async function commitJob(job:Job,token:string){
  const gatewayKey=Netlify.env.get("FUTURO_PWA_GATEWAY_KEY");
  if(!gatewayKey)throw new Error("Gateway da PWA não configurado.");
  job.status="PROCESSING";await saveJob(job);
  const r=await fetch(APPS_SCRIPT_URL,{
    method:"POST",headers:{"content-type":"application/json"},redirect:"follow",
    body:JSON.stringify({
      action:"importarLoteIntegracao",token,gatewayKey,
      modo:job.environment,sessaoTeste:job.environment==="TESTE"?job.id:"",
      data:{jobId:job.id,source:job.source,entity:job.entity,mode:job.mode,records:job.records}
    })
  });
  const out=await r.json() as any;
  if(!r.ok||!out?.ok){
    job.status="ERROR";job.error=out?.error||"Falha no Apps Script.";await saveJob(job);
    throw new Error(job.error);
  }
  job.status="COMPLETED";job.result=out.data;job.error="";await saveJob(job);
  return out.data;
}

async function handleMultipart(req:Request){
  const form=await req.formData();
  const token=String(form.get("token")||"");
  const key=await verifyApiKey(req);
  const isAdmin=token?await verifyAdmin(token):false;
  if(!isAdmin&&!key)return json({ok:false,error:"Acesso não autorizado."},401);
  const file=form.get("file");
  if(!(file instanceof File))return json({ok:false,error:"Arquivo ausente."},400);
  if(file.size>15*1024*1024)return json({ok:false,error:"Arquivo acima de 15 MB."},413);
  const rows=parseWorkbook(await file.arrayBuffer(),file.name);
  const job=await stageJob({
    source:String(form.get("source")||file.name||"Arquivo"),
    entity:String(form.get("entity")||""),
    mode:String(form.get("mode")||"upsert"),
    environment:String(form.get("environment")||"PRODUCAO"),
    channel:file.name.toLowerCase().endsWith(".csv")?"csv":"excel",
    createdBy:isAdmin?"Gestão":String(key?.label||"API"),
    records:rows
  });
  return json({ok:true,data:{...job,records:undefined}},201);
}

export default async(req:Request,_context:Context)=>{
  try{
    const ct=req.headers.get("content-type")||"";
    if(req.method==="POST"&&ct.includes("multipart/form-data"))return await handleMultipart(req);
    if(req.method!=="POST")return json({ok:false,error:"Use POST."},405);

    let body:any={};
    try{body=await req.json()}catch{return json({ok:false,error:"JSON inválido."},400)}
    const action=String(body.action||"").trim();

    if(action.startsWith("admin:")){
      const token=String(body.token||"");
      if(!(await verifyAdmin(token)))return json({ok:false,error:"Acesso da Gestão necessário."},401);

      if(action==="admin:list-jobs"){
        return json({ok:true,data:(await readJobIndex()).slice(0,100)});
      }
      if(action==="admin:get-job"){
        const job=await loadJob(String(body.jobId||""));
        if(!job)return json({ok:false,error:"Importação não encontrada."},404);
        return json({ok:true,data:job});
      }
      if(action==="admin:create-key"){
        const raw="gfint_"+randomBytes(24).toString("base64url");
        const keys=await readKeys();
        const rec={id:id("KEY"),label:String(body.label||"Integração externa"),hash:hash(raw),prefix:raw.slice(0,12),active:true,createdAt:new Date().toISOString()};
        keys.push(rec);await writeKeys(keys);
        return json({ok:true,data:{...rec,key:raw}},201);
      }
      if(action==="admin:list-keys"){
        const keys=await readKeys();
        return json({ok:true,data:keys.map(({hash,...x})=>x)});
      }
      if(action==="admin:revoke-key"){
        const keys=await readKeys(),kid=String(body.keyId||"");
        keys.forEach(k=>{if(k.id===kid)k.active=false});
        await writeKeys(keys);return json({ok:true});
      }
      if(action==="admin:stage-json"){
        const job=await stageJob({
          source:String(body.source||"Importação JSON"),entity:String(body.entity||""),mode:String(body.mode||"upsert"),
          environment:String(body.environment||"PRODUCAO"),channel:"json",createdBy:"Gestão",
          records:Array.isArray(body.records)?body.records:[]
        });
        return json({ok:true,data:{...job,records:undefined}},201);
      }
      if(action==="admin:pull"){
        const url=safeRemoteUrl(String(body.url||""));
        const headers:Record<string,string>={accept:"application/json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"};
        if(body.authorization)headers.authorization=String(body.authorization);
        const rr=await fetch(url,{headers,redirect:"follow"});
        if(!rr.ok)throw new Error("API remota respondeu "+rr.status+".");
        const remoteType=rr.headers.get("content-type")||"";
        let rows:Row[]=[];
        if(remoteType.includes("json")){
          const data=await rr.json() as any;
          rows=Array.isArray(data)?data:Array.isArray(data?.data)?data.data:Array.isArray(data?.records)?data.records:[];
        }else{
          rows=parseWorkbook(await rr.arrayBuffer(),new URL(url).pathname.split("/").pop()||"remote.xlsx");
        }
        const job=await stageJob({
          source:String(body.source||new URL(url).hostname),entity:String(body.entity||""),mode:String(body.mode||"upsert"),
          environment:String(body.environment||"PRODUCAO"),channel:"api-pull",createdBy:"Gestão",records:rows
        });
        return json({ok:true,data:{...job,records:undefined}},201);
      }
      if(action==="admin:commit-job"){
        const job=await loadJob(String(body.jobId||""));
        if(!job)return json({ok:false,error:"Importação não encontrada."},404);
        const result=await commitJob(job,token);
        return json({ok:true,data:result});
      }
      return json({ok:false,error:"Ação administrativa não reconhecida."},400);
    }

    const apiKey=await verifyApiKey(req);
    if(!apiKey)return json({ok:false,error:"API key inválida ou ausente."},401);
    if(action==="ingest"||!action){
      const job=await stageJob({
        source:String(body.source||apiKey.label||"API externa"),entity:String(body.entity||""),mode:String(body.mode||"upsert"),
        environment:String(body.environment||"PRODUCAO"),channel:"api",createdBy:String(apiKey.label||"API"),
        records:Array.isArray(body.records)?body.records:[]
      });
      return json({ok:true,data:{jobId:job.id,status:job.status,recordCount:job.recordCount,warnings:job.warnings}},202);
    }
    return json({ok:false,error:"Ação não reconhecida."},400);
  }catch(e:any){
    return json({ok:false,error:e?.message||"Falha na central de integrações."},500);
  }
};

export const config:Config={path:"/api/integrations"};
