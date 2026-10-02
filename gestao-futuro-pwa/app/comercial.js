
const GF_SERIES=["Infantil 2","Infantil 3","Infantil 4","Infantil 5","1º Ano","2º Ano","3º Ano","4º Ano","5º Ano","6º Ano","7º Ano","8º Ano","9º Ano","1º EM","2º EM","3º EM"];
const GF_STAGES=["Contato","Perfil","Interesse","Visita","Proposta","Decisão","Matriculado"];
const GF_PCT={Contato:12,Perfil:28,Interesse:43,Visita:58,Proposta:72,"Decisão":88,Matriculado:100,"Não converteu":100};
function gfYear(p){var m=(String(p&&p.ID_PRODUTO||"")+" "+String(p&&p.PRODUTO||"")).match(/20\d{2}/);return Number(p&&p.ANO_LETIVO)||Number(m&&m[0])||0}
function gfNorm(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}
function gfSpecificSeries(p){
  var t=gfNorm((p&&p.PRODUTO||"")+" "+(p&&p["DESCRIÇÃO"]||""));
  var m=t.match(/infantil\s*([2-5])\b/);
  if(m)return "infantil "+m[1];
  if(!/\b[1-9]\s*(?:º|o)?\s*(?:ao|a)\s*[1-9]/.test(t)){
    m=t.match(/\b([1-9])\s*(?:º|o)?\s*ano\b/);
    if(m)return m[1]+" ano";
    m=t.match(/\b([1-3])\s*(?:º|o)?\s*(?:em|ensino medio)\b/);
    if(m)return m[1]+" em";
  }
  return "";
}
function gfTargetSeriesKey(serie){
  var s=gfNorm(serie),m;
  m=s.match(/infantil\s*([2-5])\b/);if(m)return "infantil "+m[1];
  m=s.match(/\b([1-9])\s*(?:º|o)?\s*ano\b/);if(m)return m[1]+" ano";
  m=s.match(/\b([1-3])\s*(?:º|o)?\s*em\b/);if(m)return m[1]+" em";
  return s;
}
function gfApplies(p,serie){
  var s=gfNorm(serie),a=gfNorm(p&&p["SEGMENTO_SÉRIE"]||""),specific=gfSpecificSeries(p),target=gfTargetSeriesKey(serie);
  if(specific)return specific===target;
  if(!s||!a||a.includes("todos"))return true;
  if(s.includes("infantil"))return a.includes("infantil");
  var n=Number((s.match(/\d+/)||[0])[0]);
  if(s.includes("ano")&&n<=5)return a.includes("1º ao 5º")||a.includes("1o ao 5o")||a.includes("anos iniciais")||a.includes(s);
  if(s.includes("ano")&&n>=6)return a.includes("6º ao 9º")||a.includes("6o ao 9o")||a.includes("anos finais")||a.includes(s);
  if(s.includes("em"))return a.includes("medio")||a.includes("ensino medio")||a.includes(s);
  return a.includes(s)
}
function gfCatalog(ps,y,s){return (ps||[]).filter(function(p){var pub=gfNorm(p.PUBLICADO_ATENDIMENTO);return p.ATIVO==="Sim"&&gfYear(p)===Number(y)&&pub==="sim"&&gfApplies(p,s)}).sort(function(a,b){var oa=Number(a.ORDEM_EXIBICAO||100),ob=Number(b.ORDEM_EXIBICAO||100);return oa-ob||String(a.CATEGORIA||"").localeCompare(String(b.CATEGORIA||""),"pt-BR")||String(a.PRODUTO||"").localeCompare(String(b.PRODUTO||""),"pt-BR",{numeric:true})})}
function gfGroups(list){var m={};list.forEach(function(p){var k=p.CATEGORIA||"Outros";(m[k]||(m[k]=[])).push(p)});return m}
function gfRound2(v){return Math.round((Number(v||0)+Number.EPSILON)*100)/100}
function gfIsStiProduct(p){
  var txt=gfNorm([p&&p.ID_PRODUTO,p&&p.CATEGORIA,p&&p.SUBCATEGORIA,p&&p.PRODUTO,p&&p.OBSERVACAO,p&&p["DESCRIÇÃO"]].filter(Boolean).join(" "));
  return /(^|[^a-z])s\.?t\.?i\.?([^a-z]|$)|sistema de tempo integral/.test(txt);
}
function gfIsStiUniformProduct(p){return gfIsStiProduct(p)&&gfIsUniformProduct(p)}
function gfIsRecurringStiProduct(p){return gfIsStiProduct(p)&&!gfIsUniformProduct(p)}
function gfPresentedValue(p){return parseMoney(p&&((p.VALOR_PARCELA!==""&&p.VALOR_PARCELA!=null)?p.VALOR_PARCELA:p.VALOR_BASE))}
function gfInitialExtrasFromProducts(list){
  return (list||[]).filter(function(p){return !gfIsRecurringStiProduct(p)}).reduce(function(sum,p){return sum+parseMoney(p.VALOR_BASE)},0);
}
function gfInitialExtrasFromItems(list){
  return (list||[]).filter(function(it){return !gfIsRecurringStiProduct(it)}).reduce(function(sum,it){return sum+parseMoney(it.VALOR_APRESENTADO||it.VALOR_TABELA||0)*Math.max(1,Number(it.QTD)||1)},0);
}
function gfInitialInvestment(rec,itens){
  var first=parseMoney(rec&&((rec.VALOR_PRIMEIRA_FINAL!==""&&rec.VALOR_PRIMEIRA_FINAL!=null)?rec.VALOR_PRIMEIRA_FINAL:rec.VALOR_PRIMEIRA_BASE));
  return gfRound2(first+gfInitialExtrasFromItems(itens));
}
function gfAnnualProduct(list){return (list||[]).find(function(p){return p.CATEGORIA==="Mensalidade"&&(gfNorm(p.SUBCATEGORIA).includes("anuidade")||gfNorm(p.PRODUTO).includes("anuidade"))})||null}
function gfFirstProduct(list){return (list||[]).find(function(p){var t=gfNorm([p&&p.SUBCATEGORIA,p&&p.PRODUTO].filter(Boolean).join(" "));return p&&p.CATEGORIA==="Mensalidade"&&(t.includes("1ª parcela")||t.includes("1a parcela")||t.includes("primeira parcela"))})||null}
function gfRecurringProduct(list,n){return (list||[]).find(function(p){return p.CATEGORIA==="Mensalidade"&&Number(p.QTD_PARCELAS)===Number(n)})||null}
function gfPlanCalc(list,n,discFirst,discRecurring){
  n=Math.max(1,Math.trunc(Number(n||12)));discFirst=Math.max(0,Math.min(100,Number(discFirst||0)));discRecurring=Math.max(0,Math.min(100,Number(discRecurring||0)));
  var annual=gfAnnualProduct(list),firstProduct=gfFirstProduct(list),monthly=gfRecurringProduct(list,n),annualCents=Math.round(parseMoney(annual&&annual.VALOR_BASE)*100),annualValue=annualCents/100;
  var recurringCents=Math.round(parseMoney(monthly&&(monthly.VALOR_PARCELA||monthly.VALOR_BASE))*100);
  var ref=parseMoney(firstProduct&&(firstProduct.VALOR_BASE||firstProduct.VALOR_PARCELA)),y=gfYear(annual||monthly||firstProduct),seg=gfNorm((annual||monthly||firstProduct||{})["SEGMENTO_SÉRIE"]||"");
  if(!ref&&typeof GF_FIRST_REFERENCE!=="undefined"&&GF_FIRST_REFERENCE[y]){
    var key=seg.includes("infantil")?"infantil":(seg.includes("1º ao 5º")||seg.includes("1o ao 5o")||seg.includes("iniciais"))?"iniciais":(seg.includes("6º ao 9º")||seg.includes("6o ao 9o")||seg.includes("finais"))?"finais":"";
    ref=Number(key&&GF_FIRST_REFERENCE[y][key]||0);
  }
  var firstCents=Math.round(ref*100);
  if(!recurringCents&&annualCents&&firstCents)recurringCents=Math.round((annualCents-firstCents)/n);
  if(!firstCents&&annualCents&&recurringCents)firstCents=annualCents-(recurringCents*n);
  if(!firstCents||firstCents<=0){
    recurringCents=recurringCents||Math.round(annualCents/(n+1));
    firstCents=annualCents-(recurringCents*n);
  }
  if(!annualCents){annualCents=firstCents+(recurringCents*n);annualValue=annualCents/100}
  var firstBase=firstCents/100,recurringBase=recurringCents/100,tableTotalCents=firstCents+(recurringCents*n);
  var firstFinalCents=Math.round(firstCents*(100-discFirst)/100),recurringFinalCents=Math.round(recurringCents*(100-discRecurring)/100);
  var firstFinal=firstFinalCents/100,recurringFinal=recurringFinalCents/100,totalCents=firstFinalCents+(recurringFinalCents*n),total=totalCents/100,economy=Math.max(0,(tableTotalCents-totalCents)/100);
  return {n:n,annual:annual,firstProduct:firstProduct,annualValue:annualValue,monthly:monthly,firstBase:firstBase,recurringBase:recurringBase,discFirst:discFirst,discRecurring:discRecurring,firstFinal:firstFinal,recurringFinal:recurringFinal,total:total,economy:economy,tableTotal:tableTotalCents/100};
}
function gfPlanSummary(plan){return "1ª parcela "+money(plan.firstFinal)+" + "+plan.n+"x de "+money(plan.recurringFinal)}
function gfStiPlanSync(plan,stiValue){
  var n=Math.max(1,Number(plan&&plan.n||12)),regular=parseMoney(plan&&plan.recurringFinal||0),sti=parseMoney(stiValue||0),aligned=Math.min(n,12),stiOnly=Math.max(0,12-n);
  return {
    regularInstallments:n,
    stiInstallments:12,
    alignedInstallments:aligned,
    stiOnlyInstallments:stiOnly,
    firstRegular:parseMoney(plan&&plan.firstFinal||0),
    regularValue:regular,
    stiValue:sti,
    combinedValue:gfRound2(regular+sti),
    label:n===12?("1ª parcela regular de "+money(parseMoney(plan&&plan.firstFinal||0))+" + 12x de "+money(regular+sti)):("1ª parcela regular de "+money(parseMoney(plan&&plan.firstFinal||0))+" + "+n+"x de "+money(regular+sti)+(stiOnly?(" + "+stiOnly+"x final de "+money(sti)+" somente S.T.I."):"")),
    note:n===12?"O S.T.I. acompanha as 12 parcelas regulares e não entra na 1ª parcela.":"O S.T.I. continua em 12 parcelas: acompanha as parcelas regulares e completa o restante sozinho."
  };
}
function gfFlyerPlanMeta(p,list){
  if(p.CATEGORIA!=="Mensalidade")return null;
  var q=Number(p.QTD_PARCELAS||0);
  if(q===11||q===12){
    var pl=gfPlanCalc(list,q,0,0);
    return {title:"Plano 1ª parcela + "+q+"x",desc:"1ª parcela: "+money(pl.firstBase)+" • "+q+" parcelas de "+money(pl.recurringBase),value:money(pl.recurringBase)};
  }
  if(gfNorm(p.SUBCATEGORIA).includes("anuidade")||gfNorm(p.PRODUTO).includes("anuidade")){
    return {title:p.PRODUTO,desc:"Anuidade total",value:money(p.VALOR_BASE)};
  }
  return null;
}
function gfOptions(sel){return GF_SERIES.map(function(s){return "<option "+(s===sel?"selected":"")+">"+esc(s)+"</option>"}).join("")}
function gfStageButtons(){return GF_STAGES.map(function(s,i){return "<button type='button' data-stage='"+esc(s)+"'><i>"+(i+1)+"</i><span>"+esc(s)+"</span></button>"}).join("")+"<button type='button' class='loss' data-stage='Não converteu'><i>×</i><span>Não converteu</span></button>"}
function gfAutoStage(){
  var f=$("#attForm");if(!f)return state.attendanceStage||"Contato";
  var d=Object.fromEntries(new FormData(f).entries()),stage="Contato";
  var hasContact=String(d.RESPONSAVEL||"").trim()&&(String(d.TELEFONE||"").trim()||String(d.EMAIL||"").trim());
  var hasProfile=String(d.NOME_ALUNO||"").trim()&&String(d.TIPO_ALUNO||"").trim();
  var hasInterest=String(d.SERIE_PRETENDIDA||"").trim()&&String(d.ANO_LETIVO||"").trim();
  var hasProposal=Number(d.TOTAL_PLANO||0)>0||(state.attendanceItems&&state.attendanceItems.size>0);
  if(hasContact)stage="Perfil";
  if(hasContact&&hasProfile)stage="Interesse";
  if(hasContact&&hasProfile&&hasInterest)stage="Visita";
  if(hasContact&&hasProfile&&hasInterest&&hasProposal)stage="Proposta";
  if(state.currentAttendanceId&&!String(state.currentAttendanceId).startsWith("LOCAL-")&&hasProposal)stage="Decisão";
  if(state.attendanceStage==="Matriculado"||state.attendanceStage==="Não converteu")stage=state.attendanceStage;
  return stage;
}
function gfRefreshStage(auto){
  if(auto){var next=gfAutoStage(),cur=GF_STAGES.indexOf(state.attendanceStage),ni=GF_STAGES.indexOf(next);if(ni>cur||cur<0)state.attendanceStage=next}
  var pct=GF_PCT[state.attendanceStage]||0;
  $$("#stageFlow [data-stage]").forEach(function(b){var bi=GF_STAGES.indexOf(b.dataset.stage),ci=GF_STAGES.indexOf(state.attendanceStage);b.classList.toggle("active",b.dataset.stage===state.attendanceStage);b.classList.toggle("done",bi>=0&&ci>=0&&bi<ci)});
  if($("#stagePct"))$("#stagePct").textContent=pct+"%";
  if($("#stageBar"))$("#stageBar").style.width=pct+"%";
  gfSaveAttendanceDraft();
}


