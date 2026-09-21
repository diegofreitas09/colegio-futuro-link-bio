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
  chartDataUrl?:string; chartTitle?:string;
  extraSheets?:{name:string;columns:string[];rows:(string|number)[][]}[];
};

function j(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}})}
function clean(v:unknown){return String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim()}
function safeName(v:string){return (v||"relatorio").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,90)||"relatorio"}
async function verify(role:string,token:string){
  if(!token)return false;
  try{
    const body=role==="admin"?{action:"listarCaixa",token,modo:"PRODUCAO"}:{action:"bootstrapSecretaria",token,modo:"PRODUCAO"};
    const r=await fetch(SITE_URL+"/api/gf",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),redirect:"follow"});
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
  let logo:any=null,chartImg:any=null,chartRatio=2.6;
  try{
    const r=await fetch(SITE_URL+"/assets/app-icon-512.png",{cache:"no-store"});
    if(r.ok)logo=await pdf.embedPng(await r.arrayBuffer());
  }catch{}
  try{
    const raw=String(body.chartDataUrl||"");
    if(raw.startsWith("data:image/png;base64,")){
      const bytes=Buffer.from(raw.split(",")[1],"base64");
      chartImg=await pdf.embedPng(bytes);
      chartRatio=chartImg.width/chartImg.height||2.6;
    }
  }catch{}

  const landscape=body.orientation!=="portrait";
  const PAGE=landscape?[841.89,595.28]:[595.28,841.89];
  const W=PAGE[0],H=PAGE[1];
  const margin=34,footerH=28;
  const cols=Array.isArray(body.columns)?body.columns.slice(0,14):[];
  const rows=Array.isArray(body.rows)?body.rows.slice(0,5000):[];
  const weightSum=cols.reduce((sum,c)=>sum+Math.max(1,Number(c.width||1)),0)||1;
  const avail=W-margin*2;
  const widths=cols.map(c=>avail*Math.max(1,Number(c.width||1))/weightSum);
  const generated=new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short",timeZone:"America/Fortaleza"}).format(new Date());
  const navy=rgb(0.035,0.19,0.43),blue=rgb(.08,.30,.59),ink=rgb(.12,.16,.22),muted=rgb(.39,.45,.54),line=rgb(.84,.87,.91);
  let page:any,y=0;
  const pages:any[]=[];

  const titleText=clean(body.title||"Relatório");
  const subtitleText=clean(body.subtitle||"");
  const headerHeight=landscape?82:94;

  function drawHeader(){
    page=pdf.addPage(PAGE as [number,number]);pages.push(page);
    page.drawRectangle({x:0,y:H-headerHeight,width:W,height:headerHeight,color:navy});

    const logoBox=landscape?50:54;
    if(logo){
      const ratio=logo.width/logo.height||1;
      const max=logoBox-6;
      let iw=max,ih=iw/ratio;
      if(ih>max){ih=max;iw=ih*ratio}
      page.drawRectangle({x:margin,y:H-headerHeight+14,width:logoBox,height:logoBox,color:rgb(1,1,1),borderColor:rgb(.82,.88,.96),borderWidth:.5});
      page.drawImage(logo,{x:margin+(logoBox-iw)/2,y:H-headerHeight+14+(logoBox-ih)/2,width:iw,height:ih});
    }

    const tx=logo?margin+logoBox+14:margin;
    const rightW=landscape?170:140;
    const rightX=W-margin-rightW;
    const titleMax=Math.max(150,rightX-tx-14);

    page.drawText("COLÉGIO FUTURO",{x:tx,y:H-24,size:8.2,font:bold,color:rgb(.72,.84,1)});
    let tSize=landscape?16.5:15.2;
    let titleLines=wrap(titleText,bold,tSize,titleMax);
    if(titleLines.length>2){tSize-=1.2;titleLines=wrap(titleText,bold,tSize,titleMax)}
    titleLines=titleLines.slice(0,2);
    let ty=H-43;
    for(const ln of titleLines){
      page.drawText(ln,{x:tx,y:ty,size:tSize,font:bold,color:rgb(1,1,1)});
      ty-=tSize+2;
    }

    if(subtitleText){
      const subLines=wrap(subtitleText,regular,7.4,titleMax).slice(0,2);
      let sy=ty-1;
      for(const ln of subLines){
        page.drawText(ln,{x:tx,y:sy,size:7.4,font:regular,color:rgb(.87,.93,1)});
        sy-=9;
      }
    }

    page.drawText("Gestão Futuro",{x:rightX,y:H-26,size:8,font:bold,color:rgb(.83,.90,1)});
    page.drawText("Relatório institucional",{x:rightX,y:H-38,size:7.3,font:regular,color:rgb(.83,.90,1)});
    page.drawText("Gerado em "+generated,{x:rightX,y:H-52,size:6.9,font:regular,color:rgb(.78,.86,.96),maxWidth:rightW});

    y=H-headerHeight-12;
    if(body.meta?.length){
      const metaParts=body.meta.map(m=>clean(m.label)+": "+clean(m.value));
      const metaLines=wrap(metaParts.join("   |   "),regular,7.2,avail).slice(0,3);
      for(const ln of metaLines){
        page.drawText(ln,{x:margin,y,size:7.2,font:regular,color:muted});
        y-=9;
      }
      y-=4;
    }

    if(body.summary?.length){
      const items=body.summary.slice(0,4),gap=6,n=items.length,w=(avail-gap*Math.max(0,n-1))/Math.max(1,n);
      items.forEach((item,i)=>{
        const x=margin+i*(w+gap);
        page.drawRectangle({x,y:y-34,width:w,height:34,color:rgb(.96,.975,.995),borderColor:rgb(.82,.87,.94),borderWidth:.6});
        const labs=wrap(clean(item.label),bold,6.4,w-14).slice(0,2);
        let ly=y-10;
        for(const ln of labs){page.drawText(ln,{x:x+7,y:ly,size:6.4,font:bold,color:rgb(.35,.42,.52)});ly-=7}
        const value=clean(item.value);
        let vSize=value.length>24?8.5:10.2;
        page.drawText(value,{x:x+7,y:y-28,size:vSize,font:bold,color:rgb(.04,.25,.53),maxWidth:w-14});
      });
      y-=42;
    }
  }

  function drawTableHead(){
    if(!cols.length)return;
    const labels=cols.map((c,i)=>wrap(clean(c.label),bold,6.7,widths[i]-8).slice(0,2));
    const maxLines=Math.max(1,...labels.map(x=>x.length));
    const h=Math.max(22,11+maxLines*7);
    let x=margin;
    page.drawRectangle({x:margin,y:y-h,width:avail,height:h,color:blue});
    cols.forEach((c,i)=>{
      let yy=y-12;
      for(const ln of labels[i]){
        page.drawText(ln,{x:x+4,y:yy,size:6.7,font:bold,color:rgb(1,1,1),maxWidth:widths[i]-8});
        yy-=7.2;
      }
      x+=widths[i];
    });
    y-=h;
  }

  function ensureSpace(required:number,withTableHead=true){
    if(y-required<footerH+margin){
      drawHeader();
      if(withTableHead)drawTableHead();
    }
  }

  drawHeader();

  if(chartImg){
    const chartTitle=clean(body.chartTitle||"Distribuição");
    if(chartTitle){
      ensureSpace(20,false);
      page.drawText(chartTitle,{x:margin,y,size:8.8,font:bold,color:rgb(.04,.25,.53)});y-=13;
    }
    const maxW=avail,maxH=landscape?150:175;
    let drawW=maxW,drawH=drawW/chartRatio;
    if(drawH>maxH){drawH=maxH;drawW=drawH*chartRatio}
    ensureSpace(drawH+14,false);
    page.drawRectangle({x:margin,y:y-drawH,width:avail,height:drawH,color:rgb(.985,.99,1),borderColor:rgb(.84,.88,.94),borderWidth:.6});
    page.drawImage(chartImg,{x:margin+(avail-drawW)/2,y:y-drawH,width:drawW,height:drawH});
    y-=drawH+12;
  }

  drawTableHead();

  rows.forEach((row,ri)=>{
    const cellLines=cols.map((c,i)=>{
      if(body.signature&&c.key==="assinatura")return [""];
      const limit=body.signature?3:5;
      return wrap(val(row,c.key),regular,7,widths[i]-8).slice(0,limit);
    });
    const maxLines=Math.max(1,...cellLines.map(a=>a.length));
    const rowH=Math.max(body.signature?34:20,Math.min(body.signature?48:58,maxLines*9+8));
    ensureSpace(rowH+2,true);

    if(ri%2===1)page.drawRectangle({x:margin,y:y-rowH,width:avail,height:rowH,color:rgb(.975,.982,.992)});
    page.drawLine({start:{x:margin,y:y-rowH},end:{x:margin+avail,y:y-rowH},thickness:.35,color:line});

    let x=margin;
    cols.forEach((c,i)=>{
      if(body.signature&&c.key==="assinatura"){
        const sy=y-rowH/2-2;
        page.drawLine({start:{x:x+9,y:sy},end:{x:x+widths[i]-9,y:sy},thickness:.5,color:rgb(.42,.47,.54)});
      }else{
        const lines=cellLines[i];let yy=y-12;
        for(const ln of lines){
          const tw=regular.widthOfTextAtSize(ln,7);
          let dx=x+4;
          if(c.align==="right")dx=x+widths[i]-4-tw;
          else if(c.align==="center")dx=x+(widths[i]-tw)/2;
          page.drawText(ln,{x:Math.max(x+3,dx),y:yy,size:7,font:regular,color:ink,maxWidth:widths[i]-8});
          yy-=9;
        }
      }
      x+=widths[i];
    });
    y-=rowH;
  });

  if(!rows.length){
    ensureSpace(64,false);
    page.drawRectangle({x:margin,y:y-52,width:avail,height:52,color:rgb(.98,.985,.992),borderColor:rgb(.86,.89,.93),borderWidth:.6});
    page.drawText("Nenhum registro encontrado",{x:margin+12,y:y-21,size:10,font:bold,color:rgb(.23,.31,.43)});
    page.drawText("Não existem dados cadastrados para os filtros escolhidos neste relatório.",{x:margin+12,y:y-37,size:7.8,font:regular,color:muted,maxWidth:avail-24});
    y-=60;
  }

  pages.forEach((p,i)=>{
    p.drawLine({start:{x:margin,y:24},end:{x:W-margin,y:24},thickness:.4,color:rgb(.82,.85,.89)});
    p.drawText("Colégio Futuro • Gestão Futuro • PDF Solução Educacional",{x:margin,y:10,size:6.4,font:regular,color:rgb(.45,.49,.55)});
    const txt="Página "+(i+1)+" de "+pages.length;
    p.drawText(txt,{x:W-margin-regular.widthOfTextAtSize(txt,6.4),y:10,size:6.4,font:regular,color:rgb(.45,.49,.55)});
  });

  pdf.setTitle(titleText);
  pdf.setAuthor("Colégio Futuro");
  pdf.setSubject(subtitleText||"Relatório institucional");
  pdf.setCreator("Gestão Futuro");
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
  for(const sh of (body.extraSheets||[])){
    const name=clean(sh.name||"Resumo").slice(0,31)||"Resumo";
    const data=[(sh.columns||[]).map(clean),...((sh.rows||[]).map(r=>r.map(v=>typeof v==="number"?v:clean(v))))];
    const ex=XLSX.utils.aoa_to_sheet(data);
    if((sh.columns||[]).length){
      ex["!cols"]=(sh.columns||[]).map(()=>({wch:22}));
      ex["!autofilter"]={ref:XLSX.utils.encode_range({r:0,c:0},{r:Math.max(0,data.length-1),c:Math.max(0,(sh.columns||[]).length-1)})};
    }
    XLSX.utils.book_append_sheet(wb,ex,name);
  }
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
