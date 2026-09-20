import type { Config } from "@netlify/functions";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as XLSX from "xlsx";

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwzZJUloa6YdIfJZdCmYw5ch_GkjuS20gUa5zyhulMiAiQj9pH9B3BOE7UU5jZvb_svig/exec";
const SITE_URL = "https://gestao.colegiofuturoce.com.br";

type Col = { key:string; label:string; width?:number; align?:"left"|"center"|"right" };
type ReportBody = {
  token:string; role:"staff"|"admin"; format:"pdf"|"xlsx";
  title:string; subtitle?:string; filename?:string; orientation?:"portrait"|"landscape";
  columns:Col[]; rows:Record<string,unknown>[]; meta?:{label:string;value:string}[];
  summary?:{label:string;value:string}[]; signature?:boolean;
};

function j(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}})}
function clean(v:unknown){return String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim()}
function safeName(v:string){return (v||"relatorio").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,90)||"relatorio"}
async function verify(role:string,token:string){
  if(!token)return false;
  try{
    const body=role==="admin"?{action:"listarCaixa",token,modo:"PRODUCAO"}:{action:"bootstrapSecretaria",token,modo:"PRODUCAO"};
    const r=await fetch(APPS_SCRIPT_URL,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const x=await r.json().catch(()=>null) as any;
    return !!(r.ok&&x?.ok);
  }catch{return false}
}
function wrap(text:string,font:any,size:number,maxWidth:number){
  const src=clean(text);
  if(!src)return [""];
  const words=src.split(" ");
  const lines:string[]=[]; let line="";
  const pushWord=(w:string)=>{
    if(font.widthOfTextAtSize(w,size)<=maxWidth){line=w;return}
    let part="";
    for(const ch of w){
      const next=part+ch;
      if(part&&font.widthOfTextAtSize(next,size)>maxWidth){lines.push(part);part=ch}else part=next;
    }
    line=part;
  };
  for(const w of words){
    if(!line){pushWord(w);continue}
    const next=line+" "+w;
    if(font.widthOfTextAtSize(next,size)<=maxWidth)line=next;
    else{lines.push(line);line="";pushWord(w)}
  }
  if(line)lines.push(line);
  return lines.length?lines:[""];
}
function val(row:Record<string,unknown>,key:string){return clean(row?.[key])}

async function makePdf(body:ReportBody){
  const pdf=await PDFDocument.create();
  const regular=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo:any=null;
  try{
    const r=await fetch(SITE_URL+"/assets/app-icon-512.png",{cache:"no-store"});
    if(r.ok)logo=await pdf.embedPng(await r.arrayBuffer());
  }catch{}
  const landscape=body.orientation!=="portrait";
  const PAGE=landscape?[841.89,595.28]:[595.28,841.89];
  const margin=34, headerH=82, footerH=24;
  const cols=Array.isArray(body.columns)?body.columns.slice(0,14):[];
  const rows=Array.isArray(body.rows)?body.rows.slice(0,5000):[];
  const weightSum=cols.reduce((s,c)=>s+Math.max(1,Number(c.width||1)),0)||1;
  const avail=PAGE[0]-margin*2;
  const widths=cols.map(c=>avail*Math.max(1,Number(c.width||1))/weightSum);
  const generated=new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short",timeZone:"America/Fortaleza"}).format(new Date());
  let page:any,y=0,pageNo=0;
  const pages:any[]=[];
  const drawHeader=()=>{
    page=pdf.addPage(PAGE as [number,number]);pages.push(page);pageNo++;
    const H=PAGE[1],W=PAGE[0];
    page.drawRectangle({x:0,y:H-72,width:W,height:72,color:rgb(0.035,0.19,0.43)});
    if(logo){const d=logo.scale(1);const h=48,w=48*(d.width/d.height);page.drawRectangle({x:margin,y:H-60,width:52,height:52,color:rgb(1,1,1)});page.drawImage(logo,{x:margin+2,y:H-58,width:48,height:48})}
    const tx=logo?margin+65:margin;
    page.drawText("COLÉGIO FUTURO",{x:tx,y:H-29,size:9,font:bold,color:rgb(.72,.84,1)});
    page.drawText(clean(body.title),{x:tx,y:H-49,size:18,font:bold,color:rgb(1,1,1),maxWidth:W-tx-margin-170});
    if(body.subtitle)page.drawText(clean(body.subtitle),{x:tx,y:H-64,size:8.5,font:regular,color:rgb(.88,.93,1),maxWidth:W-tx-margin-170});
    page.drawText("Gestão Futuro • Relatório institucional",{x:W-margin-170,y:H-28,size:8,font:bold,color:rgb(.8,.88,1)});
    page.drawText("Gerado em "+generated,{x:W-margin-170,y:H-43,size:7.5,font:regular,color:rgb(.85,.9,1)});
    y=H-headerH;
    if(body.meta?.length){
      const line=body.meta.map(m=>clean(m.label)+": "+clean(m.value)).join("   |   ");
      const lines=wrap(line,regular,7.5,W-margin*2);
      for(const l of lines.slice(0,2)){page.drawText(l,{x:margin,y,size:7.5,font:regular,color:rgb(.25,.31,.4)});y-=10}
      y-=3;
    }
    if(body.summary?.length){
      const gap=6,n=Math.min(body.summary.length,4),w=(avail-gap*(n-1))/n;
      body.summary.slice(0,4).forEach((s,i)=>{
        const x=margin+i*(w+gap);
        page.drawRectangle({x,y:y-31,width:w,height:31,color:rgb(.96,.975,.995),borderColor:rgb(.82,.87,.94),borderWidth:.6});
        page.drawText(clean(s.label).slice(0,36),{x:x+7,y:y-11,size:6.7,font:bold,color:rgb(.35,.42,.52)});
        page.drawText(clean(s.value).slice(0,38),{x:x+7,y:y-24,size:10,font:bold,color:rgb(.04,.25,.53)});
      });
      y-=39;
    }
  };
  const drawTableHead=()=>{
    const h=22;let x=margin;
    page.drawRectangle({x:margin,y:y-h,width:avail,height:h,color:rgb(.08,.30,.59)});
    cols.forEach((c,i)=>{page.drawText(clean(c.label).slice(0,30),{x:x+4,y:y-14,size:7,font:bold,color:rgb(1,1,1),maxWidth:widths[i]-8});x+=widths[i]});
    y-=h;
  };
  drawHeader();drawTableHead();
  rows.forEach((row,ri)=>{
    const cellLines=cols.map((c,i)=>wrap(val(row,c.key),regular,7,widths[i]-8).slice(0,body.signature&&c.key==="assinatura"?1:4));
    const maxLines=Math.max(1,...cellLines.map(a=>a.length));
    const rowH=Math.max(body.signature?28:18,Math.min(48,maxLines*9+7));
    if(y-rowH<footerH+margin){
      drawHeader();drawTableHead();
    }
    if(ri%2===1)page.drawRectangle({x:margin,y:y-rowH,width:avail,height:rowH,color:rgb(.975,.982,.992)});
    page.drawLine({start:{x:margin,y:y-rowH},end:{x:margin+avail,y:y-rowH},thickness:.35,color:rgb(.84,.87,.91)});
    let x=margin;
    cols.forEach((c,i)=>{
      const lines=cellLines[i]; let yy=y-11;
      if(body.signature&&c.key==="assinatura"){
        page.drawLine({start:{x:x+8,y:y-rowH/2-4},end:{x:x+widths[i]-8,y:y-rowH/2-4},thickness:.45,color:rgb(.45,.48,.52)});
      }else{
        for(const line of lines){
          let dx=x+4;
          const tw=regular.widthOfTextAtSize(line,7);
          if(c.align==="right")dx=x+widths[i]-4-tw;
          else if(c.align==="center")dx=x+(widths[i]-tw)/2;
          page.drawText(line,{x:Math.max(x+3,dx),y:yy,size:7,font:regular,color:rgb(.12,.16,.22),maxWidth:widths[i]-8});
          yy-=9;
        }
      }
      x+=widths[i];
    });
    y-=rowH;
  });
  if(!rows.length){
    page.drawText("Nenhum registro encontrado para os filtros selecionados.",{x:margin,y:y-24,size:9,font:regular,color:rgb(.4,.45,.52)});
  }
  pages.forEach((p,i)=>{
    p.drawLine({start:{x:margin,y:22},end:{x:PAGE[0]-margin,y:22},thickness:.4,color:rgb(.82,.85,.89)});
    p.drawText("Colégio Futuro • Gestão Futuro",{x:margin,y:9,size:6.7,font:regular,color:rgb(.45,.49,.55)});
    const txt="Página "+(i+1)+" de "+pages.length;
    p.drawText(txt,{x:PAGE[0]-margin-regular.widthOfTextAtSize(txt,6.7),y:9,size:6.7,font:regular,color:rgb(.45,.49,.55)});
  });
  return Buffer.from(await pdf.save());
}

function makeXlsx(body:ReportBody){
  const cols=body.columns||[],rows=body.rows||[];
  const aoa:any[][]=[];
  aoa.push(["COLÉGIO FUTURO"]);
  aoa.push([clean(body.title)]);
  if(body.subtitle)aoa.push([clean(body.subtitle)]);
  (body.meta||[]).forEach(m=>aoa.push([clean(m.label),clean(m.value)]));
  if(body.summary?.length){aoa.push([]);aoa.push(body.summary.map(s=>clean(s.label)));aoa.push(body.summary.map(s=>clean(s.value)))}
  aoa.push([]);
  const headerRow=aoa.length;
  aoa.push(cols.map(c=>clean(c.label)));
  for(const r of rows)aoa.push(cols.map(c=>clean((r as any)[c.key])));
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  if(cols.length){
    ws["!merges"]=[{s:{r:0,c:0},e:{r:0,c:Math.max(0,cols.length-1)}},{s:{r:1,c:0},e:{r:1,c:Math.max(0,cols.length-1)}}];
    ws["!cols"]=cols.map(c=>({wch:Math.max(10,Math.min(42,(Number(c.width||1)*7)+8))}));
    ws["!autofilter"]={ref:XLSX.utils.encode_range({r:headerRow,c:0},{r:headerRow+rows.length,c:Math.max(0,cols.length-1)})};
  }
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Relatório");
  return XLSX.write(wb,{bookType:"xlsx",type:"buffer"});
}

export default async (req:Request)=>{
  if(req.method!=="POST")return j({ok:false,error:"Método não permitido."},405);
  let body:ReportBody;
  try{body=await req.json()}catch{return j({ok:false,error:"JSON inválido."},400)}
  if(!body||!["pdf","xlsx"].includes(body.format)||!Array.isArray(body.columns)||!Array.isArray(body.rows))return j({ok:false,error:"Relatório inválido."},400);
  if(body.rows.length>5000)return j({ok:false,error:"O relatório excede 5.000 linhas. Aplique filtros antes de exportar."},413);
  if(!(await verify(body.role,body.token)))return j({ok:false,error:"Sessão inválida ou expirada."},401);
  const base=safeName(body.filename||body.title||"relatorio");
  if(body.format==="pdf"){
    const buf=await makePdf(body);
    return new Response(buf,{status:200,headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="${base}.pdf"`,"cache-control":"no-store"}});
  }
  const buf=makeXlsx(body);
  return new Response(buf,{status:200,headers:{"content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","content-disposition":`attachment; filename="${base}.xlsx"`,"cache-control":"no-store"}});
};

export const config: Config = { path: "/api/reports" };