const GF_ATT_DRAFT_KEY="gestao_futuro_atendimento_rascunho_v1";
function gfSaveAttendanceDraft(){
  var f=$("#attForm");if(!f)return;
  var data=Object.fromEntries(new FormData(f).entries());
  data.ID_ALUNO=$("#attStudent")?.value||"";
  data.ETAPA=state.attendanceStage||"Contato";
  data.ITENS=[...(state.attendanceItems||new Set())];
  data.MODO_REGISTRO=currentRunMode();
  data.SESSAO_TESTE=state.runMode==="TESTE"?ensureTestSession():"";
  data.SAVED_AT=new Date().toISOString();
  try{localStorage.setItem(GF_ATT_DRAFT_KEY,JSON.stringify(data))}catch(e){}
}
function gfLoadAttendanceDraft(){try{const d=JSON.parse(localStorage.getItem(GF_ATT_DRAFT_KEY)||"null");return d&&(d.MODO_REGISTRO||"PRODUCAO")===currentRunMode()?d:null}catch(e){return null}}
function gfClearAttendanceDraft(){try{localStorage.removeItem(GF_ATT_DRAFT_KEY)}catch(e){}}
function gfSavedAttendanceKey(id){return "gestao_futuro_atendimento_salvo_"+String(id||"")}
function gfCacheSavedAttendance(id,rec,itens){try{localStorage.setItem(gfSavedAttendanceKey(id),JSON.stringify({atendimento:rec,itens:itens||[],cachedAt:new Date().toISOString()}))}catch(e){}}
function gfReadCachedAttendance(id){try{return JSON.parse(localStorage.getItem(gfSavedAttendanceKey(id))||"null")}catch(e){return null}}
const GF_ADDRESS_MARKER_RE=/\n?\[\[GF_ENDERECO:([^\]]+)\]\]/g;
function gfCepDigits(v){return String(v||"").replace(/\D/g,"").slice(0,8)}
function gfCepMask(v){var d=gfCepDigits(v);return d.length>5?d.slice(0,5)+"-"+d.slice(5):d}
function gfAddressObject(data){
  return {CEP:gfCepMask(data&&data.CEP),LOGRADOURO:String(data&&data.LOGRADOURO||"").trim(),BAIRRO:String(data&&data.BAIRRO||"").trim(),CIDADE:String(data&&data.CIDADE||"").trim(),UF:String(data&&data.UF||"").trim().toUpperCase().slice(0,2),NUMERO:String(data&&data.NUMERO||"").trim(),COMPLEMENTO:String(data&&data.COMPLEMENTO||"").trim()};
}
function gfAddressHasValue(a){return !!(a&&Object.values(a).some(function(v){return String(v||"").trim()}))}
function gfAddressLine(data){
  var a=gfAddressObject(data),parts=[];
  if(a.LOGRADOURO)parts.push(a.LOGRADOURO+(a.NUMERO?", "+a.NUMERO:""));
  else if(a.NUMERO)parts.push("Nº "+a.NUMERO);
  if(a.COMPLEMENTO)parts.push(a.COMPLEMENTO);
  if(a.BAIRRO)parts.push(a.BAIRRO);
  var city=[a.CIDADE,a.UF].filter(Boolean).join(" - ");if(city)parts.push(city);
  return parts.join(" • ");
}
function gfHydrateAddressCompat(rec){
  if(!rec||typeof rec!=="object")return rec;
  var out=Object.assign({},rec),obs=String(out.OBSERVACAO||""),m,last=null;
  GF_ADDRESS_MARKER_RE.lastIndex=0;
  while((m=GF_ADDRESS_MARKER_RE.exec(obs))){try{last=JSON.parse(decodeURIComponent(m[1]))}catch(e){}}
  GF_ADDRESS_MARKER_RE.lastIndex=0;out.OBSERVACAO=obs.replace(GF_ADDRESS_MARKER_RE,"").trim();
  if(last&&typeof last==="object")Object.keys(gfAddressObject(last)).forEach(function(k){if(!out[k])out[k]=last[k]||""});
  return out;
}
function gfPayloadWithAddressCompat(data){
  var out=Object.assign({},data),a=gfAddressObject(out),obs=String(out.OBSERVACAO||"");
  GF_ADDRESS_MARKER_RE.lastIndex=0;obs=obs.replace(GF_ADDRESS_MARKER_RE,"").trim();
  if(!(state.backendCaps&&state.backendCaps.addressFields===true)&&gfAddressHasValue(a))obs+=(obs?"\n":"")+"[[GF_ENDERECO:"+encodeURIComponent(JSON.stringify(a))+"]]";
  out.OBSERVACAO=obs;return out;
}
async function gfLookupCep(cep){
  var d=gfCepDigits(cep);if(d.length!==8)throw new Error("Informe os 8 números do CEP.");
  var ctl=new AbortController(),timer=setTimeout(function(){ctl.abort()},6500);
  try{
    var r=await fetch("https://viacep.com.br/ws/"+d+"/json/",{cache:"no-store",signal:ctl.signal});
    if(r.ok){var v=await r.json();if(v&&!v.erro)return {CEP:gfCepMask(d),LOGRADOURO:v.logradouro||"",BAIRRO:v.bairro||"",CIDADE:v.localidade||"",UF:v.uf||""};}
  }catch(e){}finally{clearTimeout(timer)}
  var ctl2=new AbortController(),timer2=setTimeout(function(){ctl2.abort()},6500);
  try{
    var r2=await fetch("https://brasilapi.com.br/api/cep/v1/"+d,{cache:"no-store",signal:ctl2.signal});
    if(!r2.ok)throw new Error("CEP não localizado.");
    var b=await r2.json();return {CEP:gfCepMask(d),LOGRADOURO:b.street||"",BAIRRO:b.neighborhood||"",CIDADE:b.city||"",UF:b.state||""};
  }catch(e){throw new Error("Não foi possível localizar esse CEP. Você pode preencher o endereço manualmente.")}finally{clearTimeout(timer2)}
}
function gfBindAttendanceCep(){
  var cep=$("#attCep");if(!cep)return;
  var status=$("#attCepStatus"),timer=null,last="";
  function setStatus(msg,kind){if(!status)return;status.textContent=msg||"";status.className="cep-status "+(kind||"")}
  async function lookup(){
    var d=gfCepDigits(cep.value);if(d.length!==8){setStatus(d.length?"Complete os 8 números do CEP.":"","");return}
    if(d===last&&$("#attCity")?.value)return;
    last=d;setStatus("Buscando endereço…","loading");
    try{
      var a=await gfLookupCep(d);cep.value=a.CEP;
      if($("#attStreet")&&!$("#attStreet").value)$("#attStreet").value=a.LOGRADOURO;
      if($("#attDistrict")&&!$("#attDistrict").value)$("#attDistrict").value=a.BAIRRO;
      if($("#attCity"))$("#attCity").value=a.CIDADE;if($("#attUf"))$("#attUf").value=a.UF;
      setStatus(a.LOGRADOURO?"Endereço localizado ✓":"CEP localizado. Complete o logradouro.","ok");
      gfSaveAttendanceDraft();setTimeout(function(){$("#attNumber")?.focus()},100);
    }catch(e){setStatus(e.message,"error")}
  }
  cep.addEventListener("input",function(){this.value=gfCepMask(this.value);clearTimeout(timer);if(gfCepDigits(this.value).length===8)timer=setTimeout(lookup,320)});
  cep.addEventListener("blur",lookup);
}

