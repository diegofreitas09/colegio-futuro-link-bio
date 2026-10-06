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
  processedCount?:number;
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
      body:JSON.stringify({action:"dashboardGestao",token,gatewayKey,modo:"PRODUCAO"}),redirect:"follow",signal:AbortSignal.timeout(20000)
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
    PARCELAS:"QTD_PARCELAS",QTD_PARCELAS:"QTD_PARCELAS",TIPO_COBRANCA:"TIPO_COBRANCA",ATIVO:"ATIVO",
    PUBLICADO_ATENDIMENTO:"PUBLICADO_ATENDIMENTO",DISPONIVEL_MATRICULA:"DISPONIVEL_MATRICULA",
    OBSERVACAO:"OBSERVAÇÃO",OBSERVACAO_INTERNA:"OBSERVACAO_INTERNA",ORDEM_EXIBICAO:"ORDEM_EXIBICAO"
  },
  campanhas:{
    ID:"ID_PRODUTO",ID_PRODUTO:"ID_PRODUTO",ANO:"ANO_LETIVO",ANO_LETIVO:"ANO_LETIVO",
    NOME:"NOME_CAMPANHA",NOME_CAMPANHA:"NOME_CAMPANHA",CAMPANHA:"NOME_CAMPANHA",
    SERIE:"SEGMENTO_SÉRIE",SEGMENTO:"SEGMENTO_SÉRIE",SEGMENTO_SERIE:"SEGMENTO_SÉRIE",
    DESCONTO:"DESCONTO_PRIMEIRA",DESCONTO_PRIMEIRA:"DESCONTO_PRIMEIRA",DESCONTO_PRIMEIRA_PCT:"DESCONTO_PRIMEIRA",
    PERCENTUAL:"DESCONTO_PRIMEIRA",PERCENTUAL_DESCONTO:"DESCONTO_PRIMEIRA",
    PARCELAS:"PARCELAMENTO_MAXIMO",PARCELAMENTO:"PARCELAMENTO_MAXIMO",PARCELAMENTO_MAXIMO:"PARCELAMENTO_MAXIMO",
    FORMA:"FORMA_PAGAMENTO",FORMA_PAGAMENTO:"FORMA_PAGAMENTO",SEM_JUROS:"SEM_JUROS",
    PUBLICO:"PUBLICO",TIPO_ALUNO:"PUBLICO",DATA_INICIO:"DATA_INICIO",INICIO:"DATA_INICIO",
    DATA_FIM:"DATA_FIM",FIM:"DATA_FIM",APLICAR_AUTOMATICAMENTE:"APLICAR_AUTOMATICAMENTE",
    APLICACAO_AUTOMATICA:"APLICAR_AUTOMATICAMENTE",EXIBIR_PANFLETO:"EXIBIR_PANFLETO",
    PANFLETO:"EXIBIR_PANFLETO",ATIVO:"ATIVO",OBSERVACAO:"OBSERVAÇÃO"
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

function boolish(v:any,defaultValue=true){
  if(v===undefined||v===null||String(v).trim()==="")return defaultValue;
  const s=String(v).trim().toLowerCase();
  return !["0","nao","não","false","n","off","inativo"].includes(s);
}
function num(v:any,def=0){
  if(typeof v==="number"&&Number.isFinite(v))return v;
  const raw=String(v??"").trim().replace(/\s/g,"");
  if(!raw)return def;
  const normalized=raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw;
  const n=Number(normalized.replace(/[^0-9.-]/g,""));
  return Number.isFinite(n)?n:def;
}
function campaignToProduct(row:Row){
  const year=Math.trunc(num(row.ANO_LETIVO,new Date().getFullYear()));
  const discount=Math.max(0,Math.min(100,num(row.DESCONTO_PRIMEIRA??row.VALOR_BASE,0)));
  const installments=Math.max(1,Math.min(12,Math.trunc(num(row.PARCELAMENTO_MAXIMO??row.QTD_PARCELAS,1))));
  const payment=String(row.FORMA_PAGAMENTO||"Cartão").trim()||"Cartão";
  const meta={
    name:String(row.NOME_CAMPANHA||row.PRODUTO||("Campanha Matrículas "+year)).trim(),
    discount,
    cardInstallments:installments,
    paymentMethod:payment,
    studentType:String(row.PUBLICO||"Todos").trim()||"Todos",
    start:String(row.DATA_INICIO||"").slice(0,10),
    end:String(row.DATA_FIM||"").slice(0,10),
    showFlyer:boolish(row.EXIBIR_PANFLETO,true),
    autoApply:boolish(row.APLICAR_AUTOMATICAMENTE,true),
    noInterest:boolish(row.SEM_JUROS,true),
    note:String(row["OBSERVAÇÃO"]||row.OBSERVACAO||"").trim()
  };
  const publicNote=(discount?discount.toLocaleString("pt-BR",{maximumFractionDigits:2})+"% de desconto na 1ª parcela":"Sem desconto")+
    (installments>1?" • até "+installments+"x no "+payment.toLowerCase()+(meta.noInterest?" sem juros":""):"");
  return {
    ID_PRODUTO:row.ID_PRODUTO||"",
    ANO_LETIVO:year,CATEGORIA:"Campanha",SUBCATEGORIA:"1ª Parcela",PRODUTO:meta.name,
    "SEGMENTO_SÉRIE":row["SEGMENTO_SÉRIE"]||"Todos","DESCRIÇÃO":publicNote,
    VALOR_BASE:discount,"VALOR_PÓS_VENCIMENTO":0,"VALOR_CRÉDITO":0,QTD_PARCELAS:installments,VALOR_PARCELA:0,
    VENCIMENTO_PADRÃO:meta.end||"",ATIVO:boolish(row.ATIVO,true)?"Sim":"Não","OBSERVAÇÃO":meta.note||publicNote,
    TIPO_COBRANCA:"Campanha",DISPONIVEL_MATRICULA:"Não",ORDEM_EXIBICAO:1,
    OBSERVACAO_INTERNA:JSON.stringify(meta),PUBLICADO_ATENDIMENTO:"Sim"
  };
}
function campaignPublicView(p:Row){
  let meta:any={};try{meta=JSON.parse(String(p.OBSERVACAO_INTERNA||"{}"))}catch{}
  const discount=num(p.VALOR_BASE??meta.discount,0);
  return {
    id:String(p.ID_PRODUTO||""),year:Math.trunc(num(p.ANO_LETIVO,0)),name:String(meta.name||p.PRODUTO||"Campanha"),
    segment:String(p["SEGMENTO_SÉRIE"]||"Todos"),discount,cardInstallments:Math.max(1,Math.trunc(num(p.QTD_PARCELAS??meta.cardInstallments,1))),
    paymentMethod:String(meta.paymentMethod||"Cartão"),studentType:String(meta.studentType||"Todos"),
    start:String(meta.start||""),end:String(meta.end||""),showFlyer:meta.showFlyer!==false,autoApply:meta.autoApply!==false,
    noInterest:meta.noInterest!==false,note:String(meta.note||p["OBSERVAÇÃO"]||""),active:String(p.ATIVO||"Sim")!=="Não"
  };
}
async function fetchPublishedCatalog(){
  const gatewayKey=Netlify.env.get("FUTURO_PWA_GATEWAY_KEY");
  if(!gatewayKey)throw new Error("Gateway da PWA não configurado.");
  const r=await fetch(APPS_SCRIPT_URL,{
    method:"POST",headers:{"content-type":"application/json"},redirect:"follow",signal:AbortSignal.timeout(20000),
    body:JSON.stringify({action:"listarProdutosPublicos",gatewayKey})
  });
  const out=await r.json() as any;
  if(!r.ok||!out?.ok)throw new Error(out?.error||"Não foi possível ler o catálogo oficial.");
  const all=Array.isArray(out.data)?out.data:[];
  const campaigns=all.filter((p:Row)=>String(p.CATEGORIA||"").toLowerCase()==="campanha").map(campaignPublicView);
  const products=all.filter((p:Row)=>String(p.CATEGORIA||"").toLowerCase()!=="campanha");
  return {updatedAt:new Date().toISOString(),products,campaigns,all};
}
function catalogFilter(data:any,year?:any,series?:any){
  const y=Math.trunc(num(year,0)),s=String(series||"").trim().toLowerCase();
  const matches=(v:any)=>!s||String(v||"").toLowerCase().includes(s)||s.includes(String(v||"").toLowerCase());
  return {
    updatedAt:data.updatedAt,
    products:(data.products||[]).filter((p:Row)=>(!y||num(p.ANO_LETIVO,0)===y)&&matches(p["SEGMENTO_SÉRIE"])),
    campaigns:(data.campaigns||[]).filter((p:any)=>(!y||Number(p.year)===y)&&matches(p.segment))
  };
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
  if(!["alunos","responsaveis","matriculas","produtos","campanhas","atendimentos"].includes(entity))throw new Error("Entidade não suportada.");
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
  const offset=Number(job.processedCount||0),chunk=job.records.slice(offset,offset+100);
  if(!chunk.length){
    job.status="COMPLETED";await saveJob(job);
    return {done:true,processed:offset,total:job.recordCount,result:job.result||{}};
  }
  job.status="PROCESSING";await saveJob(job);
  const r=await fetch(APPS_SCRIPT_URL,{
    method:"POST",headers:{"content-type":"application/json"},redirect:"follow",signal:AbortSignal.timeout(20000),
    body:JSON.stringify({
      action:"importarLoteIntegracao",token,gatewayKey,
      modo:job.environment,sessaoTeste:job.environment==="TESTE"?job.id:"",
      data:{jobId:job.id,source:job.source,entity:job.entity==="campanhas"?"produtos":job.entity,mode:job.mode,records:job.entity==="campanhas"?chunk.map(campaignToProduct):chunk}
    })
  });
  const out=await r.json() as any;
  if(!r.ok||!out?.ok){
    job.status="ERROR";job.error=out?.error||"Falha no Apps Script.";await saveJob(job);
    throw new Error(job.error);
  }
  const current=out.data||{},prev=job.result||{recebidos:0,criados:0,atualizados:0,ignorados:0,erros:[]};
  job.result={
    recebidos:Number(prev.recebidos||0)+Number(current.recebidos||0),
    criados:Number(prev.criados||0)+Number(current.criados||0),
    atualizados:Number(prev.atualizados||0)+Number(current.atualizados||0),
    ignorados:Number(prev.ignorados||0)+Number(current.ignorados||0),
    erros:[...(prev.erros||[]),...(current.erros||[])]
  };
  job.processedCount=offset+chunk.length;
  job.status=job.processedCount>=job.recordCount?"COMPLETED":"STAGED";
  job.error="";await saveJob(job);
  return {done:job.status==="COMPLETED",processed:job.processedCount,total:job.recordCount,result:job.result};
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
      if(action==="admin:catalog-snapshot"){
        const catalog=await fetchPublishedCatalog();
        return json({ok:true,data:catalogFilter(catalog,body.year,body.series)});
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
        const rr=await fetch(url,{headers,redirect:"follow",signal:AbortSignal.timeout(20000)});
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
    if(action==="catalog"){
      const catalog=await fetchPublishedCatalog();
      return json({ok:true,data:catalogFilter(catalog,body.year,body.series)});
    }
    return json({ok:false,error:"Ação não reconhecida."},400);
  }catch(e:any){
    return json({ok:false,error:e?.message||"Falha na central de integrações."},500);
  }
};

export const config:Config={path:"/api/integrations"};