const GF_ATT_LOCAL_LIST_KEY="gestao_futuro_atendimentos_locais_v1";
function gfLocalAttendances(){try{const rows=JSON.parse(localStorage.getItem(GF_ATT_LOCAL_LIST_KEY)||"[]");return Array.isArray(rows)?rows:[]}catch(e){return []}}
function gfWriteLocalAttendances(list){try{localStorage.setItem(GF_ATT_LOCAL_LIST_KEY,JSON.stringify(list||[]))}catch(e){throw new Error("Não foi possível salvar neste dispositivo. Libere espaço e tente novamente antes de fechar o atendimento.")}}
function gfUpsertLocalAttendance(rec,itens,status){
  var list=gfLocalAttendances(),id=String(rec.ID_ATENDIMENTO||("LOCAL-"+crypto.randomUUID()));
  rec.ID_ATENDIMENTO=id;rec.SYNC_STATUS=status||rec.SYNC_STATUS||"Pendente";
  var row={id:id,atendimento:rec,itens:itens||[],updatedAt:new Date().toISOString()};
  var i=list.findIndex(function(x){return x.id===id});if(i>=0)list[i]=row;else list.unshift(row);
  gfWriteLocalAttendances(list);gfCacheSavedAttendance(id,rec,itens||[]);return id;
}
function gfRemoveLocalAttendance(id){gfWriteLocalAttendances(gfLocalAttendances().filter(function(x){return x.id!==id}))}
function gfRemoveAttendanceCache(id){
  try{localStorage.removeItem(gfSavedAttendanceKey(id))}catch(e){}
  var d=gfLoadAttendanceDraft();if(d&&String(d.ID_ATENDIMENTO||"")===String(id||""))gfClearAttendanceDraft();
}
async function gfEnsureJsPdf(){
  if(window.jspdf&&window.jspdf.jsPDF)return window.jspdf.jsPDF;
  await new Promise(function(resolve,reject){
    var old=document.querySelector("script[data-jspdf]");
    if(old){old.addEventListener("load",resolve,{once:true});old.addEventListener("error",reject,{once:true});return}
    var s=document.createElement("script");s.dataset.jspdf="1";s.src="/vendor/jspdf.umd.min.js";s.onload=resolve;s.onerror=function(){s.remove();reject(new Error("Não foi possível carregar o gerador de PDF."))};document.head.appendChild(s);
  });
  if(!(window.jspdf&&window.jspdf.jsPDF))throw new Error("Gerador de PDF indisponível.");
  return window.jspdf.jsPDF;
}
function gfPdfText(v){return String(v==null?"":v)}
function gfPdfFile(v){return String(v||"atendimento").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"_").replace(/^_+|_+$/g,"")}
async function gfPdfBrandPng(){
  try{
    var src=window.FUTURO_BRAND&&(window.FUTURO_BRAND.logoWide||window.FUTURO_BRAND.logo);if(!src)return null;
    return await new Promise(function(resolve){
      var img=new Image();
      img.onload=function(){
        try{
          var maxW=900,scale=Math.min(1,maxW/(img.naturalWidth||maxW)),w=Math.max(1,Math.round((img.naturalWidth||1)*scale)),h=Math.max(1,Math.round((img.naturalHeight||1)*scale));
          var source=document.createElement("canvas");source.width=w;source.height=h;var sx=source.getContext("2d");
          sx.clearRect(0,0,w,h);sx.drawImage(img,0,0,w,h);
          var px=sx.getImageData(0,0,w,h).data,minX=w,minY=h,maxX=-1,maxY=-1;
          for(var yy=0;yy<h;yy++)for(var xx=0;xx<w;xx++){
            var i=(yy*w+xx)*4,a=px[i+3],r=px[i],g=px[i+1],b=px[i+2];
            if(a>18){if(xx<minX)minX=xx;if(xx>maxX)maxX=xx;if(yy<minY)minY=yy;if(yy>maxY)maxY=yy}
          }
          if(maxX<minX||maxY<minY){minX=0;minY=0;maxX=w-1;maxY=h-1}
          var pad=Math.max(4,Math.round(Math.max(maxX-minX+1,maxY-minY+1)*0.035));
          minX=Math.max(0,minX-pad);minY=Math.max(0,minY-pad);maxX=Math.min(w-1,maxX+pad);maxY=Math.min(h-1,maxY+pad);
          var cw=maxX-minX+1,ch=maxY-minY+1,cv=document.createElement("canvas");cv.width=cw;cv.height=ch;var cx=cv.getContext("2d");
          cx.clearRect(0,0,cw,ch);cx.drawImage(source,minX,minY,cw,ch,0,0,cw,ch);
          resolve({data:cv.toDataURL("image/png"),ratio:cw/ch});
        }catch(e){resolve(null)}
      };
      img.onerror=function(){resolve(null)};
      img.src=src;
    });
  }catch(e){return null}
}
async function gfPdfImagePng(src){
  try{
    src=String(src||"").trim();if(!src)return null;
    return await new Promise(function(resolve){
      var img=new Image();
      img.onload=function(){
        try{
          var maxW=1100,scale=Math.min(1,maxW/(img.naturalWidth||maxW)),w=Math.max(1,Math.round((img.naturalWidth||1)*scale)),h=Math.max(1,Math.round((img.naturalHeight||1)*scale));
          var cv=document.createElement("canvas");cv.width=w;cv.height=h;var cx=cv.getContext("2d");
          cx.fillStyle="#ffffff";cx.fillRect(0,0,w,h);cx.drawImage(img,0,0,w,h);
          resolve({data:cv.toDataURL("image/png"),ratio:w/h});
        }catch(e){resolve(null)}
      };
      img.onerror=function(){resolve(null)};
      img.src=src;
    });
  }catch(e){return null}
}
function gfIsUniformProduct(p){
  var txt=[p&&p.CATEGORIA,p&&p.SUBCATEGORIA,p&&p.PRODUTO,p&&p.OBSERVACAO,p&&p["DESCRIÇÃO"]].filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  return /fard|uniform|camisa|camiseta|bermuda|short|calca escolar|calça escolar|casaco escolar/.test(txt);
}
function gfUniformAssetKeyForProduct(p,serie){
  var seg=gfUniformSegment(serie),txt=[p&&p.CATEGORIA,p&&p.SUBCATEGORIA,p&&p.PRODUTO,p&&p.OBSERVACAO,p&&p["DESCRIÇÃO"]].filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  if(gfIsStiUniformProduct(p))return "lancamentos";
  var sports=/esport|educacao fisica|educação física|ed\. fisica|ed\. física/.test(txt);
  if(seg==="infantil")return "infantil";
  if(seg==="iniciais")return sports?"esportes-iniciais":"iniciais";
  if(seg==="finais")return sports?"esportes-finais":"finais";
  return "";
}
function gfUniformAssetForProduct(p,serie){
  var k=gfUniformAssetKeyForProduct(p,serie);
  return k&&typeof GF_UNIFORM_ASSETS!=="undefined"?GF_UNIFORM_ASSETS[k]:null;
}
async function gfDownloadAttendancePdf(rec,itens){
  var JsPDF=await gfEnsureJsPdf(),brand=await gfPdfBrandPng(),doc=new JsPDF({unit:"mm",format:"a4",orientation:"portrait"});
  var W=210,H=297,M=13,y=0,contentBottom=277;
  var allItems=Array.isArray(itens)?itens:[],uniformGroups=[],uniformImages={},uniformRenderedItems=[];

  allItems.filter(gfIsUniformProduct).forEach(function(it){
    var asset=gfUniformAssetForProduct(it,rec.SERIE_PRETENDIDA);
    if(!asset)return;
    var key=asset.src,g=uniformGroups.find(function(x){return x.key===key});
    if(!g){g={key:key,asset:asset,items:[]};uniformGroups.push(g)}
    g.items.push(it);uniformRenderedItems.push(it);
  });
  // O fardamento já aparece com imagem e valores no bloco próprio.
  // Evita repetir as mesmas peças na lista geral e economiza espaço no A4.
  var displayItems=allItems.filter(function(it){return !uniformRenderedItems.includes(it)});
  var stiItems=displayItems.filter(gfIsRecurringStiProduct);
  var regularDisplayItems=displayItems.filter(function(it){return !gfIsRecurringStiProduct(it)});
  for(var ui=0;ui<uniformGroups.length;ui++){
    var ug=uniformGroups[ui];
    uniformImages[ug.key]=await gfPdfImagePng(ug.asset.src);
  }

  function drawHeader(){
    doc.setFillColor(18,59,118);doc.rect(0,0,W,32,"F");
    doc.setTextColor(190,218,249);doc.setFont("helvetica","bold");doc.setFontSize(7.6);doc.text("COLÉGIO FUTURO",M,9);
    doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(14.5);doc.text("Atendimento / Proposta de Matrícula",M,18);
    doc.setFont("helvetica","normal");doc.setFontSize(7.6);doc.setTextColor(222,235,250);doc.text("Gestão Futuro • Documento para conferência da família",M,25);
    if(brand&&brand.data){
      try{
        var boxW=27,boxH=27,ratio=brand.ratio||1,imgW=boxW,imgH=imgW/ratio;
        if(imgH>boxH){imgH=boxH;imgW=imgH*ratio}
        var x=W-M-imgW,yImg=(32-imgH)/2;
        doc.addImage(brand.data,"PNG",x,yImg,imgW,imgH);
      }catch(e){}
    }
    y=40;
    if(rec.MODO_REGISTRO==="TESTE"||currentRunMode()==="TESTE"){
      doc.setFillColor(255,247,219);doc.setTextColor(155,102,0);doc.roundedRect(M,y,W-M*2,8,1.8,1.8,"F");
      doc.setFont("helvetica","bold");doc.setFontSize(8.4);doc.text("TESTE / SIMULAÇÃO - SEM VALIDADE OPERACIONAL",M+4,y+5.4);y+=12;
    }
  }
  function ensure(h){
    if(y+h>contentBottom){doc.addPage();drawHeader()}
  }
  function section(t){
    ensure(10);doc.setTextColor(18,59,118);doc.setFont("helvetica","bold");doc.setFontSize(10.2);doc.text(t,M,y);
    y+=3.5;doc.setDrawColor(219,226,236);doc.line(M,y,W-M,y);y+=4.2;
  }
  function pair(label,value,label2,value2){
    ensure(11);
    var x2=107;
    doc.setFont("helvetica","normal");doc.setFontSize(6.7);doc.setTextColor(106,116,130);
    doc.text(label,M,y);if(label2)doc.text(label2,x2,y);
    y+=3.4;doc.setFont("helvetica","bold");doc.setFontSize(8.3);doc.setTextColor(27,43,68);
    var a=doc.splitTextToSize(gfPdfText(value)||"—",82),b=label2?doc.splitTextToSize(gfPdfText(value2)||"—",88):[];
    doc.text(a,M,y);if(label2)doc.text(b,x2,y);
    y+=Math.max(a.length,b.length||1)*3.3+2.1;
  }
  function item(it){
    ensure(11);
    var h=10.3;
    doc.setFillColor(247,249,252);doc.roundedRect(M,y-2.3,W-M*2,h,1.4,1.4,"F");
    doc.setFont("helvetica","bold");doc.setTextColor(28,46,77);doc.setFontSize(7.8);
    var title=doc.splitTextToSize(gfPdfText(it.PRODUTO||it.ID_PRODUTO),120);doc.text(title.slice(0,1),M+3,y+1.2);
    doc.setFont("helvetica","normal");doc.setTextColor(111,120,132);doc.setFontSize(6.3);
    var desc=doc.splitTextToSize(gfPdfText(it.OBSERVACAO||it["DESCRIÇÃO"]||it.CATEGORIA||""),118);if(desc[0])doc.text(desc.slice(0,1),M+3,y+5);
    var itemValue=Number(it.VALOR_APRESENTADO||it.VALOR_TABELA||0),priceText=itemValue>0?money(itemValue):"Sob consulta";
    if(gfIsRecurringStiProduct(it)&&itemValue>0)priceText="12x de "+money(itemValue);
    doc.setFont("helvetica","bold");doc.setTextColor(20,43,77);doc.setFontSize(gfIsRecurringStiProduct(it)?7.2:8);doc.text(priceText,W-M-3,y+1.6,{align:"right"});
    y+=12;
  }
  function uniformBlock(g){
    var img=uniformImages[g.key],boxH=img?44:24;ensure(boxH+10);
    doc.setFillColor(248,251,255);doc.setDrawColor(214,225,239);doc.roundedRect(M,y-2,W-M*2,boxH+6,2,2,"FD");
    var imgX=M+4,imgY=y+2,imgW=54,imgH=boxH-2;
    if(img&&img.data){
      try{
        var ratio=img.ratio||1.4,w=imgW,h=w/ratio;
        if(h>imgH){h=imgH;w=h*ratio}
        doc.addImage(img.data,"PNG",imgX+(imgW-w)/2,imgY,w,h);
      }catch(e){}
    }
    var tx=M+63;
    doc.setTextColor(18,59,118);doc.setFont("helvetica","bold");doc.setFontSize(9);doc.text(g.asset.label,tx,y+4);
    var yy=y+10,subtotal=0;
    g.items.forEach(function(it){
      var val=Number(it.VALOR_APRESENTADO||it.VALOR_TABELA||0);subtotal+=val;
      doc.setFont("helvetica","normal");doc.setTextColor(55,67,84);doc.setFontSize(7.2);
      var n=doc.splitTextToSize(gfPdfText(it.PRODUTO||it.ID_PRODUTO),78);doc.text(n.slice(0,1),tx,yy);
      doc.setFont("helvetica","bold");doc.setTextColor(20,43,77);doc.text(val>0?money(val):"Sob consulta",W-M-4,yy,{align:"right"});
      yy+=5.2;
    });
    doc.setDrawColor(220,228,238);doc.line(tx,yy-1.4,W-M-4,yy-1.4);
    doc.setFont("helvetica","bold");doc.setFontSize(7.5);doc.setTextColor(18,59,118);doc.text("Subtotal do fardamento",tx,yy+3);
    doc.text(subtotal>0?money(subtotal):"Valores sob consulta",W-M-4,yy+3,{align:"right"});
    y+=boxH+8;
  }
  function addFooters(){
    var pages=doc.getNumberOfPages();
    for(var p=1;p<=pages;p++){
      doc.setPage(p);doc.setDrawColor(225,230,237);doc.line(M,282,W-M,282);
      doc.setFont("helvetica","normal");doc.setFontSize(6.5);doc.setTextColor(120,128,140);
      doc.text("Colégio Futuro • Gestão Futuro • PDF Solução Educacional",M,288);
      doc.text("Página "+p+" de "+pages,W/2,288,{align:"center"});
      doc.text(new Date().toLocaleString("pt-BR"),W-M,288,{align:"right"});
    }
  }

  drawHeader();
  doc.setTextColor(20,43,77);doc.setFont("helvetica","bold");doc.setFontSize(13.5);doc.text("Atendimento "+gfPdfText(rec.ID_ATENDIMENTO||""),M,y);y+=6.2;

  pair("Aluno",rec.NOME_ALUNO,"Responsável",rec.RESPONSAVEL);
  pair("Ano letivo",rec.ANO_LETIVO,"Série",rec.SERIE_PRETENDIDA);
  pair("Tipo",rec.TIPO_ALUNO,"Turno / modalidade",(rec.TURNO||"")+" • "+(rec.MODALIDADE||""));
  pair("Telefone",rec.TELEFONE,"E-mail",rec.EMAIL);
  if(gfAddressHasValue(gfAddressObject(rec)))pair("Endereço",gfAddressLine(rec)||"—","CEP",gfCepMask(rec.CEP)||"—");
  pair("Etapa",rec.ETAPA,"Status",rec.STATUS);

  section("Plano financeiro");
  pair("Anuidade oficial",money(rec.VALOR_ANUIDADE),"Forma",rec.PLANO_PARCELAS?("1ª parcela + "+rec.PLANO_PARCELAS+"x"):"—");
  pair("1ª parcela",money(rec.VALOR_PRIMEIRA_FINAL||rec.VALOR_PRIMEIRA_BASE),"Parcelas seguintes",rec.PLANO_PARCELAS?(rec.PLANO_PARCELAS+"x de "+money(rec.VALOR_PARCELA_FINAL||rec.VALOR_PARCELA_BASE)):"—");
  pair("Desconto 1ª parcela",(Number(rec["DESCONTO_PRIMEIRA_%"]||0)).toLocaleString("pt-BR",{maximumFractionDigits:2})+"%","Desconto parcelas",(Number(rec["DESCONTO_PARCELAS_%"]||0)).toLocaleString("pt-BR",{maximumFractionDigits:2})+"%");
  pair("Anuidade negociada",money(rec.TOTAL_PLANO),"Economia",money(rec.ECONOMIA_PLANO));

  if(stiItems.length){
    section("Orçamento S.T.I. • Sistema de Tempo Integral");
    stiItems.forEach(function(sti){
      var stiValue=Number(sti.VALOR_APRESENTADO||sti.VALOR_TABELA||0),planSync=gfStiPlanSync({n:Number(rec.PLANO_PARCELAS||12),firstFinal:rec.VALOR_PRIMEIRA_FINAL||rec.VALOR_PRIMEIRA_BASE,recurringFinal:rec.VALOR_PARCELA_FINAL||rec.VALOR_PARCELA_BASE},stiValue);
      pair("Plano regular","1ª parcela + "+planSync.regularInstallments+"x","S.T.I.",stiValue>0?("12x de "+money(stiValue)):"Sob consulta");
      pair("Parcela combinada",stiValue>0?money(planSync.combinedValue):"A definir","Sincronização",planSync.regularInstallments===12?"12 parcelas combinadas":(planSync.alignedInstallments+" parcelas combinadas + "+planSync.stiOnlyInstallments+" S.T.I."));
      pair("Regra do S.T.I.",planSync.note,"Resumo",planSync.label);
    });
  }

  if(regularDisplayItems.length){
    section("Produtos e serviços selecionados");
    regularDisplayItems.forEach(item);
  }else if(!uniformGroups.length&&!stiItems.length){
    section("Produtos e serviços selecionados");
    ensure(8);doc.setFont("helvetica","normal");doc.setTextColor(105,115,130);doc.setFontSize(8);doc.text("Nenhum produto ou serviço adicional selecionado.",M,y);y+=7;
  }

  if(uniformGroups.length){
    section("Fardamento selecionado • imagem e valores");
    uniformGroups.forEach(uniformBlock);
  }

  section("Resumo");
  var initialInvestment=gfInitialInvestment(rec,allItems);
  ensure(22);doc.setFillColor(236,244,255);doc.roundedRect(M,y-2,W-M*2,20,2,2,"F");
  doc.setTextColor(18,59,118);doc.setFont("helvetica","bold");doc.setFontSize(7.4);doc.text("INVESTIMENTO INICIAL",M+4,y+3.8);
  doc.setFontSize(14);doc.text(money(initialInvestment),W-M-4,y+5,{align:"right"});
  doc.setFont("helvetica","normal");doc.setFontSize(6.5);doc.setTextColor(92,108,128);
  doc.text("1ª parcela + produtos/serviços de pagamento único. A anuidade é informativa e não é somada novamente.",M+4,y+11.2);
  if(stiItems.length)doc.text("O S.T.I. é apresentado separadamente como adicional mensal em 12 parcelas.",M+4,y+15.2);
  y+=23;

  if(rec.OBSERVACAO){
    section("Observações");doc.setFont("helvetica","normal");doc.setTextColor(60,70,85);doc.setFontSize(7.8);
    var obs=doc.splitTextToSize(gfPdfText(rec.OBSERVACAO),W-M*2);ensure(obs.length*3.2+3);doc.text(obs,M,y);y+=obs.length*3.2+3;
  }

  addFooters();
  try{doc.setProperties({title:"Atendimento - "+gfPdfText(rec.NOME_ALUNO||""),subject:"Proposta de matrícula",author:"Colégio Futuro",creator:"Gestão Futuro"})}catch(e){}
  var filename="Atendimento_"+gfPdfFile(rec.NOME_ALUNO)+"_"+gfPdfFile(rec.ID_ATENDIMENTO||"sem_id")+".pdf";
  doc.save(filename);
}
function gfApplyAttendanceForm(rec){
  if(!rec)return;
  var f=$("#attForm");if(!f)return;
  Object.keys(rec).forEach(function(k){
    var el=f.elements[k];if(!el)return;
    if(el.type==="checkbox")el.checked=!!rec[k];else if(rec[k]!==undefined&&rec[k]!==null)el.value=rec[k];
  });
  if($("#attStudent")&&rec.ID_ALUNO)$("#attStudent").value=rec.ID_ALUNO;
}
function gfCurrentAttendanceSnapshot(products){
  var f=$("#attForm");if(!f)return null;
  var rec=Object.fromEntries(new FormData(f).entries());
  rec.ID_ALUNO=$("#attStudent")?.value||rec.ID_ALUNO||"";
  rec.ID_ATENDIMENTO=String(state.currentAttendanceId||rec.ID_ATENDIMENTO||"");
  rec.NOME_ALUNO=$("#attName")?.value||rec.NOME_ALUNO||"";
  rec.ETAPA=state.attendanceStage||rec.ETAPA||"Contato";
  rec.STATUS=rec.ETAPA==="Matriculado"?"Matriculado":rec.ETAPA==="Não converteu"?"Perdido":"Em andamento";
  rec.MODO_REGISTRO=currentRunMode();
  rec.SESSAO_TESTE=state.runMode==="TESTE"?ensureTestSession():"";

  var list=gfCatalog(products||[],Number(rec.ANO_LETIVO),rec.SERIE_PRETENDIDA);
  var monthly=list.filter(function(p){return p.CATEGORIA==="Mensalidade"});
  var others=list.filter(function(p){return p.CATEGORIA!=="Mensalidade"});
  var n=Number($("#planCount")?.value ?? rec.PLANO_PARCELAS ?? 12);
  var d1=Number($("#planDiscFirst")?.value ?? rec["DESCONTO_PRIMEIRA_%"] ?? 0);
  var dr=Number($("#planDiscRecurring")?.value ?? rec["DESCONTO_PARCELAS_%"] ?? 0);
  var plan=gfPlanCalc(monthly,n,d1,dr);

  rec.PLANO_PARCELAS=plan.n;
  rec.VALOR_ANUIDADE=plan.annualValue;
  rec.VALOR_PRIMEIRA_BASE=plan.firstBase;
  rec["DESCONTO_PRIMEIRA_%"]=plan.discFirst;
  rec.VALOR_PRIMEIRA_FINAL=plan.firstFinal;
  rec.VALOR_PARCELA_BASE=plan.recurringBase;
  rec["DESCONTO_PARCELAS_%"]=plan.discRecurring;
  rec.VALOR_PARCELA_FINAL=plan.recurringFinal;
  rec.TOTAL_PLANO=plan.total;
  rec.ECONOMIA_PLANO=plan.economy;

  var selected=others.filter(function(p){return state.attendanceItems&&state.attendanceItems.has(p.ID_PRODUTO)}).map(function(p){
    var val=gfPresentedValue(p),obs=p["DESCRIÇÃO"]||p["OBSERVAÇÃO"]||"";
    if(gfIsRecurringStiProduct(p))obs=("S.T.I. • 12 parcelas"+(obs?" • "+obs:""));
    return {ID_PRODUTO:p.ID_PRODUTO,PRODUTO:p.PRODUTO,CATEGORIA:p.CATEGORIA,SERIE:rec.SERIE_PRETENDIDA,QTD:1,VALOR_TABELA:val,DESCONTO:0,VALOR_APRESENTADO:val,SELECIONADO:"Sim",OBSERVACAO:obs};
  });
  var extrasInicial=gfInitialExtrasFromItems(selected);
  rec.TOTAL_PROPOSTA=gfRound2(plan.firstFinal+extrasInicial);
  return {rec:rec,selected:selected,plan:plan};
}
async function gfResumeAttendance(id,fallback){
  var rec=fallback||null,items=[];var local=gfReadCachedAttendance(id);if(local){rec=local.atendimento||rec;items=local.itens||items;}
  const pending=gfLocalAttendances().find(x=>x.id===id);
  if(pending){rec=gfHydrateAddressCompat(pending.atendimento);items=pending.itens||[];}
  if(!pending)try{
    var d=await api("getAtendimento",{token:tokenFor("staff"),id:id});
    rec=gfHydrateAddressCompat(d&&d.atendimento||rec);items=d&&d.itens||[];
  }catch(e){}
  if(!rec)return alert("Não foi possível localizar esse atendimento.");
  state.currentAttendanceId=id;
  state.resumeAttendance=rec;
  state.resumeItems=items;
  state.attendanceStage=rec.ETAPA||"Contato";
  state.attendanceItems=new Set((items||[]).filter(function(x){return x.SELECIONADO!=="Não"}).map(function(x){return x.ID_PRODUTO}));
  await renderAtendimento();
  setNotice("Atendimento retomado. Você pode continuar de onde parou e salvar novamente.","ok");
  window.scrollTo({top:0,behavior:"smooth"});
}
function gfOpenDeleteAttendance(row){
  var a=row&&row.a||{},id=String(a.ID_ATENDIMENTO||row&&row.id||"").trim(),local=!!(row&&row.local);
  if(!id)return;
  modal("<div class='modal-head'><h3>Excluir atendimento</h3><button class='icon-btn' data-close>✕</button></div>"+
    "<div class='modal-body'><div class='notice error'><b>Ação permanente.</b> O atendimento <b>"+esc(id)+"</b> de <b>"+esc(a.NOME_ALUNO||"Aluno")+"</b> será removido"+(local?" deste dispositivo.":" do banco, junto com os itens e solicitações de desconto vinculadas.")+"</div>"+
    "<div class='field'><label>Autorização da Direção • senha da Gestão</label><input id='deleteAttendancePass' type='password' autocomplete='current-password' placeholder='Digite a senha da Gestão'></div>"+
    "<p class='muted'>A Secretaria não consegue excluir sem a senha da Direção. A autorização vale somente para esta exclusão.</p></div>"+
    "<div class='modal-foot'><button class='btn btn-soft' data-close>Cancelar</button><button class='btn btn-danger' id='confirmDeleteAttendance'>🗑️ Excluir definitivamente</button></div>");
  $$("[data-close]").forEach(function(x){x.onclick=closeModal});
  var pass=$("#deleteAttendancePass"),btn=$("#confirmDeleteAttendance");
  btn.onclick=async function(){
    var password=pass.value;if(!password){pass.focus();return}
    var old=btn.textContent,tempToken="";btn.disabled=true;btn.textContent="Validando autorização…";
    try{
      var auth=await api("loginGestao",{password:password});
      if(!auth?.ok||!auth.token)throw new Error(auth?.message||"Senha da Gestão inválida.");
      tempToken=auth.token;btn.textContent="Excluindo…";
      if(local){
        gfRemoveLocalAttendance(id);
      }else{
        if(state.backendCaps.attendanceDelete!==true)throw new Error("A exclusão definitiva ainda não foi liberada no backend publicado.");
        await api("excluirAtendimento",{token:tempToken,id:id});
      }
      gfRemoveAttendanceCache(id);clearApiCache();
      if(String(state.currentAttendanceId||"")===id){
        state.currentAttendanceId="";state.resumeAttendance=null;state.resumeItems=[];state.attendanceItems=new Set();state.attendanceStage="Contato";
      }
      closeModal();showToast("Atendimento "+id+" excluído com autorização da Direção ✓","ok");await renderAtendimento();
    }catch(e){
      showToast(e.message||"Não foi possível excluir o atendimento.","error");
      btn.disabled=false;btn.textContent=old;pass.focus();
    }finally{
      if(tempToken){try{await api("logout",{token:tempToken})}catch(e){}}
    }
  };
  pass.addEventListener("keydown",function(e){if(e.key==="Enter")btn.click()});
  setTimeout(function(){pass?.focus()},50);
}
async function renderAtendimento(){
  var loaded=await Promise.all([loadBootstrap(),loadCatalogProducts(true)]),b=loaded[0],products=loaded[1]||[],students=b.alunos||[],at=[];
  try{at=await api("listarAtendimentos",{token:tokenFor("staff")})||[]}catch(e){}
  var resume=gfHydrateAddressCompat(state.resumeAttendance||null);
  var years=[...new Set(products.map(gfYear).filter(Boolean))].sort(function(a,b){return b-a}),year=Number(resume?.ANO_LETIVO||state.attendanceYear||years[0]||2027);
  state.attendanceItems=state.attendanceItems||new Set();
  state.attendanceStage=resume?.ETAPA||state.attendanceStage||"Contato";
  var studentOpts=students.map(function(a){return "<option value='"+esc(a.ID_ALUNO)+"'>"+esc(a.NOME_COMPLETO)+" • "+esc(a["SÉRIE"]||"")+"</option>"}).join("");
  var studentLookupOpts=students.map(function(a){var next=a.PROXIMA_SERIE_2027||gfNextSeries(a["SÉRIE"]||"");return "<option value='"+esc(a.NOME_COMPLETO+" — "+(a["SÉRIE"]||""))+"' label='"+esc((a.MATRICULA_ORIGEM?"Matrícula "+a.MATRICULA_ORIGEM+" • ":"")+(next?"2027 → "+next:""))+"'></option>"}).join("");
  var yearOpts=years.map(function(y){return "<option value='"+y+"' "+(y===year?"selected":"")+">"+y+"</option>"}).join("");
  var localRows=gfLocalAttendances().filter(function(x){var m=String(x?.atendimento?.MODO_REGISTRO||"PRODUCAO");return currentRunMode()==="TESTE"?m==="TESTE":m!=="TESTE"});
  var localIds=new Set(localRows.map(function(x){return String(x.id)}));
  var combined=localRows.map(function(x){return {a:x.atendimento||{},local:true,itens:x.itens||[]}}).concat(at.slice().reverse().filter(function(a){return !localIds.has(String(a.ID_ATENDIMENTO))}).map(function(a){return {a:a,local:false}}));
  var recent=combined.map(function(row){
    var a=row.a||{},plan=a.PLANO_PARCELAS?("<br><span class='muted'>1ª parcela + "+esc(a.PLANO_PARCELAS)+"x</span>"):"";
    var sync=row.local?"<br><span class='sync-pending'>Pendente de sincronização</span>":"";
    var retry=row.local?" <button class='btn btn-gold btn-sm' data-sync-att='"+esc(a.ID_ATENDIMENTO)+"'>Sincronizar</button>":"";
    var pdf=!row.local?" <button class='btn btn-soft btn-sm' data-pdf-att='"+esc(a.ID_ATENDIMENTO)+"'>PDF</button>":"";
    var del=" <button class='trash-btn' data-delete-att='"+esc(a.ID_ATENDIMENTO)+"' title='Excluir atendimento com autorização da Direção' aria-label='Excluir atendimento "+esc(a.ID_ATENDIMENTO)+"'>🗑️</button>";
    return "<tr><td><b>"+esc(a.NOME_ALUNO||a.ID_ALUNO||"")+"</b><br><span class='muted'>"+esc(a.RESPONSAVEL||"")+"</span>"+sync+"</td><td>"+esc(a.ANO_LETIVO||"")+"</td><td>"+esc(a.SERIE_PRETENDIDA||"")+"</td><td>"+pill(a.ETAPA||"")+"</td><td>"+pill(a.STATUS||"")+"</td><td class='money'>"+money(a.TOTAL_PROPOSTA)+plan+"</td><td class='attendance-actions'><button class='btn btn-soft btn-sm' data-resume-att='"+esc(a.ID_ATENDIMENTO)+"'>Continuar</button>"+pdf+retry+del+"</td></tr>";
  }).join("");
  var draft=(!resume&&!state.currentAttendanceId)?gfLoadAttendanceDraft():null;
  var draftBar=draft&&draft.NOME_ALUNO?("<div class='draft-bar'><div><b>Rascunho encontrado</b><span>"+esc(draft.NOME_ALUNO)+" • "+esc(draft.SERIE_PRETENDIDA||"sem série")+" • salvo automaticamente</span></div><div><button class='btn btn-primary btn-sm' id='restoreDraft'>Retomar rascunho</button><button class='btn btn-soft btn-sm' id='discardDraft'>Descartar</button></div></div>"):"";
  var modeBanner="<div class='mode-banner "+(currentRunMode()==="TESTE"?"test":"production")+"'><span>"+(currentRunMode()==="TESTE"?"🧪 Modo Teste / Simulação — estes registros não entram no fluxo oficial.":"✓ Modo Produção — registros oficiais.")+"</span><button class='btn btn-soft btn-sm' id='changeModeInline'>Trocar modo</button></div>";
  $("#view").innerHTML=modeBanner+draftBar+"<div class='crm-hero'><div><span>ATENDIMENTO DE MATRÍCULAS</span><h2>Da primeira conversa à matrícula, em um único fluxo.</h2><p>Escolha ano e série. A proposta usa somente os valores publicados pela Gestão.</p></div><div class='crm-hero-kpi'><small>Em andamento</small><strong>"+at.filter(function(x){return x.STATUS==="Em andamento"}).length+"</strong></div></div>"+
  "<div class='card'><div class='section-head compact'><h2>Quem vamos atender?</h2><div class='toolbar'><span id='autosaveStatus' class='muted autosave-status'>Rascunho automático ativo</span><button class='btn btn-soft' id='clearAttend'>Novo atendimento</button></div></div><form id='attForm' class='form-grid'>"+
  "<input type='hidden' name='ID_ATENDIMENTO' value='"+esc(state.currentAttendanceId||resume?.ID_ATENDIMENTO||"")+"'>"+
  "<input type='hidden' name='PLANO_PARCELAS' value='"+esc(resume?.PLANO_PARCELAS||12)+"'>"+
  "<input type='hidden' name='VALOR_ANUIDADE' value='"+esc(resume?.VALOR_ANUIDADE||"")+"'>"+
  "<input type='hidden' name='VALOR_PRIMEIRA_BASE' value='"+esc(resume?.VALOR_PRIMEIRA_BASE||"")+"'>"+
  "<input type='hidden' name='DESCONTO_PRIMEIRA_%' value='"+esc(resume?.["DESCONTO_PRIMEIRA_%"]||0)+"'>"+
  "<input type='hidden' name='VALOR_PRIMEIRA_FINAL' value='"+esc(resume?.VALOR_PRIMEIRA_FINAL||"")+"'>"+
  "<input type='hidden' name='VALOR_PARCELA_BASE' value='"+esc(resume?.VALOR_PARCELA_BASE||"")+"'>"+
  "<input type='hidden' name='DESCONTO_PARCELAS_%' value='"+esc(resume?.["DESCONTO_PARCELAS_%"]||0)+"'>"+
  "<input type='hidden' name='VALOR_PARCELA_FINAL' value='"+esc(resume?.VALOR_PARCELA_FINAL||"")+"'>"+
  "<input type='hidden' name='TOTAL_PLANO' value='"+esc(resume?.TOTAL_PLANO||"")+"'>"+
  "<input type='hidden' name='ECONOMIA_PLANO' value='"+esc(resume?.ECONOMIA_PLANO||"")+"'>"+
  "<input type='hidden' name='ANO_ORIGEM' id='attOriginYear' value='"+esc(resume?.ANO_ORIGEM||"")+"'>"+
  "<input type='hidden' name='SERIE_ATUAL' id='attCurrentSeries' value='"+esc(resume?.SERIE_ATUAL||"")+"'>"+
  "<input type='hidden' name='SERIE_SUGERIDA' id='attSuggestedSeries' value='"+esc(resume?.SERIE_SUGERIDA||"")+"'>"+
  "<input type='hidden' name='SERIE_CONFIRMADA' id='attConfirmedSeriesHidden' value='"+esc(resume?.SERIE_CONFIRMADA||resume?.SERIE_PRETENDIDA||"")+"'>"+
  "<input type='hidden' name='REMATRICULA_STATUS' id='attRematriculaStatus' value='"+esc(resume?.REMATRICULA_STATUS||"")+"'>"+
  "<div class='field span-2 student-lookup-field'><label>Pesquisar aluno já cadastrado</label><input id='attStudentSearch' list='attStudentDatalist' autocomplete='off' placeholder='Digite as primeiras letras do nome…'><datalist id='attStudentDatalist'>"+studentLookupOpts+"</datalist><small class='muted'>Nome • série atual • progressão 2027</small><select id='attStudent' class='hidden'><option value=''>Novo / não localizado</option>"+studentOpts+"</select></div><div class='field'><label>Tipo</label><select name='TIPO_ALUNO' id='attType'><option>Novato</option><option>Veterano</option></select></div><div class='field span-2'><label>Nome do aluno *</label><input name='NOME_ALUNO' id='attName' required></div><div class='field'><label>Responsável *</label><input name='RESPONSAVEL' required></div><div class='field'><label>Telefone</label><input name='TELEFONE'></div><div class='field'><label>E-mail</label><input name='EMAIL' type='email'></div><div class='field'><label>CEP</label><input name='CEP' id='attCep' inputmode='numeric' autocomplete='postal-code' maxlength='9' placeholder='00000-000' value='"+esc(gfCepMask(resume?.CEP||""))+"'><small id='attCepStatus' class='cep-status'></small></div><div class='field span-2'><label>Logradouro</label><input name='LOGRADOURO' id='attStreet' autocomplete='address-line1' value='"+esc(resume?.LOGRADOURO||"")+"'></div><div class='field'><label>Bairro</label><input name='BAIRRO' id='attDistrict' value='"+esc(resume?.BAIRRO||"")+"'></div><div class='field'><label>Cidade</label><input name='CIDADE' id='attCity' value='"+esc(resume?.CIDADE||"")+"'></div><div class='field'><label>UF</label><input name='UF' id='attUf' maxlength='2' value='"+esc(resume?.UF||"")+"'></div><div class='field'><label>Número</label><input name='NUMERO' id='attNumber' autocomplete='address-line2' value='"+esc(resume?.NUMERO||"")+"'></div><div class='field span-2'><label>Complemento / apto</label><input name='COMPLEMENTO' id='attComplement' placeholder='Apartamento, bloco, casa...' value='"+esc(resume?.COMPLEMENTO||"")+"'></div><div class='field'><label>Ano letivo *</label><select name='ANO_LETIVO' id='attYear'>"+yearOpts+"</select></div><div class='field'><label>Série confirmada / pretendida *</label><select name='SERIE_PRETENDIDA' id='attSerie' required><option value=''>Selecione</option>"+gfOptions(resume?.SERIE_PRETENDIDA||"")+"</select></div><div class='field span-3 hidden' id='attRematriculaCard'><div class='rematricula-flow-card'><div><small>SÉRIE ATUAL • 2026</small><b id='attCurrentSeriesView'>—</b></div><div><small>SÉRIE SUGERIDA • 2027</small><b id='attSuggestedSeriesView'>—</b></div><div><small>SÉRIE CONFIRMADA</small><b id='attConfirmedSeriesView'>—</b></div><div class='field progression-choice'><label>Situação para 2027</label><select name='SITUACAO_PROGRESSAO' id='attProgressionSituation'><option>Aprovado / progredir</option><option>Retido / repetir série</option><option>Definido manualmente</option></select></div><p class='muted'>A sugestão é automática, mas a série confirmada é definida pela escola e pode ser corrigida depois sem alterar o histórico de 2026.</p></div></div><div class='field'><label>Turno</label><select name='TURNO'><option>Manhã</option><option>Tarde</option><option>Integral</option></select></div><div class='field'><label>Modalidade</label><input name='MODALIDADE' value='Regular'></div><div class='field'><label>Origem</label><select name='ORIGEM'><option></option><option>Instagram</option><option>Google</option><option>Indicação</option><option>WhatsApp</option><option>Aluno da casa</option><option>Outros</option></select></div><div class='field span-2'><label>Observações</label><textarea name='OBSERVACAO'></textarea></div></form></div>"+
  "<div class='card stage-card'><div class='section-head compact'><h2>Etapa</h2><span id='stagePct' class='pill'>"+GF_PCT[state.attendanceStage]+"%</span></div><div class='stage-flow' id='stageFlow'>"+gfStageButtons()+"</div><div class='progress-line'><i id='stageBar' style='width:"+GF_PCT[state.attendanceStage]+"%'></i></div></div><div id='catalogArea' class='empty card'>Escolha a série.</div><div class='crm-actions'><div><span class='muted'>Investimento inicial</span><strong id='attTotal'>R$ 0,00</strong></div><div class='pdf-actions'><button class='btn btn-soft' id='downloadAttendancePdf' "+((!state.currentAttendanceId||(String(state.currentAttendanceId).startsWith("LOCAL-")&&currentRunMode()!=="TESTE"))?"disabled":"")+">Baixar PDF</button><button class='btn btn-primary' id='saveAttendance'>"+(state.currentAttendanceId?"Atualizar atendimento":"Salvar atendimento")+"</button></div></div><div class='section-head'><h2>Atendimentos salvos</h2><div class='toolbar'><span class='muted'>Clique em “Continuar” para retomar depois.</span><button class='btn btn-report btn-sm' id='attendanceReport'>📄 Relatório</button></div></div><div class='table-wrap'><table><thead><tr><th>Aluno</th><th>Ano</th><th>Série</th><th>Etapa</th><th>Status</th><th>Total</th><th></th></tr></thead><tbody>"+(recent||"<tr><td colspan='7' class='empty'>Nenhum atendimento salvo ainda.</td></tr>")+"</tbody></table></div>";

  $("#changeModeInline").onclick=openModeModal;
  gfBindAttendanceCep();
  if($("#attendanceReport"))$("#attendanceReport").onclick=()=>openAttendanceReport(combined.map(function(x){return x.a||{}}));
  function setHidden(name,value){var el=$("#attForm").elements[name];if(el)el.value=value==null?"":value}
  function attendanceStudent(){return students.find(function(x){return String(x.ID_ALUNO)===String($("#attStudent")?.value||"")})||null}
  function syncAttendanceRematricula(a,keepConfirmed){
    var card=$("#attRematriculaCard"),targetYear=Number($("#attYear")?.value||0);
    if(!a||$("#attType")?.value!=="Veterano"||targetYear!==2027){
      card?.classList.add("hidden");setHidden("ANO_ORIGEM","");setHidden("SERIE_ATUAL","");setHidden("SERIE_SUGERIDA","");setHidden("SERIE_CONFIRMADA",$("#attSerie")?.value||"");setHidden("REMATRICULA_STATUS","");return;
    }
    var current=a.SERIE_ORIGEM_2026||a["SÉRIE"]||"",suggested=typeof gfSuggestedSeries==="function"?gfSuggestedSeries(a,2027):(a.PROXIMA_SERIE_2027||gfNextSeries(current)),existing=a.SERIE_CONFIRMADA_2027||"",situation=$("#attProgressionSituation")?.value||"";
    if(!situation||!keepConfirmed){
      situation=a.RESULTADO_2026==="Retido"?"Retido / repetir série":a.RESULTADO_2026==="Aprovado"?"Aprovado / progredir":"Aprovado / progredir";
      if($("#attProgressionSituation"))$("#attProgressionSituation").value=situation;
    }
    var confirmed=keepConfirmed?($("#attSerie")?.value||existing||suggested||current):(existing||(situation.indexOf("Retido")===0?current:suggested)||current);
    if(confirmed&&$("#attSerie"))$("#attSerie").value=confirmed;
    setHidden("ANO_ORIGEM",2026);setHidden("SERIE_ATUAL",current);setHidden("SERIE_SUGERIDA",suggested);setHidden("SERIE_CONFIRMADA",confirmed);
    var already=(b.matriculas||[]).some(function(m){return String(m.ID_ALUNO)===String(a.ID_ALUNO)&&Number(m.ANO_LETIVO)===2027});
    setHidden("REMATRICULA_STATUS",already?"Realizada":"Em preparação");
    if($("#attCurrentSeriesView"))$("#attCurrentSeriesView").textContent=current||"—";
    if($("#attSuggestedSeriesView"))$("#attSuggestedSeriesView").textContent=suggested||"—";
    if($("#attConfirmedSeriesView"))$("#attConfirmedSeriesView").textContent=confirmed||"A confirmar";
    card?.classList.remove("hidden");
  }
  function currentPlanDiscounts(){
    return {
      first:Number($("#attForm").elements["DESCONTO_PRIMEIRA_%"].value||0),
      recurring:Number($("#attForm").elements["DESCONTO_PARCELAS_%"].value||0),
      n:Number($("#attForm").elements["PLANO_PARCELAS"].value||12)
    };
  }
  function drawCatalog(){
    var s=$("#attSerie").value,y=Number($("#attYear").value);state.attendanceYear=y;
    if(!s){$("#catalogArea").className="empty card";$("#catalogArea").innerHTML="Escolha a série.";$("#attTotal").textContent=money(0);return}
    var list=gfCatalog(products,y,s),monthly=list.filter(function(p){return p.CATEGORIA==="Mensalidade"}),others=list.filter(function(p){return p.CATEGORIA!=="Mensalidade"}),annual=gfAnnualProduct(monthly),stiProduct=others.find(gfIsRecurringStiProduct)||null,catalogOthers=others.filter(function(p){return p!==stiProduct}),groups=gfGroups(catalogOthers),disc=currentPlanDiscounts();
    var availablePlans=[12,11].filter(function(n){return !!gfRecurringProduct(monthly,n)});
    if(!availablePlans.length)availablePlans=[12,11];
    if(!availablePlans.includes(disc.n))disc.n=availablePlans[0];
    var plan=gfPlanCalc(monthly,disc.n,disc.first,disc.recurring);
    var planHtml="";
    if(annual){
      planHtml="<section class='finance-plan-card'><div class='section-head compact'><div><h3>Plano financeiro da mensalidade</h3><span class='muted'>Cálculo feito sobre a anuidade oficial de "+money(plan.annualValue)+".</span></div><span class='plan-total-badge'>"+money(plan.total)+"</span></div>"+
      "<div class='finance-plan-grid'><div class='field'><label>Forma de pagamento</label><select id='planCount'>"+availablePlans.map(function(n){return "<option value='"+n+"' "+(n===plan.n?"selected":"")+">1ª parcela + "+n+"x</option>"}).join("")+"</select></div>"+
      "<div class='field'><label>Desconto na 1ª parcela (%)</label><input id='planDiscFirst' type='number' min='0' max='100' step='0.01' value='"+plan.discFirst+"'></div>"+
      "<div class='field'><label>Desconto nas parcelas seguintes (%)</label><input id='planDiscRecurring' type='number' min='0' max='100' step='0.01' value='"+plan.discRecurring+"'></div></div>"+
      "<div class='plan-results'><div><small>1ª parcela base</small><b id='planFirstBase'>"+money(plan.firstBase)+"</b></div><div><small>1ª parcela com desconto</small><b id='planFirstFinal'>"+money(plan.firstFinal)+"</b></div><div><small>"+plan.n+" parcelas base</small><b id='planRecurringBase'>"+money(plan.recurringBase)+"</b></div><div><small>"+plan.n+" parcelas com desconto</small><b id='planRecurringFinal'>"+money(plan.recurringFinal)+"</b></div><div class='total'><small>Anuidade negociada</small><b id='planTotal'>"+money(plan.total)+"</b></div><div class='economy'><small>Economia</small><b id='planEconomy'>"+money(plan.economy)+"</b></div></div>"+
      "<div class='plan-note'><span>Resumo:</span><b id='planSummary'>"+gfPlanSummary(plan)+"</b><button type='button' class='btn btn-gold btn-sm "+((plan.discFirst||plan.discRecurring)?"":"hidden")+"' id='requestPlanDiscount'>Solicitar autorização desta condição</button></div></section>";
    }
    var stiQuoteHtml="";
    if(stiProduct){
      var stiValue=gfPresentedValue(stiProduct),stiChecked=state.attendanceItems.has(stiProduct.ID_PRODUTO),stiSync=gfStiPlanSync(plan,stiValue);
      stiQuoteHtml="<section class='sti-quote-card "+(stiChecked?"selected":"")+"' id='stiQuoteCard'><div class='sti-quote-head'><div><small>S.T.I. • SISTEMA DE TEMPO INTEGRAL</small><h3>Orçamento do tempo integral</h3><span>Adicional fixo em 12 parcelas • sincronizado ao plano regular</span></div><label class='sti-toggle'><input type='checkbox' id='stiInclude' "+(stiChecked?"checked":"")+"><span>Incluir na proposta</span></label></div>"+
        "<div class='sti-quote-grid'><div><small>Plano regular</small><b id='stiRegularValue'>1ª + "+plan.n+"x</b></div><div><small>S.T.I.</small><b id='stiAddonValue'>12x de "+money(stiValue)+"</b></div><div class='total'><small>Parcela combinada</small><b id='stiMonthlyTotal'>"+money(stiSync.combinedValue)+"</b></div></div>"+
        "<div class='sti-sync-summary'><b id='stiSyncLabel'>"+esc(stiSync.label)+"</b><span id='stiSyncNote'>"+esc(stiSync.note)+"</span></div></section>";
    }
    var html="<div class='section-head'><div><h2>Proposta automática • "+esc(s)+" • "+y+"</h2><span class='muted'>Anuidade exibida como referência. O investimento inicial e os adicionais são calculados separadamente.</span></div><button class='btn btn-soft' id='flyerShortcut'>Panfleto da série</button></div>"+planHtml+stiQuoteHtml+"<div class='catalog-groups'>";
    Object.keys(groups).forEach(function(cat){
      html+="<section class='catalog-group'><h3>"+esc(cat)+"</h3><div class='catalog-grid'>";
      groups[cat].forEach(function(p){
        var checked=state.attendanceItems.has(p.ID_PRODUTO),uniformAsset=gfIsUniformProduct(p)?gfUniformAssetForProduct(p,s):null;
        var uniformThumb=uniformAsset?"<div class='attendance-uniform-thumb'><img src='"+esc(uniformAsset.src)+"' alt='"+esc(uniformAsset.label)+"'><span>Ver farda</span></div>":"";
        var rawPrice=parseMoney(p.VALOR_BASE),priceLabel=rawPrice>0?money(rawPrice):"Sob consulta";
        html+="<article class='catalog-item "+(checked?"selected":"")+" "+(uniformAsset?"with-uniform":"")+"'>"+uniformThumb+"<label><input type='checkbox' data-att-product='"+esc(p.ID_PRODUTO)+"' "+(checked?"checked":"")+"><div><small>"+esc(p.SUBCATEGORIA||"")+"</small><strong>"+esc(p.PRODUTO)+"</strong><span>"+esc(p["DESCRIÇÃO"]||p["OBSERVAÇÃO"]||"")+"</span></div></label><div class='catalog-price'><b>"+priceLabel+"</b>"+(rawPrice>0?"<button type='button' class='discount-link' data-discount='"+esc(p.ID_PRODUTO)+"'>Pedir desconto</button>":"<span class='muted'>Valor a definir pela Gestão</span>")+"</div></article>";
      });
      html+="</div></section>";
    });
    $("#catalogArea").className="";$("#catalogArea").innerHTML=html+"</div>";

    function updatePlanAndTotal(){
      var n=Number($("#planCount")?.value||disc.n||12),d1=Number($("#planDiscFirst")?.value||0),dr=Number($("#planDiscRecurring")?.value||0),calc=gfPlanCalc(monthly,n,d1,dr);
      setHidden("PLANO_PARCELAS",calc.n);setHidden("VALOR_ANUIDADE",calc.annualValue);setHidden("VALOR_PRIMEIRA_BASE",calc.firstBase);setHidden("DESCONTO_PRIMEIRA_%",calc.discFirst);setHidden("VALOR_PRIMEIRA_FINAL",calc.firstFinal);setHidden("VALOR_PARCELA_BASE",calc.recurringBase);setHidden("DESCONTO_PARCELAS_%",calc.discRecurring);setHidden("VALOR_PARCELA_FINAL",calc.recurringFinal);setHidden("TOTAL_PLANO",calc.total);setHidden("ECONOMIA_PLANO",calc.economy);
      if($("#planFirstBase"))$("#planFirstBase").textContent=money(calc.firstBase);
      if($("#planFirstFinal"))$("#planFirstFinal").textContent=money(calc.firstFinal);
      if($("#planRecurringBase"))$("#planRecurringBase").textContent=money(calc.recurringBase);
      if($("#planRecurringFinal"))$("#planRecurringFinal").textContent=money(calc.recurringFinal);
      if($("#planTotal"))$("#planTotal").textContent=money(calc.total);
      if($(".plan-total-badge"))$(".plan-total-badge").textContent=money(calc.total);
      if($("#planEconomy"))$("#planEconomy").textContent=money(calc.economy);
      if($("#planSummary"))$("#planSummary").textContent=gfPlanSummary(calc);
      var req=$("#requestPlanDiscount");if(req)req.classList.toggle("hidden",!(calc.discFirst||calc.discRecurring));
      var selectedExtras=others.filter(function(p){return state.attendanceItems.has(p.ID_PRODUTO)}),extrasInicial=gfInitialExtrasFromProducts(selectedExtras),investimentoInicial=gfRound2(calc.firstFinal+extrasInicial);
      $("#attTotal").textContent=money(investimentoInicial);
      if(stiProduct){
        var stiValue=gfPresentedValue(stiProduct),stiSync=gfStiPlanSync(calc,stiValue);
        if($("#stiRegularValue"))$("#stiRegularValue").textContent="1ª + "+calc.n+"x";
        if($("#stiAddonValue"))$("#stiAddonValue").textContent=stiValue>0?("12x de "+money(stiValue)):"Sob consulta";
        if($("#stiMonthlyTotal"))$("#stiMonthlyTotal").textContent=stiValue>0?money(stiSync.combinedValue):"A definir";
        if($("#stiSyncLabel"))$("#stiSyncLabel").textContent=stiSync.label;
        if($("#stiSyncNote"))$("#stiSyncNote").textContent=stiSync.note;
        if($("#stiQuoteCard"))$("#stiQuoteCard").classList.toggle("selected",state.attendanceItems.has(stiProduct.ID_PRODUTO));
      }
      gfSaveAttendanceDraft();
      return calc;
    }
    ["#planCount","#planDiscFirst","#planDiscRecurring"].forEach(function(sel){var el=$(sel);if(el){el.oninput=updatePlanAndTotal;el.onchange=updatePlanAndTotal}});
    $$("[data-att-product]").forEach(function(x){x.onchange=function(){
      x.checked?state.attendanceItems.add(x.dataset.attProduct):state.attendanceItems.delete(x.dataset.attProduct);
      var card=x.closest(".catalog-item");if(card)card.classList.toggle("selected",x.checked);
      updatePlanAndTotal();
    }});
    if($("#stiInclude")&&stiProduct)$("#stiInclude").onchange=function(){
      this.checked?state.attendanceItems.add(stiProduct.ID_PRODUTO):state.attendanceItems.delete(stiProduct.ID_PRODUTO);
      updatePlanAndTotal();
    };
    $$("[data-discount]").forEach(function(x){x.onclick=function(){openDiscountRequest(list.find(function(p){return p.ID_PRODUTO===x.dataset.discount}),{ano:y,serie:s})}});
    $("#requestPlanDiscount")?.addEventListener("click",async function(){
      var calc=updatePlanAndTotal();
      if(!state.currentAttendanceId)return alert("Salve o atendimento primeiro. Depois você pode enviar esta condição para autorização da Gestão.");
      if(String(state.currentAttendanceId).startsWith("LOCAL-")||gfLocalAttendances().some(x=>x.id===state.currentAttendanceId))return alert("Este atendimento ainda está pendente de sincronização. Clique em “Sincronizar” na lista de Atendimentos salvos antes de pedir autorização.");
      var overall=calc.annualValue?gfRound2((calc.economy/calc.annualValue)*100):0;
      try{
        await api("solicitarDesconto",{token:tokenFor("staff"),data:{ID_ATENDIMENTO:state.currentAttendanceId,ID_PRODUTO:annual.ID_PRODUTO,CLIENT_REQUEST_ID:"DISC-"+state.currentAttendanceId+"-"+annual.ID_PRODUTO,ANO_LETIVO:y,SERIE:s,VALOR_TABELA:calc.annualValue,DESCONTO_SOLICITADO:overall,VALOR_SOLICITADO:calc.total,MOTIVO:"Plano 1ª parcela + "+calc.n+"x | desconto 1ª parcela: "+calc.discFirst+"% | desconto parcelas seguintes: "+calc.discRecurring+"% | "+gfPlanSummary(calc)}});
        setNotice("Solicitação enviada.","ok");appAlert("desconto","Solicitação de desconto enviada ✓");this.textContent="Enviada ✓";this.disabled=true;
      }catch(e){alert(e.message)}
    });
    $("#flyerShortcut").onclick=function(){gfSaveAttendanceDraft();state.flyerYear=y;state.flyerSeries=s;state.flyerStudentType=$("#attType")?.value||"Novato";navigate("panfletos")};
    updatePlanAndTotal();
  }
  if(resume){
    gfApplyAttendanceForm(resume);
    if(resume.ID_ALUNO&&$("#attStudent")){ $("#attStudent").value=resume.ID_ALUNO;var ra=students.find(function(x){return x.ID_ALUNO===resume.ID_ALUNO});if(ra&&$("#attStudentSearch"))$("#attStudentSearch").value=ra.NOME_COMPLETO+" — "+(ra["SÉRIE"]||""); }
    if(resume.SERIE_PRETENDIDA)$("#attSerie").value=resume.SERIE_PRETENDIDA;
    if(resume.ANO_LETIVO)$("#attYear").value=String(resume.ANO_LETIVO);
    var resumeStudent=students.find(function(x){return String(x.ID_ALUNO)===String(resume.ID_ALUNO||"")});
    if($("#attProgressionSituation")&&resume.SITUACAO_PROGRESSAO)$("#attProgressionSituation").value=resume.SITUACAO_PROGRESSAO;
    syncAttendanceRematricula(resumeStudent,true);
  }
  $("#attSerie").onchange=function(){var a=attendanceStudent();if(a&&$("#attType").value==="Veterano"&&Number($("#attYear").value)===2027){setHidden("SERIE_CONFIRMADA",$("#attSerie").value);if($("#attConfirmedSeriesView"))$("#attConfirmedSeriesView").textContent=$("#attSerie").value||"A confirmar";var suggested=$("#attSuggestedSeries").value,current=$("#attCurrentSeries").value;if($("#attSerie").value!==suggested&&$("#attSerie").value!==current)$("#attProgressionSituation").value="Definido manualmente"}gfSaveAttendanceDraft();drawCatalog()};
  $("#attYear").onchange=function(){syncAttendanceRematricula(attendanceStudent(),false);gfSaveAttendanceDraft();drawCatalog()};
  $("#attProgressionSituation")?.addEventListener("change",function(){var a=attendanceStudent();if(!a)return;var current=a.SERIE_ORIGEM_2026||a["SÉRIE"]||"",suggested=typeof gfSuggestedSeries==="function"?gfSuggestedSeries(a,2027):(a.PROXIMA_SERIE_2027||gfNextSeries(current));if(this.value.indexOf("Retido")===0)$("#attSerie").value=current;else if(this.value.indexOf("Aprovado")===0&&suggested)$("#attSerie").value=suggested;syncAttendanceRematricula(a,true);gfSaveAttendanceDraft();drawCatalog()});
  $$("#stageFlow [data-stage]").forEach(function(x){
    x.classList.toggle("active",x.dataset.stage===state.attendanceStage);
    x.onclick=function(){state.attendanceStage=x.dataset.stage;gfRefreshStage(false)}
  });
  gfRefreshStage(true);
  $("#attStudent").onchange=function(){var a=students.find(function(x){return x.ID_ALUNO===$("#attStudent").value});if(a){$("#attName").value=a.NOME_COMPLETO||"";$("#attType").value="Veterano";if(years.includes(2027))$("#attYear").value="2027";if($("#attStudentSearch"))$("#attStudentSearch").value=a.NOME_COMPLETO+" — "+(a["SÉRIE"]||"");syncAttendanceRematricula(a,false);drawCatalog()}else{$("#attType").value="Novato";syncAttendanceRematricula(null,false)}gfSaveAttendanceDraft()};
  if($("#attStudentSearch")){
    const pickStudentFromSearch=function(){
      const q=gfStudentNorm($("#attStudentSearch").value),a=students.find(function(x){return gfStudentNorm(x.NOME_COMPLETO+" — "+(x["SÉRIE"]||""))===q})||gfStudentSearchRows(students,$("#attStudentSearch").value,1)[0];
      if(a){$("#attStudent").value=a.ID_ALUNO;$("#attStudent").dispatchEvent(new Event("change"))}
    };
    $("#attStudentSearch").onchange=pickStudentFromSearch;
  }
  $("#attType").onchange=function(){syncAttendanceRematricula(attendanceStudent(),false);drawCatalog();gfSaveAttendanceDraft()};
  $("#attForm").addEventListener("input",function(){clearTimeout(state.attDraftTimer);state.attDraftTimer=setTimeout(function(){gfRefreshStage(true);var el=$("#autosaveStatus");if(el){el.textContent="Salvo ✓";el.className="autosave-status sync-saved";setTimeout(function(){var x=$("#autosaveStatus");if(x){x.textContent="Rascunho automático ativo";x.className="muted autosave-status"}},1200)}},350)});
  $("#attForm").addEventListener("change",function(){gfRefreshStage(true)});
  $("#clearAttend").onclick=function(){state.currentAttendanceId="";state.resumeAttendance=null;state.resumeItems=[];state.attendanceItems=new Set();state.attendanceStage="Contato";gfClearAttendanceDraft();renderAtendimento()};
  $("#restoreDraft")?.addEventListener("click",function(){var d=gfLoadAttendanceDraft();if(!d)return;state.currentAttendanceId=d.ID_ATENDIMENTO||"";state.resumeAttendance=d;state.resumeItems=(d.ITENS||[]).map(function(id){return {ID_PRODUTO:id,SELECIONADO:"Sim"}});state.attendanceItems=new Set(d.ITENS||[]);state.attendanceStage=d.ETAPA||"Contato";renderAtendimento()});
  $("#discardDraft")?.addEventListener("click",function(){gfClearAttendanceDraft();$("#restoreDraft")?.closest(".draft-bar")?.remove()});
  $$("[data-resume-att]").forEach(function(btn){btn.onclick=function(){
    var id=btn.dataset.resumeAtt,rec=at.find(function(a){return a.ID_ATENDIMENTO===id});
    if(!rec){var lr=gfLocalAttendances().find(function(x){return x.id===id});if(lr){rec=lr.atendimento;gfCacheSavedAttendance(id,lr.atendimento,lr.itens||[])}}
    gfResumeAttendance(id,rec)
  }});
  $$("[data-pdf-att]").forEach(function(btn){btn.onclick=async function(){
    btn.disabled=true;var old=btn.textContent;btn.textContent="Gerando…";
    try{
      var id=btn.dataset.pdfAtt,d=await api("getAtendimento",{token:tokenFor("staff"),id:id});
      await gfDownloadAttendancePdf(gfHydrateAddressCompat(d.atendimento||{}),d.itens||[]);
      showToast("PDF do atendimento gerado.","ok");
    }catch(e){alert(e.message)}
    btn.disabled=false;btn.textContent=old;
  }});
  $$("[data-delete-att]").forEach(function(btn){btn.onclick=function(){
    var id=btn.dataset.deleteAtt,row=combined.find(function(x){return String(x.a&&x.a.ID_ATENDIMENTO||"")===String(id)});
    if(row)gfOpenDeleteAttendance(row);
  }});
  $$("[data-sync-att]").forEach(function(btn){btn.onclick=async function(){
    var row=gfLocalAttendances().find(function(x){return x.id===btn.dataset.syncAtt});if(!row)return;
    btn.disabled=true;btn.textContent="Sincronizando…";
    try{
      var data=Object.assign({},row.atendimento);data.CLIENT_REQUEST_ID=data.CLIENT_REQUEST_ID||row.id;if(String(data.ID_ATENDIMENTO||"").startsWith("LOCAL-"))data.ID_ATENDIMENTO="";
      var serverData=gfPayloadWithAddressCompat(data);
      var r=await api("salvarAtendimento",{token:tokenFor("staff"),data:serverData,itens:row.itens||[]});
      if(!r?.id)throw new Error("O servidor não confirmou o ID do atendimento.");
      if(state.currentAttendanceId===row.id){state.currentAttendanceId=r.id;state.resumeAttendance={...data,ID_ATENDIMENTO:r.id};}
      data.ID_ATENDIMENTO=r.id;gfRemoveLocalAttendance(row.id);gfCacheSavedAttendance(r.id,data,row.itens||[]);
      setNotice("Atendimento sincronizado com o banco: "+esc(r.id)+".","ok");await renderAtendimento();
    }catch(e){setNotice("Ainda não foi possível sincronizar: "+esc(e.message)+". O atendimento continua salvo neste dispositivo.","error");btn.disabled=false;btn.textContent="Sincronizar"}
  }});
  $("#downloadAttendancePdf").onclick=async function(){
    if(!state.currentAttendanceId)return alert("Salve o atendimento antes de gerar o PDF.");
    if(String(state.currentAttendanceId).startsWith("LOCAL-")&&currentRunMode()!=="TESTE")return alert("Sincronize o atendimento antes de gerar o PDF.");
    var btn=$("#downloadAttendancePdf");btn.disabled=true;var old=btn.textContent;btn.textContent="Gerando PDF…";
    try{
      var snap=gfCurrentAttendanceSnapshot(products);if(!snap)throw new Error("Não foi possível ler os dados atuais do atendimento.");
      await gfDownloadAttendancePdf(snap.rec,snap.selected);
      showToast("PDF gerado com os valores atuais exibidos na tela.","ok");
    }catch(e){alert(e.message)}
    btn.disabled=false;btn.textContent=old;
  };
  $("#saveAttendance").onclick=async function(){
    if(gfLocalAttendances().some(x=>x.id===state.currentAttendanceId)){setNotice("Sincronize a versão pendente antes de salvar novas alterações.","error");return;}
    var f=$("#attForm");if(!f.reportValidity())return;
    var snap=gfCurrentAttendanceSnapshot(products);if(!snap)return;
    var data=snap.rec,selected=snap.selected;data.PROGRESSO=GF_PCT[state.attendanceStage];
    var btn=$("#saveAttendance");btn.disabled=true;btn.textContent="Salvando…";
    var localId=data.ID_ATENDIMENTO||("LOCAL-"+crypto.randomUUID());
    data.ID_ATENDIMENTO=localId;data.CLIENT_REQUEST_ID="SAVE-"+crypto.randomUUID();
    data.TOTAL_PROPOSTA=snap.rec.TOTAL_PROPOSTA;
    try{gfUpsertLocalAttendance(Object.assign({},data),selected,"Pendente");gfClearAttendanceDraft();}
    catch(e){setNotice(e.message,"error");btn.disabled=false;btn.textContent="Salvar atendimento";return;}
    try{
      var sendData=Object.assign({},data);if(String(sendData.ID_ATENDIMENTO).startsWith("LOCAL-"))sendData.ID_ATENDIMENTO="";sendData=gfPayloadWithAddressCompat(sendData);
      var r=await api("salvarAtendimento",{token:tokenFor("staff"),data:sendData,itens:selected});
      if(!r?.id)throw new Error("O servidor não confirmou o ID do atendimento.");
      gfRemoveLocalAttendance(localId);
      state.currentAttendanceId=r.id;data.ID_ATENDIMENTO=r.id;data.SYNC_STATUS="Sincronizado";state.resumeAttendance=data;state.resumeItems=selected;gfCacheSavedAttendance(r.id,data,selected);
      var veteran=attendanceStudent();
      if(veteran&&data.TIPO_ALUNO==="Veterano"&&Number(data.ANO_LETIVO)===2027){
        var studentPatch=Object.assign({},veteran,{
          ID_ALUNO:veteran.ID_ALUNO,
          PROXIMA_SERIE_2027:data.SERIE_SUGERIDA||veteran.PROXIMA_SERIE_2027||gfNextSeries(data.SERIE_ATUAL||veteran["SÉRIE"]||""),
          SERIE_CONFIRMADA_2027:data.SERIE_CONFIRMADA||data.SERIE_PRETENDIDA||"",
          RESULTADO_2026:String(data.SITUACAO_PROGRESSAO||"").indexOf("Retido")===0?"Retido":"Aprovado",
          PROGRESSAO_STATUS:data.SITUACAO_PROGRESSAO||"Em definição",
          REMATRICULA_STATUS:data.REMATRICULA_STATUS||"Em preparação",
          REMATRICULA_ATUALIZADA_EM:new Date().toISOString()
        });
        try{await api("salvarAluno",{token:tokenFor("staff"),data:studentPatch});state.bootstrap=null}catch(_e){}
      }
      setNotice("Atendimento "+esc(r.id)+" salvo no banco. Você pode continuar depois em “Atendimentos salvos”.","ok");
      await renderAtendimento();
    }catch(e){
      state.currentAttendanceId=localId;state.resumeAttendance=data;state.resumeItems=selected;
      setNotice("O banco não confirmou o salvamento: "+esc(e.message)+". Mesmo assim, o atendimento ficou salvo neste dispositivo e aparece abaixo como “Pendente de sincronização”.","error");
      await renderAtendimento();
    }
  };
  drawCatalog();
}

function openDiscountRequest(product,ctx){if(!state.currentAttendanceId)return alert("Salve o atendimento primeiro.");if(String(state.currentAttendanceId).startsWith("LOCAL-")||gfLocalAttendances().some(x=>x.id===state.currentAttendanceId))return alert("Atendimento ainda não sincronizado com o banco. Salve/sincronize o atendimento antes de pedir desconto.");var v=parseMoney(product&&product.VALOR_BASE);modal("<div class='modal-head'><h3>Solicitar condição especial</h3><button class='icon-btn' data-close>✕</button></div><div class='modal-body'><div class='approval-product'><b>"+esc(product.PRODUTO)+"</b><span>Tabela: "+money(v)+"</span></div><form id='discForm' class='form-grid'><div class='field'><label>Desconto %</label><input id='discPct' name='DESCONTO' type='number' step='.01' value='0'></div><div class='field'><label>Valor solicitado</label><input id='discVal' name='VALOR' type='number' step='.01' value='"+v.toFixed(2)+"'></div><div class='field span-3'><label>Motivo *</label><textarea name='MOTIVO' required></textarea></div></form></div><div class='modal-foot'><button class='btn btn-soft' data-close>Cancelar</button><button class='btn btn-primary' id='sendDisc'>Enviar para Gestão</button></div>");$$("[data-close]").forEach(function(x){x.onclick=closeModal});$("#discPct").oninput=function(){$("#discVal").value=(v*(1-(Number($("#discPct").value)||0)/100)).toFixed(2)};$("#sendDisc").onclick=async function(){var f=$("#discForm");if(!f.reportValidity())return;var d=Object.fromEntries(new FormData(f).entries());try{await api("solicitarDesconto",{token:tokenFor("staff"),data:{ID_ATENDIMENTO:state.currentAttendanceId,ID_PRODUTO:product.ID_PRODUTO,CLIENT_REQUEST_ID:"DISC-"+state.currentAttendanceId+"-"+product.ID_PRODUTO,ANO_LETIVO:ctx.ano,SERIE:ctx.serie,VALOR_TABELA:v,DESCONTO_SOLICITADO:Number(d.DESCONTO||0),VALOR_SOLICITADO:Number(d.VALOR||0),MOTIVO:d.MOTIVO}});closeModal();setNotice("Solicitação enviada.","ok");appAlert("desconto","Solicitação de desconto enviada ✓")}catch(e){alert(e.message)}}}
async function renderAutorizacoes(){
  var list=await api("listarSolicitacoesDesconto",{token:state.adminToken}),
      pending=list.filter(function(x){return x.STATUS==="Aguardando"});
  triggerManagerAlert(pending.length);
  var cards=list.map(function(r){
    return "<article class='approval-card'><div class='approval-top'><div><b>"+esc(r.ALUNO||r.ID_ALUNO||"Aluno")+"</b><span>"+esc(r.SERIE||"")+" • "+esc(r.ANO_LETIVO||"")+"</span></div>"+pill(r.STATUS||"")+"</div><div class='approval-product'><b>"+esc(r.PRODUTO||r.ID_PRODUTO||"")+"</b></div><div class='approval-values'><div><small>Tabela</small><b>"+money(r.VALOR_TABELA)+"</b></div><div><small>Desconto</small><b>"+Number(r["DESCONTO_SOLICITADO_%"]||0).toFixed(2)+"%</b></div><div><small>Solicitado</small><b>"+money(r.VALOR_SOLICITADO)+"</b></div></div>"+(r.MOTIVO?"<p class='approval-note'><b>Pedido:</b> "+esc(r.MOTIVO)+"</p>":"")+(r.STATUS==="Aguardando"?"<div class='approval-actions'><button class='btn btn-primary' data-decide='Autorizado' data-id='"+esc(r.ID_SOLICITACAO)+"'>Autorizar</button><button class='btn btn-danger' data-decide='Negado' data-id='"+esc(r.ID_SOLICITACAO)+"'>Negar</button></div>":"")+"</article>";
  }).join("");
  var resetBtn=currentRunMode()==="TESTE"
    ? "<button class='btn btn-danger' id='resetTestApprovals'>↻ Resetar autorizações de teste</button>"
    : "";
  $("#view").innerHTML=
    "<div class='approval-hero'><div><span>CENTRAL DA DIREÇÃO</span><h2>Autorizações de desconto</h2><p>Pedidos da equipe sem alterar a tabela oficial.</p></div><div class='approval-hero-actions'><button class='btn btn-gold' id='enableAlerts'>Ativar alertas</button>"+resetBtn+"</div></div>"+
    "<div class='cards grid'><div class='card metric'><div class='label'>Aguardando</div><div class='value'>"+pending.length+"</div></div><div class='card metric'><div class='label'>Autorizados</div><div class='value'>"+list.filter(function(x){return x.STATUS==="Autorizado"}).length+"</div></div><div class='card metric'><div class='label'>Negados</div><div class='value'>"+list.filter(function(x){return x.STATUS==="Negado"}).length+"</div></div><div class='card metric'><div class='label'>Concluídos</div><div class='value'>"+list.filter(function(x){return x.STATUS==="Concluído"}).length+"</div></div></div>"+
    "<div class='section-head'><h2>Fila de decisão</h2></div><div class='approval-list'>"+(cards||"<div class='card empty'>Nenhum pedido.</div>")+"</div>";
  $("#enableAlerts").onclick=requestManagerNotifications;
  var reset=$("#resetTestApprovals");
  if(reset)reset.onclick=async function(){
    if(!confirm("Apagar TODAS as autorizações marcadas como Teste/Simulação? Os registros de produção serão preservados."))return;
    var old=this.textContent;this.disabled=true;this.textContent="Limpando…";
    try{
      var res=await api("limparAutorizacoesTeste",{token:state.adminToken});
      clearApiCache();
      sessionStorage.setItem("gf_pending_approvals","0");
      showToast((res?.removidas||0)+" autorização(ões) de teste removida(s) ✓","ok");
      await renderAutorizacoes();
    }catch(e){
      var msg=String(e.message||e);
      if(/Ação não reconhecida|limparAutorizacoesTeste/i.test(msg))showToast("O backend publicado ainda precisa receber a função de reset das autorizações.","error");
      else showToast(msg,"error");
      this.disabled=false;this.textContent=old;
    }
  };
  $$("[data-decide]").forEach(function(b){
    b.onclick=function(){decisionModal(list.find(function(x){return x.ID_SOLICITACAO===b.dataset.id}),b.dataset.decide)}
  });
}
function decisionModal(r,status){modal("<div class='modal-head'><h3>"+(status==="Autorizado"?"Autorizar":"Negar")+"</h3><button class='icon-btn' data-close>✕</button></div><div class='modal-body'><div class='form-grid'>"+(status==="Autorizado"?"<div class='field'><label>Valor autorizado</label><input id='authVal' type='number' step='.01' value='"+Number(r.VALOR_SOLICITADO||0).toFixed(2)+"'></div>":"")+"<div class='field span-3'><label>Observação</label><textarea id='authNote'></textarea></div></div></div><div class='modal-foot'><button class='btn btn-soft' data-close>Cancelar</button><button class='btn btn-primary' id='confirmDecision'>Confirmar</button></div>");$$("[data-close]").forEach(function(x){x.onclick=closeModal});$("#confirmDecision").onclick=async function(){try{await api("decidirSolicitacaoDesconto",{token:state.adminToken,id:r.ID_SOLICITACAO,status:status,valorAutorizado:status==="Autorizado"?Number($("#authVal").value||0):null,observacao:$("#authNote").value});closeModal();renderAutorizacoes()}catch(e){alert(e.message)}}}
async function requestManagerNotifications(){if("Notification" in window&&Notification.permission!=="granted")await Notification.requestPermission();navigator.vibrate&&navigator.vibrate([100,60,100]);setNotice("Alertas locais ativados.","ok")}
function triggerManagerAlert(count){var old=Number(sessionStorage.getItem("gf_pending_approvals")||0);sessionStorage.setItem("gf_pending_approvals",String(count));var b=$("#approvalBadge");if(b){b.textContent=count;b.classList.toggle("hidden",count<1)}if(count<=old||count<1)return;appAlert("desconto","Novo pedido de desconto aguardando a Gestão");if("Notification" in window&&Notification.permission==="granted")new Notification("Gestão Futuro",{body:count+" pedido(s) aguardando decisão."})}
async function pollApprovals(){
  if(!state.adminToken||state.approvalPolling)return;
  state.approvalPolling=true;
  try{var l=await api("listarSolicitacoesDesconto",{token:state.adminToken});triggerManagerAlert(l.filter(function(x){return x.STATUS==="Aguardando"}).length)}
  catch(e){}finally{state.approvalPolling=false}
}

function gfParseExtras(raw){
  if(!raw) return [];
  if(Array.isArray(raw)) return raw;
  try{
    var arr=JSON.parse(raw);
    return Array.isArray(arr)?arr:[];
  }catch(e){
    return String(raw).split("\n").map(function(line){return line.trim()}).filter(Boolean).map(function(line){return {nome:line,descricao:"",valor:""}});
  }
}
function gfExtrasJsonFromForm(){
  return $$(".extra-row").map(function(row){
    return {
      nome:$("[data-extra-name]",row)?.value.trim()||"",
      descricao:$("[data-extra-desc]",row)?.value.trim()||"",
      valor:$("[data-extra-value]",row)?.value.trim()||""
    };
  }).filter(function(x){return x.nome||x.descricao||x.valor});
}
const GF_UNIFORM_ASSETS=Object.freeze({
  infantil:{label:"Educação Infantil",src:"/assets/fardamento/farda-infantil.png",segment:"infantil"},
  iniciais:{label:"Fardamento oficial • 1º ao 5º Ano",src:"/assets/fardamento/farda-anos-iniciais.png",segment:"iniciais"},
  "esportes-iniciais":{label:"Educação Física e Esportes • 1º ao 5º Ano",src:"/assets/fardamento/farda-esportes-iniciais.png",segment:"iniciais"},
  finais:{label:"Fardamento oficial • 6º ao 9º Ano",src:"/assets/fardamento/farda-anos-finais.png",segment:"finais"},
  "esportes-finais":{label:"Educação Física e Esportes • 6º ao 9º Ano",src:"/assets/fardamento/farda-esportes-finais.png",segment:"finais"},
  lancamentos:{label:"Lançamentos 2026 • Casaco e STI",src:"/assets/fardamento/farda-lancamentos.png",segment:"geral"}
});
function gfUniformSegment(serie){
  var v=String(serie||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  if(/infantil/.test(v))return "infantil";
  if(/^[1-5][ºo]?\s*ano/.test(v)||/anos iniciais/.test(v))return "iniciais";
  if(/^[6-9][ºo]?\s*ano/.test(v)||/anos finais/.test(v))return "finais";
  if(/medio|médio/.test(String(serie||"").toLowerCase()))return "medio";
  return "";
}
function gfUniformDefaults(serie){
  var seg=gfUniformSegment(serie);
  if(seg==="infantil")return ["infantil"];
  if(seg==="iniciais")return ["iniciais","esportes-iniciais"];
  if(seg==="finais")return ["finais","esportes-finais"];
  return [];
}
function gfParseUniformConfig(cfg,serie){
  var raw=cfg&&cfg.FARDAMENTO||"",parsed=null;
  if(raw&&typeof raw==="object")parsed=raw;
  else if(typeof raw==="string"&&raw.trim().charAt(0)==="{"){try{parsed=JSON.parse(raw)}catch(e){}}
  var items=Array.isArray(parsed&&parsed.itens)?parsed.itens.filter(function(k){return !!GF_UNIFORM_ASSETS[k]}):[];
  var explicit=!!(parsed&&Array.isArray(parsed.itens));
  if(!explicit)items=gfUniformDefaults(serie);
  return {itens:items,texto:parsed&&parsed.texto!=null?String(parsed.texto):((parsed||raw!==String(raw))?"":String(raw||"")),customUrl:String((parsed&&parsed.customUrl)||cfg&&cfg.IMAGEM_URL||"")};
}
function gfSafeImageUrl(url){
  var u=String(url||"").trim();if(!u)return "";
  if(u.charAt(0)==="/")return u;
  try{var x=new URL(u,location.origin);return /^https?:$/.test(x.protocol)?x.href:""}catch(e){return ""}
}
function gfUniformMarkup(cfg,serie){
  var uc=gfParseUniformConfig(cfg,serie),cards=[];
  uc.itens.forEach(function(k){var a=GF_UNIFORM_ASSETS[k];if(a)cards.push("<figure class='flyer-uniform-card'><img src='"+esc(a.src)+"' alt='"+esc(a.label)+"'><figcaption>"+esc(a.label)+"</figcaption></figure>")});
  var custom=gfSafeImageUrl(uc.customUrl);if(custom)cards.push("<figure class='flyer-uniform-card custom'><img src='"+esc(custom)+"' alt='Fardamento personalizado'><figcaption>Imagem personalizada</figcaption></figure>");
  if(!cards.length){
    if(gfUniformSegment(serie)==="medio")return "<section class='flyer-uniforms flyer-uniform-empty'><div><h3>Fardamento</h3><p>Imagem específica do Ensino Médio ainda não cadastrada. A Gestão pode escolher uma imagem no editor do panfleto.</p></div></section>";
    return "";
  }
  return "<section class='flyer-uniforms'><div class='flyer-uniform-title'><h3>Fardamento da série</h3><span>Modelos oficiais</span></div><div class='flyer-uniform-grid "+(cards.length===1?"single":"")+"'>"+cards.join("")+"</div>"+(uc.texto?"<p class='flyer-uniform-note'>"+esc(uc.texto)+"</p>":"")+"</section>";
}
function gfUniformPickerMarkup(cfg,serie){
  var uc=gfParseUniformConfig(cfg,serie),seg=gfUniformSegment(serie),keys=Object.keys(GF_UNIFORM_ASSETS);
  keys.sort(function(a,b){
    var aa=GF_UNIFORM_ASSETS[a],bb=GF_UNIFORM_ASSETS[b];
    return (aa.segment===seg?0:aa.segment==="geral"?1:2)-(bb.segment===seg?0:bb.segment==="geral"?1:2);
  });
  return "<div class='uniform-picker'>"+keys.map(function(k){
    var a=GF_UNIFORM_ASSETS[k],checked=uc.itens.indexOf(k)>=0?" checked":"";
    var relevant=(a.segment===seg||a.segment==="geral")?" relevant":"";
    return "<label class='uniform-pick-card"+relevant+"'><input type='checkbox' data-uniform-key='"+esc(k)+"'"+checked+"><span class='uniform-pick-image'><img src='"+esc(a.src)+"' alt=''></span><b>"+esc(a.label)+"</b></label>";
  }).join("")+"</div>";
}


function gfFlyerGradeNumber(serie){
  var s=gfNorm(serie),m=s.match(/\b([1-9])\s*(?:º|o)?\s*ano\b/);return m?Number(m[1]):0;
}
function gfFlyerFolderName(serie){
  var s=gfNorm(serie),n=gfFlyerGradeNumber(serie);
  if(s.includes("infantil"))return "Pasta escolar rosa";
  if(n>=1&&n<=5)return "Pasta escolar amarela";
  if(n>=6&&n<=9)return "Pasta escolar verde";
  return "Pasta escolar conforme orientação da Secretaria";
}
function gfFlyerDocumentRules(y,serie,tipo,cfg){
  var n=gfFlyerGradeNumber(serie),veterano=gfNorm(tipo)==="veterano",year=Number(y)||2026;
  var central=state.docRulesCache&&state.docRulesCache[year]&&state.docRulesCache[year].rows;
  if(Array.isArray(central)&&central.length&&typeof gfChecklistRowsForProfile==="function"){
    var filtered=gfChecklistRowsForProfile(central,year,serie,tipo,"panfleto");
    if(filtered.length){
      var customCentral=veterano?String(cfg&&cfg.DOCUMENTOS_VETERANO||"").trim():String(cfg&&cfg.DOCUMENTOS_NOVATO||"").trim();
      return {tipo:veterano?"Veterano":"Novato",items:filtered.map(function(r){return {t:r.DOCUMENTO||"",d:[r.CONDICAO,r.PRAZO].filter(Boolean).join(" • ")}}),custom:customCentral,source:"gestao"};
    }
  }
  var common=[
    {t:"Requerimento de matrícula "+year+" preenchido e assinado"},
    {t:"Contrato de Prestação de Serviços Educacionais "+year+" assinado"},
    {t:"Cartão de Vacinação",d:"Obrigatório na matrícula/rematrícula • Lei nº 16.929/2019 (CE)"},
    {t:"RG e CPF do responsável financeiro"},
    {t:"Comprovante de residência do responsável financeiro",d:"Emitido há no máximo 90 dias"},
    {t:"Comprovante de pagamento da 1ª parcela da anuidade de "+year}
  ];
  if(n>=1&&n<=9)common.splice(3,0,{t:"Atestado médico para prática de Educação Física",d:year===2026?"Prazo informado pela Secretaria deve ser confirmado.":"Entregar conforme prazo informado pela Secretaria."});
  var novatos=[
    {t:gfFlyerFolderName(serie),d:"Somente para alunos novatos"},
    {t:"Certidão de Nascimento ou Identidade"},
    {t:"CPF e RG do pai e da mãe do aluno"},
    {t:"Dados do NIS",d:"Se receber Bolsa Família"},
    {t:"Comprovante de endereço atual com CEP",d:"Emitido há no máximo 90 dias"},
    {t:"2 fotos 3x4 coloridas e recentes"}
  ];
  if(n>=2&&n<=9)novatos.push({t:"Histórico Escolar original ou declaração provisória da escola de origem",d:year===2026?"Histórico poderá ser entregue até 19/01/2026.":"Histórico conforme prazo informado pela Secretaria."});
  var custom=veterano?String(cfg&&cfg.DOCUMENTOS_VETERANO||"").trim():String(cfg&&cfg.DOCUMENTOS_NOVATO||"").trim();
  return {tipo:veterano?"Veterano":"Novato",items:veterano?common:novatos.concat(common),custom:custom,source:"fallback"};
}
function gfFlyerDocumentsMarkup(y,serie,tipo,cfg){
  var d=gfFlyerDocumentRules(y,serie,tipo,cfg);
  var custom=d.custom?"<div class='flyer-doc-custom'>"+esc(d.custom)+"</div>":"";
  return "<section class='flyer-docs-integrated'><div class='flyer-docs-title'><div><small>DOCUMENTAÇÃO • "+esc(d.tipo.toUpperCase())+"</small><h3>Documentos necessários</h3></div><span>"+d.items.length+" item(ns)</span></div>"+
    "<div class='flyer-doc-list'>"+d.items.map(function(x){return "<div class='flyer-doc-item'><i>✓</i><div><b>"+esc(x.t)+"</b>"+(x.d?"<small>"+esc(x.d)+"</small>":"")+"</div></div>"}).join("")+"</div>"+custom+"</section>";
}

function gfFlyerMarkup(y,s,cfg,list,tipoAluno){
  var groups=gfGroups(list),body="";
  Object.keys(groups).forEach(function(cat){
    body+="<section class='flyer-category'><h3>"+esc(cat)+"</h3><div class='flyer-items'>"+
      groups[cat].map(function(p){
        var meta=gfFlyerPlanMeta(p,list);
        var title=meta?meta.title:p.PRODUTO,desc=meta?meta.desc:(p["DESCRIÇÃO"]||p["OBSERVAÇÃO"]||""),value=meta?meta.value:money(p.VALOR_BASE);
        return "<div class='flyer-item'><div><b>"+esc(title)+"</b><small>"+esc(desc)+"</small></div><strong>"+value+"</strong></div>";
      }).join("")+"</div></section>";
  });
  var extras=gfParseExtras(cfg.SERVICOS_ADICIONAIS),itemCount=(list||[]).length+extras.length,density=itemCount>18?" ultra-dense":itemCount>11?" dense":"";
  var extrasHtml=extras.length?"<section class='flyer-category flyer-extras'><h3>Produtos e serviços adicionais</h3><div class='flyer-items'>"+
    extras.map(function(x){return "<div class='flyer-item'><div><b>"+esc(x.nome||"Adicional")+"</b><small>"+esc(x.descricao||"")+"</small></div>"+(x.valor!==""&&x.valor!=null?"<strong>"+money(x.valor)+"</strong>":"")+"</div>"}).join("")+
    "</div></section>":"";
  var offer=cfg.O_QUE_OFERECE?"<section class='flyer-info'><h3>O que oferecemos</h3><p>"+esc(cfg.O_QUE_OFERECE)+"</p></section>":"";
  var notes=cfg.OBSERVACOES?"<div class='flyer-note'>"+esc(cfg.OBSERVACOES)+"</div>":"";
  var uniforms=gfUniformMarkup(cfg,s),docsHtml=gfFlyerDocumentsMarkup(y,s,tipoAluno||"Novato",cfg);
  return "<article class='flyer flyer-a4"+density+"' id='flyerPreview'>"+
    "<div class='flyer-head'>"+(window.FUTURO_BRAND&&window.FUTURO_BRAND.logo?"<img src='"+window.FUTURO_BRAND.logo+"' alt='Colégio Futuro'>":"")+
    "<div><span>MATRÍCULAS "+y+"</span><h2>"+esc(cfg.TITULO||("Colégio Futuro • "+s))+"</h2><p>"+esc(cfg.SUBTITULO||"Educação que prepara para o presente e impulsiona cada estudante para o futuro.")+"</p></div></div>"+
    "<div class='flyer-series'>"+esc(s)+"</div>"+
    uniforms+
    "<div class='flyer-content-grid'>"+body+extrasHtml+offer+"</div>"+
    docsHtml+
    notes+
    "<footer><b>Colégio Futuro</b><span>Informações oficiais • Gestão Futuro</span></footer></article>";
}
function gfBindFlyerActions(y,s,cfg,list){
  $("#printFlyer").onclick=function(){
    var w=window.open("","_blank");if(!w)return alert("Permita pop-ups para gerar o PDF.");
    w.document.write("<!doctype html><html><head><meta charset='utf-8'><title>Panfleto "+esc(s)+" "+y+"</title><link rel='stylesheet' href='/styles.css'><style>@page{size:A4 portrait;margin:7mm}html,body{margin:0!important;padding:0!important;background:#fff!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.flyer-actions{display:none!important}.flyer-a4{width:196mm!important;max-width:196mm!important;min-height:auto!important;margin:0 auto!important;box-shadow:none!important;border:0!important;border-radius:0!important;padding:5mm!important;box-sizing:border-box!important}.flyer-category,.flyer-uniforms,.flyer-cols section,.flyer-info,.flyer-item{break-inside:avoid!important;page-break-inside:avoid!important}img{max-width:100%!important}</style></head><body>"+$("#flyerPreview").outerHTML+"<script>window.onload=function(){var imgs=[].slice.call(document.images);Promise.all(imgs.map(function(img){return img.complete?Promise.resolve():new Promise(function(r){img.onload=img.onerror=r})})).then(function(){setTimeout(function(){window.print()},500)})}<\/script></body></html>");
    w.document.close();
  };
  $("#editFlyer")?.addEventListener("click",function(){editFlyerContent(y,s,cfg)});
}
async function renderPanfletos(){
  const pageSeq=state.navSeq;
  let requestSeq=0;
  const activePage=()=>state.view==="panfletos"&&state.navSeq===pageSeq&&!!$("#flyerArea");

  var defaultYear=Number(state.flyerYear||2027),serie=state.flyerSeries||"Infantil 2",defaultType=state.flyerStudentType||"Novato";
  const view=$("#view");
  if(!view)return;
  view.innerHTML="<div class='section-head'><div><h2>Panfleto por série</h2><span class='muted'>Valores, mensalidades, material, fardamento e documentos vêm automaticamente da Gestão e da Secretaria.</span></div><div class='toolbar'><span class='catalog-sync-badge' id='flyerCatalogSync'>Sincronizando Gestão…</span><select id='flyerYear' class='search'><option>"+defaultYear+"</option><option>"+(defaultYear-1)+"</option></select><select id='flyerSerie' class='search'>"+gfOptions(serie)+"</select><select id='flyerStudentType' class='search'><option "+(defaultType==="Novato"?"selected":"")+">Novato</option><option "+(defaultType==="Veterano"?"selected":"")+">Veterano</option></select><button class='btn btn-primary' id='generateFlyer'>Atualizar dados</button></div></div><div id='flyerArea'><div class='card flyer-loading'><b>Carregando panfleto…</b><span class='muted'>Consultando o catálogo oficial publicado pela Gestão.</span></div></div>";

  var products=[];
  try{
    products=await loadCatalogProducts(true);
    var syncBadge=$("#flyerCatalogSync");if(syncBadge){syncBadge.textContent="Gestão sincronizada ✓";syncBadge.classList.add("ok")}
  }catch(e){
    products=state.catalogProducts||[];
    if(!products.length){try{var b=await loadBootstrap();products=b.produtos||[]}catch(_e){}}
    var syncBadge=$("#flyerCatalogSync");if(syncBadge){syncBadge.textContent="Usando última tabela disponível";syncBadge.classList.add("warn")}
  }
  if(!activePage())return;

  var years=[...new Set(products.map(gfYear).filter(Boolean))].sort(function(a,b){return b-a});
  const yearSelect=$("#flyerYear");
  if(years.length&&yearSelect){
    if(!years.includes(defaultYear))defaultYear=years[0];
    yearSelect.innerHTML=years.map(function(y){return "<option value='"+y+"' "+(y===defaultYear?"selected":"")+">"+y+"</option>"}).join("");
  }

  async function generate(){
    const myRequest=++requestSeq;
    const yearEl=$("#flyerYear"),serieEl=$("#flyerSerie"),area=$("#flyerArea");
    if(!activePage()||!yearEl||!serieEl||!area)return;

    var y=Number(yearEl.value||defaultYear),s=serieEl.value||serie,tipo=$("#flyerStudentType")?.value||"Novato";
    state.flyerYear=y;state.flyerSeries=s;state.flyerStudentType=tipo;
    state.documentRulesByYear=state.documentRulesByYear||{};
    if(!Object.prototype.hasOwnProperty.call(state.documentRulesByYear,y)){
      try{state.documentRulesByYear[y]=await api("listarChecklistDocumentos",{token:tokenFor("staff"),ano:y})||[]}catch(e){state.documentRulesByYear[y]=[]}
      if(!activePage()||myRequest!==requestSeq)return;
    }
    var localList=gfCatalog(products,y,s),cacheKey=y+"|"+s,cached=state.flyerCache&&state.flyerCache[cacheKey],cfg=cached?.config||{};

    area.innerHTML=gfFlyerMarkup(y,s,cfg,localList,tipo)+"<div class='flyer-actions'><button class='btn btn-primary' id='printFlyer'>Imprimir / Salvar PDF</button>"+(state.adminToken?"<button class='btn btn-gold' id='editFlyer'>Editar conteúdo e adicionais</button>":"")+"</div>";
    gfBindFlyerActions(y,s,cfg,localList);

    try{
      var results=await Promise.allSettled([
        loadCatalogProducts(true),
        api("getPanfletoSerie",{token:tokenFor("staff"),ano:y,serie:s})
      ]);
      if(!activePage()||myRequest!==requestSeq)return;

      if(results[0].status==="fulfilled"){
        products=results[0].value||[];
        var syncBadge=$("#flyerCatalogSync");if(syncBadge){syncBadge.textContent="Gestão sincronizada ✓";syncBadge.className="catalog-sync-badge ok"}
      }else{
        var syncBadge=$("#flyerCatalogSync");if(syncBadge){syncBadge.textContent="Última tabela disponível";syncBadge.className="catalog-sync-badge warn"}
      }

      var d=results[1].status==="fulfilled"?(results[1].value||{}):{};
      if(results[1].status==="fulfilled"){state.flyerCache=state.flyerCache||{};state.flyerCache[cacheKey]=d}
      cfg=d.config||cfg||{};
      var list=gfCatalog(products.length?products:localList,y,s),currentArea=$("#flyerArea");
      if(!currentArea)return;
      currentArea.innerHTML=gfFlyerMarkup(y,s,cfg,list,tipo)+"<div class='flyer-actions'><button class='btn btn-primary' id='printFlyer'>Imprimir / Salvar PDF</button>"+(state.adminToken?"<button class='btn btn-gold' id='editFlyer'>Editar conteúdo e adicionais</button>":"")+"</div>";
      gfBindFlyerActions(y,s,cfg,list);
      if(results[1].status==="rejected")setNotice("Valores sincronizados com a Gestão; a personalização do panfleto está usando a última versão disponível.","error");
    }catch(e){
      if(!activePage()||myRequest!==requestSeq)return;
      setNotice("Panfleto exibido com a última tabela disponível. Não foi possível atualizar agora.","error");
    }
  }

  const generateBtn=$("#generateFlyer"),flyerYear=$("#flyerYear"),flyerSerie=$("#flyerSerie"),flyerStudentType=$("#flyerStudentType");
  if(generateBtn)generateBtn.onclick=generate;
  if(flyerYear)flyerYear.onchange=generate;
  if(flyerSerie)flyerSerie.onchange=generate;
  if(flyerStudentType)flyerStudentType.onchange=generate;
  await generate();
}
function editFlyerContent(y,s,cfg){
  var extras=gfParseExtras(cfg.SERVICOS_ADICIONAIS),uniformCfg=gfParseUniformConfig(cfg,s);
  modal("<div class='modal-head'><h3>Conteúdo do panfleto</h3><button class='icon-btn' data-close>✕</button></div><div class='modal-body'><form id='flyerEdit' class='form-grid'>"+
    "<div class='field span-2'><label>Título</label><input name='TITULO' value='"+esc(cfg.TITULO||("Colégio Futuro • "+s))+"'></div>"+
    "<div class='field span-3'><label>Subtítulo</label><input name='SUBTITULO' value='"+esc(cfg.SUBTITULO||"")+"'></div>"+
    "<div class='field span-3'><label>O que oferece</label><textarea name='O_QUE_OFERECE'>"+esc(cfg.O_QUE_OFERECE||"")+"</textarea></div>"+
    "<div class='field span-3 uniform-editor-block'><div class='section-head compact'><div><label>Fardamento visual</label><span class='muted'>As imagens sugeridas já acompanham a série. Marque ou desmarque o que deve aparecer no panfleto.</span></div></div>"+gfUniformPickerMarkup(cfg,s)+"</div>"+
    "<div class='field span-3'><label>Observação sobre o fardamento</label><textarea id='uniformText' placeholder='Ex.: Uso obrigatório conforme orientação da escola.'>"+esc(uniformCfg.texto||"")+"</textarea></div>"+
    "<div class='field span-3'><label>Imagem personalizada do fardamento (opcional)</label><input id='uniformCustomUrl' type='url' value='"+esc(uniformCfg.customUrl||"")+"' placeholder='https://...'><small class='muted'>Se informada, entra junto às imagens oficiais.</small></div>"+
    "<div class='field span-3'><label>Novatos</label><textarea name='DOCUMENTOS_NOVATO'>"+esc(cfg.DOCUMENTOS_NOVATO||"")+"</textarea></div>"+
    "<div class='field span-3'><label>Veteranos</label><textarea name='DOCUMENTOS_VETERANO'>"+esc(cfg.DOCUMENTOS_VETERANO||"")+"</textarea></div>"+
    "<div class='field span-3'><label>Observações</label><textarea name='OBSERVACOES'>"+esc(cfg.OBSERVACOES||"")+"</textarea></div>"+
    "<div class='field span-3'><div class='section-head compact'><div><label>Produtos e serviços adicionais</label><span class='muted'>Inclua quantos forem necessários. Eles aparecem somente neste panfleto.</span></div><button type='button' class='btn btn-soft' id='addExtra'>+ Adicionar</button></div><div id='extrasList'></div></div>"+
    "</form></div><div class='modal-foot'><button class='btn btn-soft' data-close>Cancelar</button><button class='btn btn-primary' id='saveFlyer'>Salvar</button></div>");
  function drawExtras(){
    var root=$("#extrasList");root.innerHTML=(extras.length?extras:[{nome:"",descricao:"",valor:""}]).map(function(x,i){
      return "<div class='extra-row'><div class='field'><label>Produto/serviço</label><input data-extra-name value='"+esc(x.nome||"")+"' placeholder='Ex.: Integral, esporte, agenda...'></div><div class='field'><label>Descrição</label><input data-extra-desc value='"+esc(x.descricao||"")+"' placeholder='Detalhes'></div><div class='field'><label>Valor</label><input data-extra-value type='number' step='0.01' value='"+esc(x.valor||"")+"' placeholder='0,00'></div><button type='button' class='icon-btn danger' data-remove-extra='"+i+"'>Remover</button></div>";
    }).join("");
    $$("[data-remove-extra]").forEach(function(b){b.onclick=function(){extras.splice(Number(b.dataset.removeExtra),1);drawExtras()}});
  }
  drawExtras();
  $("#addExtra").onclick=function(){extras=gfExtrasJsonFromForm();extras.push({nome:"",descricao:"",valor:""});drawExtras()};
  $$("[data-close]").forEach(function(x){x.onclick=closeModal});
  $("#saveFlyer").onclick=async function(){
    var btn=this,old=btn.textContent;
    try{
      btn.disabled=true;btn.textContent="Salvando…";
      var data=Object.fromEntries(new FormData($("#flyerEdit")).entries());
      data.SERVICOS_ADICIONAIS=JSON.stringify(gfExtrasJsonFromForm());
      var selected=$$("[data-uniform-key]:checked").map(function(x){return x.dataset.uniformKey});
      data.FARDAMENTO=JSON.stringify({versao:1,itens:selected,texto:$("#uniformText").value||"",customUrl:$("#uniformCustomUrl").value||""});
      data.IMAGEM_URL=$("#uniformCustomUrl").value||"";
      await api("salvarPanfletoSerie",{token:state.adminToken,ano:y,serie:s,data:data});
      state.flyerCache=state.flyerCache||{};delete state.flyerCache[y+"|"+s];
      closeModal();renderPanfletos();
    }catch(e){showToast(e.message||"Não foi possível salvar o panfleto.","error");btn.disabled=false;btn.textContent=old}
  };
}
