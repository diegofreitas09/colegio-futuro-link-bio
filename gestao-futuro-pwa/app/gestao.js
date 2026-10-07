
function gfGestaoDocFallbackRows(ano){
  var rules=typeof GF_DOCS_2026_RULES!=="undefined"?GF_DOCS_2026_RULES:[];
  return rules.map(function(r){
    return {
      ID_REGRA:r.id,
      TIPO_MATRICULA:r.novato?"Novato":"Todos",
      PUBLICO:r.grupo,
      SERIE_APLICAVEL:r.series==="1-9"?"1º ao 9º Ano":r.series==="2-9"?"2º ao 9º Ano":"Todos",
      DOCUMENTO:r.documento,
      OBRIGATORIO:r.obrigatorio,
      CONDICAO:r.condicao,
      PRAZO:r.prazo,
      STATUS_PADRAO:"Pendente",
      ORIGEM:"Secretaria 2026",
      OBSERVACAO:"",
      ATIVO:"Sim",
      PUBLICADO_SECRETARIA:"Sim",
      PUBLICADO_PANFLETO:"Sim",
      ANO_LETIVO:Number(ano)||2026
    };
  });
}
async function gfLoadChecklistGestao(ano,force){
  var y=Number(ano)||2026;
  state.docRulesCache=state.docRulesCache||{};
  if(!force&&state.docRulesCache[y])return state.docRulesCache[y];
  try{
    var rows=await api("listarChecklistDocumentos",{token:tokenFor("staff"),ano:y});
    if(Array.isArray(rows)&&rows.length){
      state.docRulesCache[y]={rows:rows,source:"api",year:y};
      return state.docRulesCache[y];
    }
  }catch(e){}
  state.docRulesCache[y]={rows:gfGestaoDocFallbackRows(y),source:"fallback",year:y};
  return state.docRulesCache[y];
}
function gfChecklistSeriesMatch(rule,serie){
  var a=gfNorm(rule&&rule.SERIE_APLICAVEL||"Todos"),s=gfNorm(serie),n=(s.match(/\b([1-9])\s*(?:º|o)?\s*ano\b/)||[])[1];
  n=Number(n||0);
  if(!a||a==="todos")return true;
  if(a.includes("1º ao 9º")||a.includes("1o ao 9o")||a.includes("1 ao 9"))return n>=1&&n<=9;
  if(a.includes("2º ao 9º")||a.includes("2o ao 9o")||a.includes("2 ao 9"))return n>=2&&n<=9;
  if(a.includes("infantil"))return s.includes("infantil");
  if(a.includes("anos iniciais"))return n>=1&&n<=5;
  if(a.includes("anos finais"))return n>=6&&n<=9;
  return s===a||s.includes(a)||a.includes(s);
}
function gfChecklistFolderLabel(serie){
  var s=gfNorm(serie),m=s.match(/\b([1-9])\s*(?:º|o)?\s*ano\b/),n=Number(m&&m[1]||0);
  if(s.includes("infantil"))return "Pasta escolar rosa (Educação Infantil)";
  if(n>=1&&n<=5)return "Pasta escolar amarela (Anos Iniciais)";
  if(n>=6&&n<=9)return "Pasta escolar verde (Anos Finais)";
  return "Pasta escolar conforme orientação da Secretaria";
}
function gfChecklistRowsForProfile(rows,ano,serie,tipo,channel){
  var t=gfNorm(tipo||"Novato"),pub=channel==="panfleto"?"PUBLICADO_PANFLETO":"PUBLICADO_SECRETARIA";
  return (rows||[]).filter(function(r){
    var rt=gfNorm(r.TIPO_MATRICULA||"Todos");
    return String(r.ATIVO||"Sim")!=="Não"&&String(r[pub]||"Sim")!=="Não"&&(rt==="todos"||rt===t)&&gfChecklistSeriesMatch(r,serie);
  }).map(function(r){
    var x=Object.assign({},r);
    if(/pasta escolar/i.test(String(x.DOCUMENTO||"")))x.DOCUMENTO=gfChecklistFolderLabel(serie);
    return x;
  });
}
function gfDocPubBadge(v){return pill(String(v||"Sim"),String(v||"Sim")==="Sim"?"ok":"warn")}
async function renderDocumentacaoGestao(){
  var year=Number(state.docRulesYear||2026),loaded=await gfLoadChecklistGestao(year),rows=loaded.rows||[];
  state.docRulesYear=year;
  $("#view").innerHTML=`
    <div class="section-head">
      <div><h2>Documentação da matrícula</h2><span class="muted">Fonte central da Gestão para Secretaria e Panfletos.</span></div>
      <div class="toolbar"><select id="docRulesYear" class="search"><option value="2026" ${year===2026?"selected":""}>2026</option></select><button class="btn btn-soft" id="refreshDocRules">Atualizar</button></div>
    </div>
    <section class="doc-mgmt-flow">
      <div><small>1 • GESTÃO</small><b>Define as exigências</b><span>Documento, público, condição, prazo e obrigatoriedade.</span></div>
      <i>→</i>
      <div><small>2 • SECRETARIA</small><b>Gera o checklist do aluno</b><span>Novato/veterano e série determinam os itens aplicáveis.</span></div>
      <i>→</i>
      <div><small>3 • PANFLETO</small><b>Mostra a lista correta</b><span>O material acompanha o tipo de aluno selecionado.</span></div>
    </section>
    <section class="card doc-mgmt-summary">
      <div><small>REGRAS ATIVAS</small><strong>${rows.filter(r=>String(r.ATIVO||"Sim")!=="Não").length}</strong></div>
      <div><small>SECRETARIA</small><strong>${rows.filter(r=>String(r.PUBLICADO_SECRETARIA||"Sim")==="Sim").length}</strong><span>publicadas</span></div>
      <div><small>PANFLETO</small><strong>${rows.filter(r=>String(r.PUBLICADO_PANFLETO||"Sim")==="Sim").length}</strong><span>publicadas</span></div>
      <div><small>FONTE</small><strong>${loaded.source==="api"?"Base oficial":"Regras sincronizadas"}</strong><span>${loaded.source==="api"?"Google Sheets/API":"modo compatível com API atual"}</span></div>
    </section>
    <section class="card doc-mgmt-preview">
      <div class="section-head compact"><div><h3>Prévia por perfil</h3><span class="muted">Confira exatamente o que será mostrado para a família.</span></div><div class="toolbar"><select id="docPreviewType" class="search"><option>Novato</option><option>Veterano</option></select><select id="docPreviewSeries" class="search">${gfOptions("Infantil 2")}</select><button class="btn btn-primary" id="openDocFlyer">Abrir no panfleto</button></div></div>
      <div id="docPreviewArea"></div>
    </section>
    <div class="section-head"><div><h3>Regras oficiais ${year}</h3><span class="muted">Alterações centrais devem refletir na Secretaria e nos Panfletos.</span></div>${state.backendCaps&&state.backendCaps.checklistManagement===true?'<button class="btn btn-primary" id="newDocRule">+ Novo requisito</button>':''}</div>
    <div class="table-wrap"><table><thead><tr><th>Documento</th><th>Público</th><th>Aplicação</th><th>Obrigatório</th><th>Prazo</th><th>Secretaria</th><th>Panfleto</th><th></th></tr></thead><tbody>
      ${rows.map(r=>`<tr><td><strong>${esc(r.DOCUMENTO||"")}</strong><br><span class="muted">${esc(r.CONDICAO||"")}</span></td><td>${esc(r.PUBLICO||"")}</td><td>${esc(r.TIPO_MATRICULA||"Todos")} • ${esc(r.SERIE_APLICAVEL||"Todos")}</td><td>${esc(r.OBRIGATORIO||"")}</td><td>${esc(r.PRAZO||"")}</td><td>${gfDocPubBadge(r.PUBLICADO_SECRETARIA)}</td><td>${gfDocPubBadge(r.PUBLICADO_PANFLETO)}</td><td>${state.backendCaps&&state.backendCaps.checklistManagement===true?`<button class="icon-btn" data-edit-doc-rule="${esc(r.ID_REGRA)}">Editar</button>`:""}</td></tr>`).join("")||'<tr><td colspan="8" class="empty">Nenhuma regra cadastrada.</td></tr>'}
    </tbody></table></div>
    ${loaded.source==="fallback"?'<div class="notice">A interface da Gestão já está integrada à mesma regra usada pela Secretaria e pelo Panfleto. A API publicada ainda não expõe edição central das regras; por isso esta versão usa a camada de compatibilidade sem interromper o funcionamento.</div>':""}
  `;

  function preview(){
    var tipo=$("#docPreviewType").value,serie=$("#docPreviewSeries").value;
    var docs=gfChecklistRowsForProfile(rows,year,serie,tipo,"secretaria");
    $("#docPreviewArea").innerHTML="<div class='doc-preview-list'>"+docs.map(function(d){return "<div><i>✓</i><span><b>"+esc(d.DOCUMENTO||"")+"</b><small>"+esc([d.CONDICAO,d.PRAZO].filter(Boolean).join(" • "))+"</small></span></div>"}).join("")+"</div>";
  }
  $("#docPreviewType").onchange=preview;$("#docPreviewSeries").onchange=preview;preview();
  $("#openDocFlyer").onclick=function(){state.flyerYear=year;state.flyerSeries=$("#docPreviewSeries").value;state.flyerStudentType=$("#docPreviewType").value;navigate("panfletos")};
  $("#refreshDocRules").onclick=function(){clearApiCache();if(state.docRulesCache)delete state.docRulesCache[year];renderDocumentacaoGestao()};
  $("#docRulesYear").onchange=function(){state.docRulesYear=Number(this.value);renderDocumentacaoGestao()};
  if($("#newDocRule"))$("#newDocRule").onclick=function(){openDocRuleForm(null,year)};
  $$("[data-edit-doc-rule]").forEach(function(btn){btn.onclick=function(){openDocRuleForm(rows.find(r=>String(r.ID_REGRA)===String(btn.dataset.editDocRule))||null,year)}});
}
function openDocRuleForm(rule,year){
  rule=rule||{};
  modal(`<div class="modal-head"><h3>${rule.ID_REGRA?"Editar requisito":"Novo requisito"}</h3><button class="icon-btn" data-close>✕</button></div><div class="modal-body"><form id="docRuleForm" class="form-grid">
    <div class="field span-3"><label>Documento *</label><input name="DOCUMENTO" value="${esc(rule.DOCUMENTO||"")}" required></div>
    <div class="field"><label>Tipo de matrícula</label><select name="TIPO_MATRICULA"><option ${rule.TIPO_MATRICULA==="Todos"?"selected":""}>Todos</option><option ${rule.TIPO_MATRICULA==="Novato"?"selected":""}>Novato</option><option ${rule.TIPO_MATRICULA==="Veterano"?"selected":""}>Veterano</option></select></div>
    <div class="field"><label>Público</label><select name="PUBLICO"><option ${rule.PUBLICO==="Matrícula"?"selected":""}>Matrícula</option><option ${rule.PUBLICO==="Aluno"?"selected":""}>Aluno</option><option ${rule.PUBLICO==="Responsável financeiro"?"selected":""}>Responsável financeiro</option></select></div>
    <div class="field"><label>Série aplicável</label><input name="SERIE_APLICAVEL" value="${esc(rule.SERIE_APLICAVEL||"Todos")}"></div>
    <div class="field"><label>Obrigatório</label><select name="OBRIGATORIO"><option ${rule.OBRIGATORIO==="Sim"?"selected":""}>Sim</option><option ${rule.OBRIGATORIO==="Condicional"?"selected":""}>Condicional</option><option ${rule.OBRIGATORIO==="Não"?"selected":""}>Não</option></select></div>
    <div class="field span-2"><label>Condição</label><input name="CONDICAO" value="${esc(rule.CONDICAO||"")}"></div>
    <div class="field"><label>Prazo</label><input name="PRAZO" value="${esc(rule.PRAZO||"")}"></div>
    <div class="field"><label>Secretaria</label><select name="PUBLICADO_SECRETARIA"><option ${rule.PUBLICADO_SECRETARIA!=="Não"?"selected":""}>Sim</option><option ${rule.PUBLICADO_SECRETARIA==="Não"?"selected":""}>Não</option></select></div>
    <div class="field"><label>Panfleto</label><select name="PUBLICADO_PANFLETO"><option ${rule.PUBLICADO_PANFLETO!=="Não"?"selected":""}>Sim</option><option ${rule.PUBLICADO_PANFLETO==="Não"?"selected":""}>Não</option></select></div>
    <div class="field"><label>Ativo</label><select name="ATIVO"><option ${rule.ATIVO!=="Não"?"selected":""}>Sim</option><option ${rule.ATIVO==="Não"?"selected":""}>Não</option></select></div>
  </form></div><div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="saveDocRule">Salvar e sincronizar</button></div>`);
  $$("[data-close]").forEach(x=>x.onclick=closeModal);
  $("#saveDocRule").onclick=async function(){
    var btn=this,data=Object.fromEntries(new FormData($("#docRuleForm")).entries());data.ANO_LETIVO=year;
    btn.disabled=true;btn.textContent="Salvando…";
    try{
      await api("salvarRegraDocumento",{token:state.adminToken,id:rule.ID_REGRA||"",data:data});
      clearApiCache();closeModal();showToast("Regra documental sincronizada ✓","ok");await renderDocumentacaoGestao();
    }catch(e){showToast(e.message||"Não foi possível salvar a regra.","error");btn.disabled=false;btn.textContent="Salvar e sincronizar"}
  };
}

function prodAdjustmentPct(p){
  const raw=p&&p["REAJUSTE_%"];
  const direct=Number(raw);
  if(String(raw??"").trim()!==""&&Number.isFinite(direct))return direct;
  const origin=Number(p&&p.VALOR_ORIGEM||0),current=Number(p&&p.VALOR_BASE||0);
  return origin&&current?((current/origin)-1)*100:null;
}
function prodAdjustmentBadge(p){
  const v=prodAdjustmentPct(p);
  if(v===null||!Number.isFinite(v))return "<span class='adjustment-badge flat'>Base</span>";
  const cls=v>0?"up":v<0?"down":"flat";
  return "<span class='adjustment-badge "+cls+"'>"+(v>0?"+":"")+v.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+"%</span>";
}
function prodMetricsHtml(rows,year){
  const active=(rows||[]).filter(p=>String(p.ATIVO||"Sim")!=="Não");
  const avg=arr=>{const v=arr.map(Number).filter(x=>Number.isFinite(x)&&x>0);return v.length?v.reduce((a,b)=>a+b,0)/v.length:0};
  const monthly=active.filter(p=>p.CATEGORIA==="Mensalidade"&&[11,12].includes(Number(p.QTD_PARCELAS||0))).map(p=>Number(p.VALOR_PARCELA||p.VALOR_BASE||0));
  const annual=active.filter(p=>p.CATEGORIA==="Mensalidade"&&String(p.SUBCATEGORIA||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().includes("anuidade")).map(p=>Number(p.VALOR_BASE||0));
  const adjusted=active.map(prodAdjustmentPct).filter(v=>v!==null&&Number.isFinite(v));
  const avgAdj=adjusted.length?adjusted.reduce((a,b)=>a+b,0)/adjusted.length:null;
  return "<div class='catalog-kpis'>"+
    "<div><small>TICKET MÉDIO MENSAL</small><b>"+money(avg(monthly))+"</b><span>mensalidades 11x e 12x • "+year+"</span></div>"+
    "<div><small>ANUIDADE MÉDIA</small><b>"+money(avg(annual))+"</b><span>mensalidades regulares</span></div>"+
    "<div><small>PRODUTOS REAJUSTADOS</small><b>"+adjusted.length+"</b><span>de "+active.length+" produtos ativos</span></div>"+
    "<div><small>REAJUSTE MÉDIO</small><b>"+(avgAdj===null?"—":((avgAdj>0?"+":"")+avgAdj.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+"%"))+"</b><span>sobre o valor de origem</span></div>"+
  "</div>";
}

const GF_GESTAO_SERIES=["Infantil 2","Infantil 3","Infantil 4","Infantil 5","1º Ano","2º Ano","3º Ano","4º Ano","5º Ano","6º Ano","7º Ano","8º Ano","9º Ano","1º EM","2º EM","3º EM"];
function prodNorm(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}
function prodInferYear(p){return Number(p&&p.ANO_LETIVO)||Number((String(p&&p.ID_PRODUTO||"")+" "+String(p&&p.PRODUTO||"")).match(/20\d{2}/)?.[0])||0}
function prodSeriesNumber(serie){
  const s=prodNorm(serie),m=s.match(/\b([1-9])\s*(?:º|o)?\s*ano\b/);return m?Number(m[1]):0;
}
function prodAppliesToSeries(p,serie){
  const s=prodNorm(serie),a=prodNorm(p&&p["SEGMENTO_SÉRIE"]||""),txt=prodNorm([p&&p.PRODUTO,p&&p["DESCRIÇÃO"],p&&p.SUBCATEGORIA].filter(Boolean).join(" ")),n=prodSeriesNumber(serie);
  if(!s)return true;
  if(!a||a.includes("todos"))return true;
  if(s.includes("infantil")){
    const target=(s.match(/infantil\s*([2-5])/)||[])[1];
    const specific=(txt.match(/infantil\s*([2-5])/)||[])[1];
    if(specific)return specific===target;
    return a.includes("infantil");
  }
  if(s.includes(" ano")){
    const specific=(txt.match(/\b([1-9])\s*(?:º|o)?\s*ano\b/)||[])[1];
    if(specific&&!/\b[1-9]\s*(?:º|o)?\s*(?:ao|a)\s*[1-9]/.test(txt))return Number(specific)===n;
    if(n>=1&&n<=5)return a.includes("1º ao 5º")||a.includes("1o ao 5o")||a.includes("anos iniciais")||a.includes(prodNorm(serie));
    if(n>=6&&n<=9)return a.includes("6º ao 9º")||a.includes("6o ao 9o")||a.includes("anos finais")||a.includes(prodNorm(serie));
  }
  if(s.includes(" em")){
    const target=(s.match(/\b([1-3])\s*(?:º|o)?\s*em\b/)||[])[1];
    const specific=(txt.match(/\b([1-3])\s*(?:º|o)?\s*(?:em|ensino medio)\b/)||[])[1];
    if(specific)return specific===target;
    return a.includes("medio")||a.includes("ensino medio")||a.includes(s);
  }
  return a.includes(s);
}
function prodSeriesWizardRows(list,year,serie){
  return (list||[]).filter(p=>prodInferYear(p)===Number(year)&&String(p.ATIVO||"Sim")!=="Não"&&prodAppliesToSeries(p,serie))
    .sort((a,b)=>Number(a.ORDEM_EXIBICAO||100)-Number(b.ORDEM_EXIBICAO||100)||String(a.CATEGORIA||"").localeCompare(String(b.CATEGORIA||""),"pt-BR")||String(a.PRODUTO||"").localeCompare(String(b.PRODUTO||""),"pt-BR",{numeric:true}));
}
function prodPreviewValue(v,pct){return Math.round((Number(v||0)*(1+Number(pct||0)/100)+Number.EPSILON)*100)/100}
function prodWizardMoneyBlock(p,pct){
  const base=Number(p.VALOR_BASE||0),parcel=Number(p.VALOR_PARCELA||0),after=Number(p["VALOR_PÓS_VENCIMENTO"]||0);
  const current="<b>"+money(base)+"</b>"+(parcel&&Math.abs(parcel-base)>.009?"<small>Parcela: "+money(parcel)+"</small>":"")+(after?"<small>Pós-venc.: "+money(after)+"</small>":"");
  const next="<b>"+money(prodPreviewValue(base,pct))+"</b>"+(parcel&&Math.abs(parcel-base)>.009?"<small>Parcela: "+money(prodPreviewValue(parcel,pct))+"</small>":"")+(after?"<small>Pós-venc.: "+money(prodPreviewValue(after,pct))+"</small>":"");
  return {current,next};
}
function prodIsAnnualTuition(p){
  return p&&p.CATEGORIA==="Mensalidade"&&(prodNorm(p.SUBCATEGORIA).includes("anuidade")||prodNorm(p.PRODUTO).includes("anuidade"));
}
function prodIsFirstTuition(p){
  const t=prodNorm([p&&p.SUBCATEGORIA,p&&p.PRODUTO].filter(Boolean).join(" "));
  return p&&p.CATEGORIA==="Mensalidade"&&(t.includes("1ª parcela")||t.includes("1a parcela")||t.includes("primeira parcela"));
}
function prodIsRegularTuitionPlan(p,n){
  if(!p||p.CATEGORIA!=="Mensalidade"||Number(p.QTD_PARCELAS)!==Number(n))return false;
  return !prodIsAnnualTuition(p)&&!prodIsFirstTuition(p);
}
function prodTuitionBundle(list,year,serie){
  const rows=prodSeriesWizardRows(list,year,serie);
  const annual=rows.find(prodIsAnnualTuition)||null;
  const first=rows.find(prodIsFirstTuition)||null;
  const p12=rows.find(p=>prodIsRegularTuitionPlan(p,12))||null;
  const p11=rows.find(p=>prodIsRegularTuitionPlan(p,11))||null;
  return {annual,first,p12,p11};
}
function prodTuitionPlanCalc(bundle,annualPct,targetAnnual,targetAnnualPost){
  const annualBase=Number(bundle&&bundle.annual&&bundle.annual.VALOR_BASE||0);
  const annualPostBase=Number(bundle&&bundle.annual&&bundle.annual["VALOR_PÓS_VENCIMENTO"]||0);
  const annual=Number(targetAnnual||0)>0?Number(targetAnnual):prodPreviewValue(annualBase,annualPct);
  const annualPost=Number(targetAnnualPost||0)>0?Number(targetAnnualPost):prodPreviewValue(annualPostBase,annualPct);
  const model=gfTuitionModelFromAnnual(annual,annualPost);
  return {
    annualBase,annualPostBase,annual,annualPost,
    first:model.firstBase,
    p12:model.plan12,p12Post:model.plan12Post,
    p11:model.plan11,p11Post:model.plan11Post
  };
}
function prodIsTuitionCore(p){
  return prodIsAnnualTuition(p)||prodIsFirstTuition(p)||prodIsRegularTuitionPlan(p,11)||prodIsRegularTuitionPlan(p,12);
}
function prodTargetMatch(list,source,targetYear,preferredId){
  if(!source)return null;
  const sid=String(source.ID_PRODUTO||""),sourceYear=prodInferYear(source),year=Number(targetYear);
  const generatedId=sid?(sourceYear&&sid.includes(String(sourceYear))?sid.replace(String(sourceYear),String(year)):sid+"-"+year):"";
  const destId=String(preferredId||generatedId||"");
  const expectedName=sourceYear?String(source.PRODUTO||"").replace(String(sourceYear),String(year)):String(source.PRODUTO||"");
  return (list||[]).find(p=>prodInferYear(p)===year&&(
    (destId&&String(p.ID_PRODUTO||"")===destId)||
    (
      String(p.PRODUTO||"")===expectedName&&
      String(p.CATEGORIA||"")===String(source.CATEGORIA||"")&&
      String(p["SEGMENTO_SÉRIE"]||"")===String(source["SEGMENTO_SÉRIE"]||"")&&
      String(p.SUBCATEGORIA||"")===String(source.SUBCATEGORIA||"")&&
      Number(p.QTD_PARCELAS||0)===Number(source.QTD_PARCELAS||0)
    )
  ))||null;
}
function prodExistingAdjustment(source,target){
  const a=Number(source&&source.VALOR_BASE||0),b=Number(target&&target.VALOR_BASE||0);
  return a&&b?Math.round((((b/a)-1)*100+Number.EPSILON)*100)/100:0;
}



function campaignFirstProducts(list,year){
  return (list||[]).filter(function(p){
    var t=String(p.SUBCATEGORIA||"")+" "+String(p.PRODUTO||"");t=t.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    return Number(prodInferYear(p))===Number(year)&&p.CATEGORIA==="Mensalidade"&&String(p.ATIVO||"Sim")!=="Não"&&(t.indexOf("1ª parcela")>=0||t.indexOf("1a parcela")>=0||t.indexOf("primeira parcela")>=0);
  });
}
function campaignForSegment(list,year,segment){
  return (list||[]).find(function(p){
    if(!gfIsCampaignProduct(p)||Number(prodInferYear(p))!==Number(year))return false;
    if(!segment)return true;
    if(typeof gfApplies==="function")return gfApplies(p,segment);
    return prodNorm(p["SEGMENTO_SÉRIE"])===prodNorm(segment);
  })||null;
}
function campaignTitle(segment){
  var s=String(segment||"").toLowerCase();
  if(s.indexOf("infantil")>=0)return "Educação Infantil";
  if(s.indexOf("1º ao 5º")>=0||s.indexOf("1o ao 5o")>=0)return "Anos Iniciais";
  if(s.indexOf("6º ao 9º")>=0||s.indexOf("6o ao 9o")>=0)return "Anos Finais";
  return segment||"Segmento";
}
function campaignCardHtml(first,campaign,year,i,list){
  var segment=first&&first["SEGMENTO_SÉRIE"]||"",base=gfCampaignBaseAmount(list||[],year,segment)||Number(first&&first.VALOR_BASE||0),m=campaign?gfCampaignMeta(campaign):{name:"Campanha Matrículas "+year,discount:30,cardInstallments:3,paymentMethod:"Cartão",studentType:"Todos",start:"",end:"",showFlyer:true,autoApply:true,noInterest:true,note:""},calcCampaign=campaign||{VALOR_BASE:m.discount,QTD_PARCELAS:m.cardInstallments,OBSERVACAO_INTERNA:JSON.stringify(m)},final=gfCampaignResult(base,calcCampaign).final,active=!campaign||String(campaign.ATIVO||"Sim")!=="Não";
  var opts=Array.from({length:12},function(_,i){return i+1}).map(function(n){return '<option value="'+n+'" '+(Number(m.cardInstallments)===n?"selected":"")+'>'+n+'x</option>'}).join("");
  var pay=["Cartão","Pix","Cartão ou Pix","Qualquer forma"].map(function(v){return '<option '+(m.paymentMethod===v?"selected":"")+'>'+v+'</option>'}).join("");
  var pub=["Todos","Novato","Veterano"].map(function(v){return '<option '+(m.studentType===v?"selected":"")+'>'+v+'</option>'}).join("");
  return '<article class="campaign-segment-card" data-campaign-card="'+i+'" data-campaign-id="'+esc(campaign&&campaign.ID_PRODUTO||"")+'" data-segment="'+esc(first["SEGMENTO_SÉRIE"]||"")+'" data-first-base="'+base+'">'+
    '<div class="campaign-card-head"><div><small>SEGMENTO</small><h4>'+esc(campaignTitle(first["SEGMENTO_SÉRIE"]))+'</h4><span>'+esc(first["SEGMENTO_SÉRIE"]||"")+'</span></div><span class="campaign-status '+(active?"on":"off")+'">'+(active?"ATIVA":"INATIVA")+'</span></div>'+
    '<div class="campaign-price-preview"><div><small>BASE • ANUIDADE APÓS ÷ 13</small><b>'+money(base)+'</b></div><div class="discount"><small>1ª PARCELA COM CAMPANHA</small><b data-campaign-final>'+money(final)+'</b><span data-campaign-saving>'+m.discount+'% de desconto</span></div></div>'+
    '<div class="campaign-fields"><div class="field span-2"><label>Nome da campanha</label><input data-campaign-field="name" value="'+esc(m.name)+'"></div>'+
    '<div class="field"><label>Desconto na 1ª parcela (%)</label><input data-campaign-field="discount" type="number" min="0" max="100" step="0.0001" value="'+esc(Math.round(Number(m.discount||0)*10000)/10000)+'"></div>'+
    '<div class="field"><label>Parcelamento máximo da 1ª parcela</label><select data-campaign-field="cardInstallments">'+opts+'</select></div>'+
    '<div class="field"><label>Forma de pagamento</label><select data-campaign-field="paymentMethod">'+pay+'</select></div>'+
    '<div class="field"><label>Público</label><select data-campaign-field="studentType">'+pub+'</select></div>'+
    '<div class="field"><label>Início</label><input data-campaign-field="start" type="date" value="'+esc(m.start||"")+'"></div>'+
    '<div class="field"><label>Fim</label><input data-campaign-field="end" type="date" value="'+esc(m.end||"")+'"></div>'+
    '<label class="campaign-check"><input data-campaign-field="active" type="checkbox" '+(active?"checked":"")+'><span>Ativa</span></label>'+
    '<label class="campaign-check"><input data-campaign-field="showFlyer" type="checkbox" '+(m.showFlyer!==false?"checked":"")+'><span>Exibir no panfleto</span></label>'+
    '<label class="campaign-check"><input data-campaign-field="autoApply" type="checkbox" '+(m.autoApply!==false?"checked":"")+'><span>Aplicar automaticamente</span></label>'+
    '<label class="campaign-check"><input data-campaign-field="noInterest" type="checkbox" '+(m.noInterest!==false?"checked":"")+'><span>Sem juros</span></label>'+
    '<div class="field span-2"><label>Observação pública</label><input data-campaign-field="note" value="'+esc(m.note||"")+'"></div></div>'+
    '<div class="campaign-card-foot"><span data-campaign-condition>'+esc(gfCampaignConditionText(campaign||{VALOR_BASE:m.discount,QTD_PARCELAS:m.cardInstallments,OBSERVACAO_INTERNA:JSON.stringify(m)}))+'</span><button class="btn btn-primary btn-sm" data-save-campaign>Salvar segmento</button></div></article>';
}
function campaignCardData(card,year){
  var g=function(k){return card.querySelector('[data-campaign-field="'+k+'"]')},base=Number(card.dataset.firstBase||0);
  var meta={name:g("name").value.trim()||("Campanha Matrículas "+year),discount:Math.max(0,Math.min(100,Number(g("discount").value||0))),cardInstallments:Math.max(1,Number(g("cardInstallments").value||1)),paymentMethod:g("paymentMethod").value||"Cartão",studentType:g("studentType").value||"Todos",start:g("start").value||"",end:g("end").value||"",showFlyer:g("showFlyer").checked,autoApply:g("autoApply").checked,noInterest:g("noInterest").checked,note:g("note").value.trim()};
  var final=gfCampaignResult(base,{VALOR_BASE:meta.discount,QTD_PARCELAS:meta.cardInstallments,OBSERVACAO_INTERNA:JSON.stringify(meta)}).final,note=(meta.discount?meta.discount+"% de desconto na 1ª parcela":"Sem desconto")+(meta.cardInstallments>1?" • até "+meta.cardInstallments+"x no "+meta.paymentMethod.toLowerCase()+(meta.noInterest?" sem juros":""):"");
  return {id:card.dataset.campaignId||"",segment:card.dataset.segment||"",base:base,final:final,meta:meta,payload:{ANO_LETIVO:Number(year),CATEGORIA:"Campanha",SUBCATEGORIA:"1ª Parcela",PRODUTO:meta.name,"SEGMENTO_SÉRIE":card.dataset.segment||"","DESCRIÇÃO":note,VALOR_BASE:meta.discount,"VALOR_PÓS_VENCIMENTO":0,"VALOR_CRÉDITO":0,QTD_PARCELAS:meta.cardInstallments,VALOR_PARCELA:0,VENCIMENTO_PADRÃO:meta.end||"",ATIVO:g("active").checked?"Sim":"Não","OBSERVAÇÃO":meta.note||note,TIPO_COBRANCA:"Campanha",DISPONIVEL_MATRICULA:"Não",ORDEM_EXIBICAO:1,OBSERVACAO_INTERNA:JSON.stringify(meta),PUBLICADO_ATENDIMENTO:"Sim"}};
}

async function renderProdutos(){
  const list=await api("listarProdutosGestao",{token:state.adminToken});
  const inferYear=prodInferYear;
  const years=[...new Set(list.map(inferYear).filter(Boolean))].sort((a,b)=>b-a);
  const targetDefault=years.includes(2027)?2027:(years.find(y=>y>=2027)||years[0]||2027);
  const sourceDefault=years.includes(2026)?2026:(years.find(y=>y<targetDefault)||targetDefault-1);
  const current=targetDefault;
  const flowYears=[2026,2027].filter(y=>years.includes(y));
  const targetYears=flowYears.length===2?flowYears:[...years].sort((a,b)=>b-a);
  const campaignDefaultYear=campaignFirstProducts(list,2027).length?2027:targetDefault;
  state.productYear=targetDefault;

  $("#view").innerHTML=`
    <div class="section-head"><div><h2>Valores e reajustes</h2><span class="muted">A anuidade é a fonte-mãe: dela saem automaticamente os planos 1ª + 12, 1ª + 11 e a base da campanha.</span></div><div class="toolbar">
      <button class="btn btn-soft" id="newProductService">+ Produto/serviço</button>
      <button class="btn btn-gold" id="individualAdjustment">Ajuste avançado</button>
    </div></div>

    <section class="series-adjust-wizard">
      <div class="series-adjust-head">
        <div><small>ASSISTENTE DE REAJUSTE POR SÉRIE</small><h3>2026 → 2027 • tabela oficial</h3><p><b>Regra:</b> Anuidade ÷ 13 gera o plano de 12 parcelas; Anuidade ÷ 12 gera o plano de 11 parcelas. A 1ª parcela usa a Anuidade após vencimento ÷ 13 e recebe o desconto da campanha.</p></div>
        <div class="series-sync-icons"><span>✓ Atendimento</span><span>✓ Secretaria</span><span>✓ Panfletos</span><span>✓ Matrícula</span></div>
      </div>
      <div class="series-adjust-controls plan-aware">
        <div class="field"><label>Série</label><select id="seriesAdjSeries" class="search">${GF_GESTAO_SERIES.map(s=>`<option>${esc(s)}</option>`).join("")}</select></div>
        <div class="field"><label>Plano para conferência</label><select id="seriesAdjPlan" class="search"><option value="12">Plano A • 1ª + 12x</option><option value="11">Plano B • 1ª + 11x</option></select></div>
        <div class="field"><label>Ano anterior • origem</label><select id="seriesAdjSource" class="search">${targetYears.map(y=>`<option value="${y}" ${y===sourceDefault?"selected":""}>${y}</option>`).join("")}</select></div>
        <div class="field"><label>Novo ano-base</label><select id="seriesAdjTarget" class="search">${targetYears.map(y=>`<option value="${y}" ${y===targetDefault?"selected":""}>${y}</option>`).join("")}</select></div>
        <div class="field span-2"><label>Reajuste geral (%)</label><div class="series-adj-inline"><input id="seriesAdjGlobal" type="number" step="0.01" value="0"><button class="btn btn-soft" id="applyGlobalAdj" type="button">Aplicar a todos</button></div></div>
      </div>

      <section class="tuition-plan-engine" id="tuitionPlanEngine">
        <div class="tuition-plan-head">
          <div><small>MENSALIDADE REGULAR</small><h4>Anuidade e planos vinculados</h4><span>A anuidade real (sem desconto) e a anuidade com desconto são editáveis. Os planos 12x, 11x e a 1ª parcela são recalculados automaticamente.</span></div>
          <span class="plan-formula-badge" id="planFormulaBadge">Anuidade = fonte-mãe</span>
        </div>
        <div id="tuitionPlanBody"></div>
      </section>

      <div class="series-adjust-note" id="seriesAdjustNote"></div>
      <div id="seriesAdjustTable"></div>
      <div class="series-adjust-footer">
        <div><b id="seriesAdjCount">0 produtos</b><span id="seriesAdjStatus">Confira os valores. A publicação atualiza o catálogo do novo ano-base e sincroniza os módulos.</span></div>
        <button class="btn btn-primary" id="publishSeriesAdjustment">Publicar novos valores e sincronizar</button>
      </div>
    </section>

    <section class="campaign-manager">
      <div class="campaign-manager-head"><div><small>POLÍTICA COMERCIAL</small><h3>Campanha da 1ª parcela</h3><p>Edite por segmento o desconto promocional, parcelamento, público e validade sem alterar o valor oficial.</p></div><div class="series-sync-icons"><span>✓ Atendimento</span><span>✓ Secretaria</span><span>✓ Panfletos</span><span>✓ Matrícula</span></div></div>
      <div class="campaign-toolbar"><div class="field"><label>Ano da campanha</label><select id="campaignYear" class="search">${targetYears.map(y=>'<option value="'+y+'" '+(y===campaignDefaultYear?'selected':'')+'>'+y+'</option>').join('')}</select></div><button class="btn btn-soft" id="campaignCopyAll" type="button">Copiar condição para todos</button><button class="btn btn-primary" id="campaignSaveAll" type="button">Salvar todas as campanhas</button></div>
      <div id="campaignCards" class="campaign-segment-grid"></div>
      <div class="campaign-manager-note"><b>Regra:</b> a campanha afeta somente a 1ª parcela. Anuidade e planos 11x/12x permanecem como valores oficiais.</div>
    </section>

    <div class="section-head catalog-after-wizard"><div><h3>Catálogo publicado</h3><span class="muted">Consulta e edição individual dos valores já existentes.</span></div><div class="toolbar">
      <select id="prodYear" class="search" style="max-width:160px">${years.map(y=>`<option value="${y}" ${y===current?"selected":""}>${y}</option>`).join("")}</select>
      <input class="search" id="prodSearch" placeholder="Buscar produto, série…">
      <button class="btn btn-soft" id="newSchoolYear">Reajuste geral por categoria</button>
    </div></div>
    <div class="card" style="margin-bottom:14px"><strong>Ano letivo: <span id="yearLabel">${current}</span></strong><br><span class="muted">O histórico permanece preservado. O ano publicado torna-se a referência para os módulos operacionais.</span></div>
    <div id="prodMetrics"></div>
    <div id="prodTable"></div>`;

  const drawCatalog=()=>{
    const q=$("#prodSearch").value.toLowerCase(),year=Number($("#prodYear").value);
    state.productYear=year;$("#yearLabel").textContent=year;
    const yearRows=list.filter(p=>inferYear(p)===year&&!gfIsCampaignProduct(p));
    const arr=yearRows.filter(p=>[p.PRODUTO,p.CATEGORIA,p["SEGMENTO_SÉRIE"]].join(" ").toLowerCase().includes(q));
    $("#prodMetrics").innerHTML=prodMetricsHtml(yearRows,year);
    $("#prodTable").innerHTML=`<div class="table-wrap"><table><thead><tr><th>ID</th><th>Ano</th><th>Produto</th><th>Série</th><th>Valor base</th><th>Pós-vencimento</th><th>Parcelas</th><th>Reajuste</th><th>Publicado</th><th>Ativo</th><th></th></tr></thead><tbody>${arr.map(p=>`<tr><td>${esc(p.ID_PRODUTO)}</td><td><strong>${esc(inferYear(p)||"")}</strong></td><td><strong>${esc(p.PRODUTO)}</strong><br><span class="muted">${esc(p.CATEGORIA||"")}</span></td><td>${esc(p["SEGMENTO_SÉRIE"]||"")}</td><td class="money">${money(p.VALOR_BASE)}</td><td class="money">${money(p["VALOR_PÓS_VENCIMENTO"])}</td><td>${esc(p.QTD_PARCELAS||"")}</td><td>${prodAdjustmentBadge(p)}</td><td>${pill(p.PUBLICADO_ATENDIMENTO||"Sim")}</td><td>${pill(p.ATIVO||"")}</td><td><button class="icon-btn" data-prod="${esc(p.ID_PRODUTO)}">Editar</button></td></tr>`).join("")||`<tr><td colspan="11" class="empty">Nenhum produto cadastrado para ${year}.</td></tr>`}</tbody></table></div>`;
    $$('[data-prod]').forEach(x=>x.onclick=()=>openProductForm(list.find(p=>p.ID_PRODUTO===x.dataset.prod)));
  };


  const drawCampaignManager=()=>{
    const year=Number($("#campaignYear")?.value||campaignDefaultYear),firsts=campaignFirstProducts(list,year),root=$("#campaignCards");if(!root)return;
    if(!firsts.length){root.innerHTML="<div class='notice warn'>Cadastre primeiro as 1ª parcelas oficiais deste ano.</div>";return}
    root.innerHTML=firsts.map(function(first,i){return campaignCardHtml(first,campaignForSegment(list,year,first["SEGMENTO_SÉRIE"]),year,i,list)}).join("");
    $$("[data-campaign-card]").forEach(function(card){
      const refresh=()=>{const d=campaignCardData(card,year),fake={VALOR_BASE:d.meta.discount,QTD_PARCELAS:d.meta.cardInstallments,OBSERVACAO_INTERNA:JSON.stringify(d.meta)};card.querySelector("[data-campaign-final]").textContent=money(d.final);card.querySelector("[data-campaign-saving]").textContent=d.meta.discount+"% de desconto";card.querySelector("[data-campaign-condition]").textContent=gfCampaignConditionText(fake)};
      card.querySelectorAll("[data-campaign-field]").forEach(function(el){el.oninput=refresh;el.onchange=refresh});
      card.querySelector("[data-save-campaign]").onclick=async function(){const d=campaignCardData(card,year),btn=this;btn.disabled=true;btn.textContent="Salvando…";try{if(d.id)await api("atualizarProduto",{token:state.adminToken,id:d.id,data:d.payload});else await api("criarProdutoServico",{token:state.adminToken,data:d.payload});clearApiCache();setNotice("Campanha de "+esc(d.segment)+" salva e sincronizada.","ok");await renderProdutos()}catch(e){showToast(e.message||"Não foi possível salvar a campanha.","error");btn.disabled=false;btn.textContent="Salvar segmento"}};
    });
  };
  const saveAllCampaigns=async()=>{const year=Number($("#campaignYear")?.value||campaignDefaultYear),cards=$("[data-campaign-card]"),btn=$("#campaignSaveAll");if(!cards.length)return;btn.disabled=true;try{for(let i=0;i<cards.length;i++){btn.textContent="Salvando "+(i+1)+"/"+cards.length+"…";const d=campaignCardData(cards[i],year);if(d.id)await api("atualizarProduto",{token:state.adminToken,id:d.id,data:d.payload});else await api("criarProdutoServico",{token:state.adminToken,data:d.payload})}clearApiCache();setNotice("Campanhas da 1ª parcela salvas e sincronizadas com Atendimento, Secretaria, Panfletos e Matrícula.","ok");await renderProdutos()}catch(e){showToast(e.message||"Não foi possível salvar todas as campanhas.","error");btn.disabled=false;btn.textContent="Salvar todas as campanhas"}};

  let wizardRows=[],tuitionBundle=null,targetAnnualProduct=null;
  const tuitionCalc=()=>prodTuitionPlanCalc(
    tuitionBundle,
    Number($("#tuitionAnnualPct")?.value||0),
    Number($("#tuitionAnnualTarget")?.value||$("#tuitionPlanBody")?.dataset.targetAnnual||0),
    Number($("#tuitionAnnualPostTarget")?.value||$("#tuitionPlanBody")?.dataset.targetAnnualPost||0)
  );

  const renderTuitionBody=()=>{
    const source=Number($("#seriesAdjSource").value),target=Number($("#seriesAdjTarget").value),planN=Number($("#seriesAdjPlan").value||12),serie=$("#seriesAdjSeries").value;
    tuitionBundle=prodTuitionBundle(list,source,serie);
    const missing=!tuitionBundle.annual||!tuitionBundle.first||!tuitionBundle.p12||!tuitionBundle.p11;
    if(missing){
      $("#tuitionPlanBody").innerHTML="<div class='notice'>O ano de origem precisa possuir Anuidade, 1ª Parcela, Plano 12x e Plano 11x para sincronizar a nova tabela.</div>";
      $("#publishSeriesAdjustment").disabled=true;
      return;
    }
    const body=$("#tuitionPlanBody"),annualPct=Number(body.dataset.annualPct||0);
    const annualDiscounted=Number(body.dataset.targetAnnual||prodPreviewValue(Number(tuitionBundle.annual.VALOR_BASE||0),annualPct));
    const annualReal=Number(body.dataset.targetAnnualPost||prodPreviewValue(Number(tuitionBundle.annual["VALOR_PÓS_VENCIMENTO"]||0),annualPct));
    const campaign=campaignForSegment(list,target,serie),campaignMeta=campaign?gfCampaignMeta(campaign):null,campaignDiscount=Number(body.dataset.campaignDiscount||campaignMeta?.discount||0);
    body.dataset.campaignDiscount=String(campaignDiscount);

    body.innerHTML=`
      <div class="tuition-source-summary">
        <div><small>ANO DE ORIGEM • ${source}</small><b>${money(tuitionBundle.annual.VALOR_BASE)}</b><span>até o vencimento</span></div>
        <div><small>ANO DE ORIGEM • ${source}</small><b>${money(tuitionBundle.annual["VALOR_PÓS_VENCIMENTO"])}</b><span>valor real / após vencimento</span></div>
        <div><small>REAJUSTE DE REFERÊNCIA</small><input id="tuitionAnnualPct" type="number" step="0.01" value="${annualPct}"><span>aplica nos dois valores</span></div>
      </div>

      <div class="tuition-master-values">
        <div class="tuition-master-card real">
          <label>ANUIDADE REAL • ${target}</label>
          <small>Sem desconto / após o vencimento</small>
          <div class="tuition-money-input"><span>R$</span><input id="tuitionAnnualPostTarget" type="number" step="0.01" min="0" value="${annualReal.toFixed(2)}"></div>
        </div>
        <div class="tuition-master-card discounted">
          <label>ANUIDADE COM DESCONTO • ${target}</label>
          <small>Pagamento até o vencimento</small>
          <div class="tuition-money-input"><span>R$</span><input id="tuitionAnnualTarget" type="number" step="0.01" min="0" value="${annualDiscounted.toFixed(2)}"></div>
        </div>
        <div class="tuition-master-card campaign">
          <label>DESCONTO DA 1ª PARCELA</label>
          <small>Campanha aplicada sobre anuidade real ÷ 13</small>
          <div class="tuition-percent-input"><input id="tuitionCampaignDiscount" type="number" step="0.01" min="0" max="100" value="${campaignDiscount}"><span>%</span></div>
        </div>
      </div>

      <div class="tuition-formula-note"><b>Regra automática:</b> anuidade com desconto ÷ 13 = 12 parcelas com desconto • anuidade real ÷ 13 = 12 parcelas sem desconto e base da 1ª parcela • ÷ 12 = plano de 11 parcelas.</div>

      <div class="tuition-official-table">
        <div class="tuition-official-head"><span>MODALIDADE</span><span>COM DESCONTO</span><span>SEM DESCONTO</span></div>
        <div class="tuition-official-row annual"><b>ANUIDADE</b><strong id="tuitionAnnualDiscountedView">—</strong><strong id="tuitionAnnualRealView">—</strong></div>
        <div class="tuition-official-row first"><b>1ª PARCELA</b><strong id="tuitionFirstPromoView">—</strong><strong id="tuitionFirstBaseView">—</strong></div>
        <div class="tuition-official-row ${planN===12?"selected":""}"><b>12 PARCELAS <small>janeiro a dezembro</small></b><strong id="tuitionPlan12DiscountedView">—</strong><strong id="tuitionPlan12RealView">—</strong></div>
        <div class="tuition-official-row ${planN===11?"selected":""}"><b>11 PARCELAS <small>fevereiro a dezembro</small></b><strong id="tuitionPlan11DiscountedView">—</strong><strong id="tuitionPlan11RealView">—</strong></div>
      </div>

      <div class="tuition-selected-plan" id="tuitionSelectedPlan"></div>
      <div class="tuition-save-bar">
        <span id="tuitionSaveStatus">Edite a anuidade real, a anuidade com desconto ou a campanha. Os demais valores são automáticos.</span>
        <button class="btn btn-primary" id="saveTuitionValues" type="button">Salvar valores desta série</button>
      </div>`;

    const syncFromPct=()=>{
      const pct=Number($("#tuitionAnnualPct").value||0);
      body.dataset.annualPct=String(pct);
      const discounted=prodPreviewValue(Number(tuitionBundle.annual.VALOR_BASE||0),pct);
      const real=prodPreviewValue(Number(tuitionBundle.annual["VALOR_PÓS_VENCIMENTO"]||0),pct);
      $("#tuitionAnnualTarget").value=discounted.toFixed(2);
      $("#tuitionAnnualPostTarget").value=real.toFixed(2);
      body.dataset.targetAnnual=String(discounted);
      body.dataset.targetAnnualPost=String(real);
      refreshPreview();
    };
    $("#tuitionAnnualPct").oninput=syncFromPct;

    ["#tuitionAnnualTarget","#tuitionAnnualPostTarget"].forEach(sel=>{$(sel).oninput=function(){
      body.dataset.targetAnnual=String(Number($("#tuitionAnnualTarget").value||0));
      body.dataset.targetAnnualPost=String(Number($("#tuitionAnnualPostTarget").value||0));
      const sourceBase=Number(tuitionBundle.annual.VALOR_BASE||0),targetBase=Number($("#tuitionAnnualTarget").value||0);
      if(sourceBase&&targetBase){
        const pct=Math.round((((targetBase/sourceBase)-1)*100+Number.EPSILON)*10000)/10000;
        $("#tuitionAnnualPct").value=String(pct);body.dataset.annualPct=String(pct);
      }
      refreshPreview();
    }});

    $("#tuitionCampaignDiscount").oninput=function(){
      body.dataset.campaignDiscount=String(Math.max(0,Math.min(100,Number(this.value||0))));
      refreshPreview();
    };

    $("#saveTuitionValues").onclick=async function(){
      const btn=this,source=Number($("#seriesAdjSource").value),target=Number($("#seriesAdjTarget").value),serie=$("#seriesAdjSeries").value;
      if(source===target){showToast("Escolha anos de origem e destino diferentes.","error");return}
      const calc=tuitionCalc(),discount=Math.max(0,Math.min(100,Number($("#tuitionCampaignDiscount").value||0)));
      if(!calc.annual||!calc.annualPost){showToast("Informe os dois valores da anuidade.","error");return}
      const tuitionUpdates=[
        {p:tuitionBundle.annual,base:calc.annual,post:calc.annualPost,parcel:0,label:"Anuidade"},
        {p:tuitionBundle.first,base:calc.first,post:calc.first,parcel:calc.first,label:"Base da 1ª parcela"},
        {p:tuitionBundle.p12,base:calc.p12,post:calc.p12Post,parcel:calc.p12,label:"Plano 1ª + 12"},
        {p:tuitionBundle.p11,base:calc.p11,post:calc.p11Post,parcel:calc.p11,label:"Plano 1ª + 11"}
      ];
      btn.disabled=true;btn.textContent="Salvando…";$("#tuitionSaveStatus").textContent="Salvando e sincronizando os módulos…";
      try{
        for(const row of tuitionUpdates){
          const result=await api("aplicarReajusteIndividual",{token:state.adminToken,data:{
            anoOrigem:source,anoDestino:target,idProduto:row.p.ID_PRODUTO,modo:"valor",valor:row.base,publicar:"Sim",
            observacao:"Tabela oficial • "+serie+" • "+row.label+" • "+source+"→"+target
          }});
          if(result&&result.id){
            await api("atualizarProduto",{token:state.adminToken,id:result.id,data:{
              VALOR_BASE:row.base,
              "VALOR_PÓS_VENCIMENTO":row.post,
              VALOR_PARCELA:row.parcel,
              PUBLICADO_ATENDIMENTO:"Sim",
              OBSERVACAO_INTERNA:"Anuidade real e com desconto editáveis; planos derivados automaticamente."
            }});
          }
        }

        const existingCampaign=campaignForSegment(list,target,serie),oldMeta=existingCampaign?gfCampaignMeta(existingCampaign):{};
        const meta={
          name:oldMeta.name||("Campanha Matrículas "+target),
          discount:discount,
          cardInstallments:Number(oldMeta.cardInstallments||3),
          paymentMethod:oldMeta.paymentMethod||"Cartão",
          studentType:oldMeta.studentType||"Todos",
          start:oldMeta.start||"",end:oldMeta.end||"",
          showFlyer:oldMeta.showFlyer!==false,autoApply:oldMeta.autoApply!==false,noInterest:oldMeta.noInterest!==false,
          note:oldMeta.note||"Desconto promocional sobre a 1ª parcela."
        };
        const campaignPayload={
          ANO_LETIVO:target,CATEGORIA:"Campanha",SUBCATEGORIA:"1ª Parcela",PRODUTO:meta.name,
          "SEGMENTO_SÉRIE":serie,"DESCRIÇÃO":discount+"% de desconto na 1ª parcela",
          VALOR_BASE:discount,"VALOR_PÓS_VENCIMENTO":0,"VALOR_CRÉDITO":0,QTD_PARCELAS:meta.cardInstallments,VALOR_PARCELA:0,
          VENCIMENTO_PADRÃO:meta.end||"",ATIVO:"Sim","OBSERVAÇÃO":meta.note,TIPO_COBRANCA:"Campanha",
          DISPONIVEL_MATRICULA:"Não",ORDEM_EXIBICAO:1,OBSERVACAO_INTERNA:JSON.stringify(meta),PUBLICADO_ATENDIMENTO:"Sim"
        };
        if(existingCampaign)await api("atualizarProduto",{token:state.adminToken,id:existingCampaign.ID_PRODUTO,data:campaignPayload});
        else await api("criarProdutoServico",{token:state.adminToken,data:campaignPayload});

        state.productYear=target;clearApiCache();
        setNotice("Valores de "+serie+" salvos. Anuidade real/com desconto, 12x, 11x e 1ª parcela foram sincronizados com Atendimento, Secretaria, Panfletos e Matrícula.","ok");
        await renderProdutos();
      }catch(e){
        showToast(e.message||"Não foi possível salvar os valores da série.","error");
        btn.disabled=false;btn.textContent="Salvar valores desta série";
        $("#tuitionSaveStatus").textContent="Falha ao salvar. Confira a conexão e tente novamente.";
      }
    };
  };

  const refreshPreview=()=>{
    if(tuitionBundle&&$("#tuitionAnnualPct")){
      const calc=tuitionCalc(),planN=Number($("#seriesAdjPlan").value||12),discount=Math.max(0,Math.min(100,Number($("#tuitionCampaignDiscount")?.value||$("#tuitionPlanBody")?.dataset.campaignDiscount||0)));
      const firstFinal=gfMoneyFloor2(calc.first*(1-discount/100));
      $("#tuitionAnnualDiscountedView").textContent=money(calc.annual);
      $("#tuitionAnnualRealView").textContent=money(calc.annualPost);
      $("#tuitionFirstPromoView").textContent=money(firstFinal);
      $("#tuitionFirstBaseView").textContent=money(calc.first);
      $("#tuitionPlan12DiscountedView").textContent=money(calc.p12);
      $("#tuitionPlan12RealView").textContent=money(calc.p12Post);
      $("#tuitionPlan11DiscountedView").textContent=money(calc.p11);
      $("#tuitionPlan11RealView").textContent=money(calc.p11Post);
      $("#planFormulaBadge").textContent="Anuidade real + anuidade com desconto";
      $("#tuitionSelectedPlan").innerHTML=planN===12
        ? "<b>Plano A • 1ª + 12:</b> 1ª promocional "+money(firstFinal)+" • depois 12x de "+money(calc.p12)+" até o vencimento ou "+money(calc.p12Post)+" após o vencimento."
        : "<b>Plano B • 1ª + 11:</b> 1ª promocional "+money(firstFinal)+" • depois 11x de "+money(calc.p11)+" até o vencimento ou "+money(calc.p11Post)+" após o vencimento.";
    }
    $$("[data-series-pct]").forEach(inp=>{
      const p=wizardRows.find(x=>String(x.ID_PRODUTO)===String(inp.dataset.seriesPct));if(!p)return;
      const pct=Number(inp.value||0),m=prodWizardMoneyBlock(p,pct),cell=$('[data-series-new="'+CSS.escape(String(p.ID_PRODUTO))+'"]');
      if(cell)cell.innerHTML=m.next;
    });
  };

  const drawWizard=()=>{
    const serie=$("#seriesAdjSeries").value,source=Number($("#seriesAdjSource").value),target=Number($("#seriesAdjTarget").value);
    tuitionBundle=prodTuitionBundle(list,source,serie);
    wizardRows=prodSeriesWizardRows(list,source,serie).filter(p=>!prodIsTuitionCore(p)&&!gfIsCampaignProduct(p));
    targetAnnualProduct=tuitionBundle&&tuitionBundle.annual?prodTargetMatch(list,tuitionBundle.annual,target):null;
    const annualPct=prodExistingAdjustment(tuitionBundle&&tuitionBundle.annual,targetAnnualProduct);
    const sourceAnnual=Number(tuitionBundle&&tuitionBundle.annual&&tuitionBundle.annual.VALOR_BASE||0),sourcePost=Number(tuitionBundle&&tuitionBundle.annual&&tuitionBundle.annual["VALOR_PÓS_VENCIMENTO"]||0);
    const targetAnnual=Number(targetAnnualProduct&&targetAnnualProduct.VALOR_BASE||0)||prodPreviewValue(sourceAnnual,annualPct);
    const targetAnnualPost=Number(targetAnnualProduct&&targetAnnualProduct["VALOR_PÓS_VENCIMENTO"]||0)||prodPreviewValue(sourcePost,annualPct);
    $("#tuitionPlanBody").dataset.annualPct=String(annualPct);
    $("#tuitionPlanBody").dataset.targetAnnual=String(targetAnnual);
    $("#tuitionPlanBody").dataset.targetAnnualPost=String(targetAnnualPost);
    $("#seriesAdjCount").textContent=(wizardRows.length+4)+" item(ns) de valor";
    $("#seriesAdjustNote").innerHTML=source===target
      ? "<b>Atenção:</b> o ano de origem e o novo ano-base precisam ser diferentes."
      : "Comparando <b>"+esc(serie)+"</b>: "+source+" → <b>"+target+"</b>. A <b>anuidade é a fonte-mãe</b>: ÷13 gera 12x e a base da 1ª parcela; ÷12 gera 11x.";
    renderTuitionBody();
    $("#publishSeriesAdjustment").disabled=!tuitionBundle||!tuitionBundle.annual||source===target;
    $("#seriesAdjustTable").innerHTML=`<div class="series-products-title"><b>Outros produtos da série</b><span>Material, fardamento, S.T.I. e demais itens continuam com reajuste individual ou geral.</span></div><div class="table-wrap series-adjust-table"><table><thead><tr><th>Produto oferecido</th><th>Valor do ano anterior</th><th>Reajuste %</th><th>Novo valor • ${target}</th><th>Integração</th></tr></thead><tbody>
      ${wizardRows.map(p=>{
        const targetProduct=prodTargetMatch(list,p,target),initialPct=prodExistingAdjustment(p,targetProduct),m=prodWizardMoneyBlock(p,initialPct);
        return `<tr><td><strong>${esc(p.PRODUTO||"")}</strong><small>${esc(p.CATEGORIA||"")} • ${esc(p["SEGMENTO_SÉRIE"]||"")}</small></td><td class="series-value-block">${m.current}</td><td><input class="series-pct-input" data-series-pct="${esc(p.ID_PRODUTO)}" type="number" step="0.01" value="${initialPct}" aria-label="Reajuste de ${esc(p.PRODUTO||"produto")}"></td><td class="series-value-block series-new-value" data-series-new="${esc(p.ID_PRODUTO)}">${m.next}</td><td><span class="series-integrated-pill">${targetProduct?"Já publicado":"Publicar"}</span></td></tr>`;
      }).join("")||'<tr><td colspan="5" class="empty">Nenhum produto adicional cadastrado para esta série.</td></tr>'}
    </tbody></table></div>`;
    $$("[data-series-pct]").forEach(inp=>inp.oninput=refreshPreview);
    refreshPreview();
  };

  $("#applyGlobalAdj").onclick=()=>{
    const v=Number($("#seriesAdjGlobal").value||0);
    if($("#tuitionAnnualPct")){
      $("#tuitionAnnualPct").value=String(v);$("#tuitionPlanBody").dataset.annualPct=String(v);
      const main=prodPreviewValue(Number(tuitionBundle&&tuitionBundle.annual&&tuitionBundle.annual.VALOR_BASE||0),v);
      const post=prodPreviewValue(Number(tuitionBundle&&tuitionBundle.annual&&tuitionBundle.annual["VALOR_PÓS_VENCIMENTO"]||0),v);
      $("#tuitionAnnualTarget").value=main.toFixed(2);$("#tuitionAnnualPostTarget").value=post.toFixed(2);
      $("#tuitionPlanBody").dataset.targetAnnual=String(main);$("#tuitionPlanBody").dataset.targetAnnualPost=String(post);
    }
    $$("[data-series-pct]").forEach(inp=>inp.value=String(v));
    refreshPreview();
  };

  $("#seriesAdjSeries").onchange=drawWizard;
  $("#seriesAdjSource").onchange=drawWizard;
  $("#seriesAdjTarget").onchange=drawWizard;
  $("#seriesAdjPlan").onchange=()=>{renderTuitionBody();refreshPreview()};

  $("#publishSeriesAdjustment").onclick=async()=>{
    const source=Number($("#seriesAdjSource").value),target=Number($("#seriesAdjTarget").value),serie=$("#seriesAdjSeries").value;
    if(source===target||!tuitionBundle||!tuitionBundle.annual||!tuitionBundle.first||!tuitionBundle.p12||!tuitionBundle.p11)return;
    const calc=tuitionCalc();
    const tuitionUpdates=[
      {p:tuitionBundle.annual,base:calc.annual,post:calc.annualPost,parcel:0,label:"Anuidade"},
      {p:tuitionBundle.first,base:calc.first,post:calc.first,parcel:calc.first,label:"Base da 1ª parcela"},
      {p:tuitionBundle.p12,base:calc.p12,post:calc.p12Post,parcel:calc.p12,label:"Plano 1ª + 12"},
      {p:tuitionBundle.p11,base:calc.p11,post:calc.p11Post,parcel:calc.p11,label:"Plano 1ª + 11"}
    ];
    const extras=wizardRows.map(p=>({p,pct:Number($('[data-series-pct="'+CSS.escape(String(p.ID_PRODUTO))+'"]')?.value||0)}));
    const total=tuitionUpdates.length+extras.length,btn=$("#publishSeriesAdjustment");btn.disabled=true;
    try{
      let done=0;
      for(const row of tuitionUpdates){
        btn.textContent="Sincronizando "+(++done)+" de "+total+"…";
        const result=await api("aplicarReajusteIndividual",{token:state.adminToken,data:{
          anoOrigem:source,anoDestino:target,idProduto:row.p.ID_PRODUTO,modo:"valor",valor:row.base,publicar:"Sim",
          observacao:"Tabela derivada da anuidade • "+serie+" • "+row.label+" • "+source+"→"+target
        }});
        if(result&&result.id){
          await api("atualizarProduto",{token:state.adminToken,id:result.id,data:{
            VALOR_BASE:row.base,
            "VALOR_PÓS_VENCIMENTO":row.post,
            VALOR_PARCELA:row.parcel,
            PUBLICADO_ATENDIMENTO:"Sim",
            OBSERVACAO_INTERNA:"Regra automática: anuidade ÷ 13 para plano 12x e 1ª parcela; anuidade ÷ 12 para plano 11x."
          }});
        }
      }
      for(const row of extras){
        btn.textContent="Sincronizando "+(++done)+" de "+total+"…";
        await api("aplicarReajusteIndividual",{token:state.adminToken,data:{
          anoOrigem:source,anoDestino:target,idProduto:row.p.ID_PRODUTO,modo:"percentual",valor:row.pct,publicar:"Sim",
          observacao:"Reajuste por série • "+serie+" • "+source+"→"+target
        }});
      }
      state.productYear=target;clearApiCache();
      setNotice("Tabela "+target+" sincronizada para "+serie+": anuidade → 12x/11x → base da 1ª parcela → campanha. Atendimento, Secretaria, Panfletos e Matrícula usam a mesma regra.","ok");
      await renderProdutos();
    }catch(e){
      showToast(e.message||"Não foi possível concluir a sincronização da série.","error");
      btn.disabled=false;btn.textContent="Publicar novos valores e sincronizar";
    }
  };

  $("#prodSearch").oninput=drawCatalog;$("#prodYear").onchange=drawCatalog;
  $("#newSchoolYear").onclick=()=>openSchoolYearForm(targetYears,list);
  $("#individualAdjustment").onclick=()=>openIndividualAdjustment(list,targetYears);
  $("#newProductService").onclick=()=>openNewProductService();
  $("#campaignYear").onchange=drawCampaignManager;
  $("#campaignSaveAll").onclick=saveAllCampaigns;
  $("#campaignCopyAll").onclick=()=>{const cards=$$("[data-campaign-card]");if(cards.length<2)return;const src=campaignCardData(cards[0],Number($("#campaignYear").value)).meta;cards.slice(1).forEach(function(card){["name","discount","cardInstallments","paymentMethod","studentType","start","end","note"].forEach(function(k){const el=card.querySelector('[data-campaign-field="'+k+'"]');if(el)el.value=src[k]??""});["showFlyer","autoApply","noInterest"].forEach(function(k){const el=card.querySelector('[data-campaign-field="'+k+'"]');if(el)el.checked=!!src[k]});card.querySelector('[data-campaign-field="active"]').checked=cards[0].querySelector('[data-campaign-field="active"]').checked;card.querySelector('[data-campaign-field="discount"]').dispatchEvent(new Event("input"))});showToast("Condição copiada. Confira e salve todas as campanhas.","ok")};
  drawCampaignManager();drawWizard();drawCatalog();
}
function openSchoolYearForm(years,list){
  const origem=years.includes(2026)?2026:Number(state.productYear||years[0]||2026),destino=years.includes(2027)?2027:origem+1;
  const categories=[...new Set((list||[]).filter(p=>prodInferYear(p)===origem&&String(p.ATIVO||"Sim")!=="Não"&&!gfIsCampaignProduct(p)&&!prodIsTuitionCore(p)).map(p=>String(p.CATEGORIA||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  modal(`<div class="modal-head"><h3>Reajuste em lote</h3><button class="icon-btn" data-close>✕</button></div>
  <div class="modal-body"><div class="notice">O reajuste será salvo produto por produto para evitar timeout do Apps Script. Se houver oscilação de conexão, a plataforma confere o que já foi gravado antes de continuar.</div>
  <form id="yearForm" class="form-grid">
    <div class="field"><label>Ano de origem</label><select name="anoOrigem">${years.map(y=>`<option value="${y}" ${y===origem?"selected":""}>${y}</option>`).join("")}</select></div>
    <div class="field"><label>Ano de destino</label><input type="number" name="anoDestino" value="${destino}" min="2026" max="2100" required></div>
    <div class="field"><label>Reajuste (%)</label><input type="number" step="0.01" name="percentual" value="8" required></div>
    <div class="field"><label>Categoria</label><select name="categoria"><option value="">Todas</option>${categories.map(x=>`<option>${esc(x)}</option>`).join("")}</select></div>
    <div class="field"><label>Publicar no Atendimento, Panfleto e Secretaria</label><select name="publicar"><option>Sim</option><option>Não</option></select></div>
    <div class="field span-3"><label>Regra</label><span class="muted">Mensalidades regulares não entram neste lote: elas são geradas pela anuidade no assistente 2026 → 2027. Aqui ficam material, fardamento, S.T.I. e demais produtos.</span></div>
  </form>
  <div id="bulkProgress" class="bulk-progress" hidden><div class="bulk-progress-bar"><i id="bulkProgressFill"></i></div><b id="bulkProgressTitle">Preparando…</b><span id="bulkProgressDetail"></span></div></div>
  <div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="createYear">Aplicar reajuste</button></div>`);
  $$("[data-close]").forEach(x=>x.onclick=closeModal);

  const findVerifiedTarget=(rows,source,targetYear,expected,preferredId)=>{
    const target=prodTargetMatch(rows,source,targetYear,preferredId);
    if(!target)return null;
    const actual=Number(target.VALOR_BASE||0);
    return Math.abs(actual-expected)<=0.02?target:null;
  };
  const bulkWait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  $("#createYear").onclick=async()=>{
    const form=$("#yearForm"),data=Object.fromEntries(new FormData(form).entries()),btn=$("#createYear");
    const sourceYear=Number(data.anoOrigem),targetYear=Number(data.anoDestino),pct=Number(data.percentual||0),category=String(data.categoria||"").trim();
    if(!sourceYear||!targetYear||sourceYear===targetYear){showToast("Ano de origem e destino precisam ser diferentes.","error");return}
    const sourceRows=(list||[]).filter(p=>prodInferYear(p)===sourceYear&&String(p.ATIVO||"Sim")!=="Não"&&!gfIsCampaignProduct(p)&&!prodIsTuitionCore(p)&&(!category||String(p.CATEGORIA||"")===category));
    if(!sourceRows.length){showToast("Nenhum produto ativo encontrado para o filtro escolhido.","error");return}

    btn.disabled=true;form.querySelectorAll("input,select").forEach(el=>el.disabled=true);
    $("#bulkProgress").hidden=false;
    const fill=$("#bulkProgressFill"),title=$("#bulkProgressTitle"),detail=$("#bulkProgressDetail");
    let saved=0,verifiedAfterError=0,failed=[],baseline=[],targetIds=new Map();
    try{clearApiCache();baseline=await api("listarProdutosGestao",{token:state.adminToken})}catch(e){}
    const pendingRows=sourceRows.filter(p=>!findVerifiedTarget(baseline,p,targetYear,prodPreviewValue(Number(p.VALOR_BASE||0),pct)));
    if(!pendingRows.length){
      state.productYear=targetYear;closeModal();
      setNotice("Os "+sourceRows.length+" produto(s) já estavam gravados corretamente no catálogo "+targetYear+". Nenhuma duplicação foi criada.","ok");
      await renderProdutos();return;
    }

    for(let i=0;i<pendingRows.length;i++){
      const p=pendingRows[i],expected=prodPreviewValue(Number(p.VALOR_BASE||0),pct);
      const label=String(p.PRODUTO||p.ID_PRODUTO||"Produto");
      const progress=Math.round((i/pendingRows.length)*100);
      fill.style.width=progress+"%";
      title.textContent="Salvando "+(i+1)+" de "+pendingRows.length+"…";
      detail.textContent=label;
      btn.textContent="Aplicando "+(i+1)+"/"+pendingRows.length+"…";
      try{
        const result=await api("aplicarReajusteIndividual",{token:state.adminToken,data:{
          anoOrigem:sourceYear,anoDestino:targetYear,idProduto:p.ID_PRODUTO,modo:"percentual",valor:pct,publicar:data.publicar||"Sim",
          observacao:"Reajuste em lote seguro • "+(category||"Todas as categorias")+" • "+sourceYear+"→"+targetYear
        }});
        if(result&&result.id)targetIds.set(String(p.ID_PRODUTO||""),String(result.id));
        saved++;
      }catch(err){
        // Em erro de comunicação, o Apps Script pode ter concluído a gravação.
        // Confere o catálogo antes de repetir ou declarar falha.
        try{
          clearApiCache();
          const fresh=await api("listarProdutosGestao",{token:state.adminToken});
          if(findVerifiedTarget(fresh,p,targetYear,expected)){saved++;verifiedAfterError++;continue}
        }catch(_verifyErr){}
        failed.push({id:String(p.ID_PRODUTO||""),produto:label,error:String(err&&err.message||err)});
      }
    }

    fill.style.width="100%";
    let fresh=[],confirmedRows=[];
    for(let attempt=0;attempt<3;attempt++){
      clearApiCache();
      try{fresh=await api("listarProdutosGestao",{token:state.adminToken})}catch(e){fresh=[]}
      confirmedRows=sourceRows.filter(p=>findVerifiedTarget(
        fresh,p,targetYear,prodPreviewValue(Number(p.VALOR_BASE||0),pct),targetIds.get(String(p.ID_PRODUTO||""))
      ));
      if(confirmedRows.length===sourceRows.length)break;
      if(attempt<2)await bulkWait(500*(attempt+1));
    }
    const confirmed=confirmedRows.length;
    const confirmedSourceIds=new Set(confirmedRows.map(p=>String(p.ID_PRODUTO||"")));
    const unresolvedRows=sourceRows.filter(p=>!confirmedSourceIds.has(String(p.ID_PRODUTO||"")));
    const failedIds=new Set(failed.map(x=>String(x.id||"")));
    const hardFailed=unresolvedRows.filter(p=>failedIds.has(String(p.ID_PRODUTO||""))).length;
    const awaitingConfirmation=Math.max(0,unresolvedRows.length-hardFailed);

    if(confirmed===sourceRows.length){
      state.productYear=targetYear;
      closeModal();
      setNotice("Reajuste concluído: "+confirmed+" de "+sourceRows.length+" produto(s) confirmados no catálogo "+targetYear+". Os novos valores estão disponíveis para os módulos integrados.","ok");
      await renderProdutos();
      return;
    }

    title.textContent="Concluído com pendências";
    detail.textContent=confirmed+" de "+sourceRows.length+" produto(s) confirmados. "+unresolvedRows.length+" pendente(s)"+
      (hardFailed||awaitingConfirmation?" ("+hardFailed+" com erro de envio"+(awaitingConfirmation?", "+awaitingConfirmation+" aguardando confirmação":"")+")":"")+".";
    btn.disabled=false;btn.textContent="Tentar somente pendentes";
    form.querySelectorAll("input,select").forEach(el=>el.disabled=false);
    showToast("Ainda há "+unresolvedRows.length+" valor(es) sem confirmação. O sistema vai reenviar somente o que continuar pendente.","error");
  };
}
function openIndividualAdjustment(list,years){
  const origem=years.includes(2026)?2026:Number(state.productYear||years[0]||2026),destino=years.includes(2027)?2027:origem+1;
  const source=list.filter(p=>Number(p.ANO_LETIVO)===origem);
  modal(`<div class="modal-head"><h3>Reajuste individual</h3><button class="icon-btn" data-close>✕</button></div>
  <div class="modal-body"><div class="notice">Escolha um único produto ou serviço. Você pode aplicar percentual ou definir diretamente o novo valor para o ano de destino.</div>
  <form id="individualForm" class="form-grid">
    <div class="field"><label>Ano de origem</label><select name="anoOrigem" id="indOrigin">${years.map(y=>`<option value="${y}" ${y===origem?"selected":""}>${y}</option>`).join("")}</select></div>
    <div class="field"><label>Ano de destino</label><input type="number" name="anoDestino" value="${destino}" min="2026" max="2100" required></div>
    <div class="field span-2"><label>Produto / serviço</label><select name="idProduto" id="indProduct" required></select></div>
    <div class="field"><label>Modo</label><select name="modo" id="indMode"><option value="percentual">Percentual (%)</option><option value="valor">Novo valor</option></select></div>
    <div class="field"><label id="indValueLabel">Reajuste (%)</label><input type="number" step="0.01" name="valor" id="indValue" value="0" required></div>
    <div class="field"><label>Publicar no Atendimento, Panfleto e Secretaria</label><select name="publicar"><option>Sim</option><option>Não</option></select></div>
    <div class="field span-3"><label>Observação</label><input name="observacao" placeholder="Ex.: reajuste negociado individualmente para 2027"></div>
  </form></div>
  <div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="applyIndividual">Aplicar reajuste individual</button></div>`);
  const fill=()=>{const y=Number($("#indOrigin").value),arr=list.filter(p=>Number(p.ANO_LETIVO)===y);$("#indProduct").innerHTML=arr.map(p=>`<option value="${esc(p.ID_PRODUTO)}">${esc(p.PRODUTO)} • ${esc(p["SEGMENTO_SÉRIE"]||"")} • ${money(p.VALOR_BASE)}</option>`).join("")};
  fill();$("#indOrigin").onchange=fill;$("#indMode").onchange=()=>{$("#indValueLabel").textContent=$("#indMode").value==="percentual"?"Reajuste (%)":"Novo valor (R$)"};
  $$('[data-close]').forEach(x=>x.onclick=closeModal);
  $("#applyIndividual").onclick=async()=>{
    const f=$("#individualForm");if(!f.reportValidity())return;
    const data=Object.fromEntries(new FormData(f).entries()),btn=$("#applyIndividual");btn.disabled=true;btn.textContent="Aplicando…";
    try{
      const res=await api("aplicarReajusteIndividual",{token:state.adminToken,data});
      state.productYear=Number(data.anoDestino);clearApiCache();closeModal();
      setNotice(`Reajuste individual aplicado em ${esc(res.produto||data.idProduto)}. O item já fica disponível no catálogo ${data.anoDestino} conforme a publicação escolhida.`,"ok");
      await renderProdutos();
    }catch(e){alert(e.message);btn.disabled=false;btn.textContent="Aplicar reajuste individual"}
  };
}

function openNewProductService(){
  const y=Number(state.productYear||new Date().getFullYear());
  modal(`<div class="modal-head"><h3>Novo produto ou serviço</h3><button class="icon-btn" data-close>✕</button></div>
  <div class="modal-body"><div class="notice">Cadastro central. O que for publicado passa a alimentar automaticamente Atendimento, Panfletos e opções da Matrícula.</div>
  <form id="newServiceForm" class="form-grid">
    <div class="field"><label>Ano letivo</label><input type="number" name="ANO_LETIVO" value="${y}" min="2026" max="2100" required></div>
    <div class="field"><label>Categoria</label><select name="CATEGORIA"><option>Serviço</option><option>Adicional</option><option>Mensalidade</option><option>Material Didático</option><option>Fardamento</option><option>Taxa</option><option>Outros</option></select></div>
    <div class="field"><label>Subcategoria</label><input name="SUBCATEGORIA" placeholder="Ex.: Esporte, Integral, Transporte, Agenda"></div>
    <div class="field span-2"><label>Nome do produto / serviço</label><input name="PRODUTO" required placeholder="Ex.: Ballet, Futsal, Tempo Integral"></div>
    <div class="field"><label>Série / segmento</label><input name="SEGMENTO_SÉRIE" required placeholder="Ex.: Infantil 2 ao 5, 6º Ano, Todos"></div>
    <div class="field span-3"><label>Descrição para a família</label><textarea name="DESCRIÇÃO" placeholder="O que está incluído, carga horária, material, condições..."></textarea></div>
    <div class="field span-3"><label>Observação pública</label><textarea name="OBSERVAÇÃO" placeholder="Informação que pode aparecer no atendimento e panfleto"></textarea></div>
    <div class="field span-3"><label>Observação interna</label><textarea name="OBSERVACAO_INTERNA" placeholder="Uso exclusivo da Gestão/Secretaria"></textarea></div>
    <div class="field"><label>Tipo de cobrança</label><select name="TIPO_COBRANCA"><option>Única</option><option>Mensal</option><option>Parcelada</option><option>Anual</option><option>Opcional</option></select></div>
    <div class="field"><label>Valor base</label><input type="number" step="0.01" name="VALOR_BASE" value="0" required></div>
    <div class="field"><label>Valor pós-vencimento</label><input type="number" step="0.01" name="VALOR_PÓS_VENCIMENTO" value="0"></div>
    <div class="field"><label>Valor crédito</label><input type="number" step="0.01" name="VALOR_CRÉDITO" value="0"></div>
    <div class="field"><label>Qtd. parcelas</label><input type="number" name="QTD_PARCELAS" min="1" value="1"></div>
    <div class="field"><label>Valor da parcela</label><input type="number" step="0.01" name="VALOR_PARCELA" value="0"></div>
    <div class="field"><label>Vencimento padrão</label><input name="VENCIMENTO_PADRÃO" placeholder="Ex.: Dia 5 / Na compra"></div>
    <div class="field"><label>Disponível na matrícula</label><select name="DISPONIVEL_MATRICULA"><option>Sim</option><option>Não</option></select></div>
    <div class="field"><label>Publicado no Atendimento, Panfleto e Secretaria</label><select name="PUBLICADO_ATENDIMENTO"><option>Sim</option><option>Não</option></select></div>
    <div class="field"><label>Ativo</label><select name="ATIVO"><option>Sim</option><option>Não</option></select></div>
    <div class="field"><label>Ordem de exibição</label><input type="number" name="ORDEM_EXIBICAO" value="100"></div>
  </form></div>
  <div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="saveNewService">Cadastrar e integrar</button></div>`);
  $$('[data-close]').forEach(x=>x.onclick=closeModal);
  $("#saveNewService").onclick=async()=>{
    const f=$("#newServiceForm");if(!f.reportValidity())return;const data=Object.fromEntries(new FormData(f).entries()),btn=$("#saveNewService");btn.disabled=true;btn.textContent="Integrando…";
    try{
      const res=await api("criarProdutoServico",{token:state.adminToken,data});
      state.productYear=Number(data.ANO_LETIVO);clearApiCache();closeModal();
      setNotice(`${esc(data.PRODUTO)} cadastrado com ID ${esc(res.id)} e integrado ao catálogo oficial.`,"ok");
      await renderProdutos();
    }catch(e){alert(e.message);btn.disabled=false;btn.textContent="Cadastrar e integrar"}
  };
}

function openProductForm(p){
  modal(`<div class="modal-head"><h3>Editar produto / serviço</h3><button class="icon-btn" data-close>✕</button></div><div class="modal-body"><form id="prodForm" class="form-grid">
    <div class="field"><label>Ano letivo</label><input type="number" name="ANO_LETIVO" value="${esc(p.ANO_LETIVO||state.productYear||"")}" min="2026" max="2100"></div>
    <div class="field"><label>Categoria</label><select name="CATEGORIA">${["Mensalidade","Material Didático","Fardamento","Adicional","Serviço","Taxa","Outros"].map(x=>`<option ${p.CATEGORIA===x?"selected":""}>${x}</option>`).join("")}</select></div>
    <div class="field"><label>Subcategoria</label><input name="SUBCATEGORIA" value="${esc(p.SUBCATEGORIA||"")}"></div>
    <div class="field span-2"><label>Produto / serviço</label><input name="PRODUTO" value="${esc(p.PRODUTO||"")}"></div>
    <div class="field"><label>Série / segmento</label><input name="SEGMENTO_SÉRIE" value="${esc(p["SEGMENTO_SÉRIE"]||"")}"></div>
    <div class="field span-3"><label>Descrição para a família</label><textarea name="DESCRIÇÃO">${esc(p["DESCRIÇÃO"]||"")}</textarea></div>
    <div class="field span-3"><label>Observação pública</label><textarea name="OBSERVAÇÃO">${esc(p["OBSERVAÇÃO"]||"")}</textarea></div>
    <div class="field span-3"><label>Observação interna</label><textarea name="OBSERVACAO_INTERNA">${esc(p.OBSERVACAO_INTERNA||"")}</textarea></div>
    <div class="field"><label>Tipo de cobrança</label><select name="TIPO_COBRANCA">${["Única","Mensal","Parcelada","Anual","Opcional"].map(x=>`<option ${p.TIPO_COBRANCA===x?"selected":""}>${x}</option>`).join("")}</select></div>
    <div class="field"><label>Valor base</label><input type="number" step="0.01" name="VALOR_BASE" value="${esc(p.VALOR_BASE||0)}"></div>
    <div class="field"><label>Valor pós-vencimento</label><input type="number" step="0.01" name="VALOR_PÓS_VENCIMENTO" value="${esc(p["VALOR_PÓS_VENCIMENTO"]||0)}"></div>
    <div class="field"><label>Valor crédito</label><input type="number" step="0.01" name="VALOR_CRÉDITO" value="${esc(p["VALOR_CRÉDITO"]||0)}"></div>
    <div class="field"><label>Valor parcela</label><input type="number" step="0.01" name="VALOR_PARCELA" value="${esc(p.VALOR_PARCELA||0)}"></div>
    <div class="field"><label>Qtd parcelas</label><input type="number" name="QTD_PARCELAS" value="${esc(p.QTD_PARCELAS||1)}"></div>
    <div class="field"><label>Vencimento padrão</label><input name="VENCIMENTO_PADRÃO" value="${esc(p.VENCIMENTO_PADRÃO||"")}"></div>
    <div class="field"><label>Disponível na matrícula</label><select name="DISPONIVEL_MATRICULA"><option ${p.DISPONIVEL_MATRICULA!=="Não"?"selected":""}>Sim</option><option ${p.DISPONIVEL_MATRICULA==="Não"?"selected":""}>Não</option></select></div>
    <div class="field"><label>Publicado no Atendimento, Panfleto e Secretaria</label><select name="PUBLICADO_ATENDIMENTO"><option ${p.PUBLICADO_ATENDIMENTO!=="Não"?"selected":""}>Sim</option><option ${p.PUBLICADO_ATENDIMENTO==="Não"?"selected":""}>Não</option></select></div>
    <div class="field"><label>Ativo</label><select name="ATIVO"><option ${p.ATIVO==="Sim"?"selected":""}>Sim</option><option ${p.ATIVO==="Não"?"selected":""}>Não</option></select></div>
    <div class="field"><label>Ordem de exibição</label><input type="number" name="ORDEM_EXIBICAO" value="${esc(p.ORDEM_EXIBICAO||100)}"></div>
  </form></div><div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="saveProd">Salvar e sincronizar</button></div>`);
  $$('[data-close]').forEach(x=>x.onclick=closeModal);
  $("#saveProd").onclick=async()=>{
    const data=Object.fromEntries(new FormData($("#prodForm")).entries());
    try{
      await api("atualizarProduto",{token:state.adminToken,id:p.ID_PRODUTO,data});
      state.productYear=Number(data.ANO_LETIVO)||state.productYear;
      clearApiCache();
      closeModal();setNotice("Produto/serviço atualizado e sincronizado com Atendimento, Panfletos e Matrícula.","ok");renderProdutos();
    }catch(e){alert(e.message)}
  };
}


function revNum(v){
  if(typeof v==="number")return Number.isFinite(v)?v:0;
  const raw=String(v??"").trim();if(!raw)return 0;
  const normalized=raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw;
  return Number(normalized.replace(/[^0-9.-]/g,""))||0;
}
function revNorm(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
function revSeriesRank(v){
  const s=revNorm(v),inf=s.match(/infantil\s*(\d+)/);if(inf)return Number(inf[1])-10;
  const ano=s.match(/^(\d+)[ºoaª]?\s*ano/);if(ano)return Number(ano[1]);
  const em=s.match(/^(\d+)[ºoaª]?\s*(?:serie|em)/);if(em)return 20+Number(em[1]);
  return 90;
}
function revSegmentCode(serie){
  const s=revNorm(serie);
  if(s.includes("infantil"))return "INF";
  const n=Number((s.match(/^(\d+)/)||[])[1]||0);
  if(/ensino medio|\bem\b|serie/.test(s))return "EM";
  if(n>=1&&n<=5)return "AI";
  if(n>=6&&n<=9)return "AF";
  return "";
}
function revSeriesForYear(a,year){
  return Number(year)===2027?String(a.PROXIMA_SERIE_2027||"").trim():String(a["SÉRIE"]||"").trim();
}
function revProduct(products,id){return (products||[]).find(p=>String(p.ID_PRODUTO||"")===id&&String(p.ATIVO||"Sim")!=="Não")}
function revTuitionFor(products,serie,year,plan){
  const seg=revSegmentCode(serie);if(!seg||seg==="EM")return null;
  const monthly=revProduct(products,`MEN-${seg}-${plan}-${year}`);
  const annual=revProduct(products,`ANU-${seg}-${year}`);
  if(!monthly||!annual)return null;
  return {
    segment:seg,
    monthly:revNum(monthly.VALOR_PARCELA||monthly.VALOR_BASE),
    annual:revNum(annual.VALOR_BASE),
    monthlyProduct:monthly.PRODUTO||monthly.ID_PRODUTO,
    annualProduct:annual.PRODUTO||annual.ID_PRODUTO
  };
}
function revDateParts(v){
  const s=String(v||"").trim();
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return {y:Number(m[1]),m:Number(m[2])};
  m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);if(m)return {y:Number(m[3]),m:Number(m[2])};
  const d=new Date(s);return isNaN(d)?{y:0,m:0}:{y:d.getFullYear(),m:d.getMonth()+1};
}
function revMoneyCompact(v){return Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0})}
function revBuildModel(alunos,products,year,plan){
  const active=(alunos||[]).filter(a=>String(a.STATUS||"Ativo")!=="Inativo");
  const rows=active.map(a=>{
    const serie=revSeriesForYear(a,year),tuition=revTuitionFor(products,serie,year,plan);
    return {
      id:a.ID_ALUNO||"",matricula:a.MATRICULA_ORIGEM||"",aluno:a.NOME_COMPLETO||"",
      serie,proxima:a.PROXIMA_SERIE_2027||"",monthly:tuition?.monthly||0,annual:tuition?.annual||0,
      covered:!!tuition,product:tuition?.monthlyProduct||"",segment:tuition?.segment||""
    };
  }).filter(r=>r.serie);
  const map=new Map();
  rows.forEach(r=>{
    if(!map.has(r.serie))map.set(r.serie,{serie:r.serie,students:0,covered:0,monthly:0,annual:0});
    const x=map.get(r.serie);x.students++;if(r.covered){x.covered++;x.monthly+=r.monthly;x.annual+=r.annual}
  });
  const summary=[...map.values()].sort((a,b)=>revSeriesRank(a.serie)-revSeriesRank(b.serie)||a.serie.localeCompare(b.serie,"pt-BR",{numeric:true}));
  return {rows,summary};
}
function revBars(rows,key,formatter){
  const max=Math.max(1,...rows.map(x=>Number(x[key]||0)));
  return rows.map(x=>`<div class="rev-bar-row"><span>${esc(x.serie)}</span><div><i style="width:${Math.max(2,(Number(x[key]||0)/max)*100)}%"></i></div><b>${esc(formatter(Number(x[key]||0)))}</b></div>`).join("");
}
function revRevenueChartDataUrl(summary){
  try{
    const W=1400,H=Math.max(520,summary.length*44+130),cv=document.createElement("canvas");cv.width=W;cv.height=H;
    const ctx=cv.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);ctx.fillStyle="#123b76";ctx.font="bold 30px Arial";ctx.fillText("Receita bruta mensal estimada por série",40,45);
    ctx.font="18px Arial";ctx.fillStyle="#687a91";ctx.fillText("Tabela cheia • sem descontos individuais",40,76);
    const left=270,right=170,top=112,rowH=39,max=Math.max(1,...summary.map(x=>x.monthly));
    summary.forEach((x,i)=>{
      const y=top+i*rowH,w=W-left-right,bw=w*(x.monthly/max);
      ctx.textAlign="right";ctx.fillStyle="#36465c";ctx.font="17px Arial";ctx.fillText(x.serie,left-16,y+16);
      ctx.fillStyle="#edf2f8";ctx.fillRect(left,y,w,20);ctx.fillStyle="#1d5fa9";ctx.fillRect(left,y,bw,20);
      ctx.textAlign="left";ctx.fillStyle="#123b76";ctx.font="bold 15px Arial";ctx.fillText(revMoneyCompact(x.monthly),left+bw+8,y+16);
    });
    return cv.toDataURL("image/png",.92);
  }catch(e){return ""}
}
async function renderProjecaoReceita(){
  const [b,products,cash]=await Promise.all([
    loadBootstrap(),
    api("listarProdutosGestao",{token:state.adminToken}),
    api("listarCaixa",{token:state.adminToken}).catch(()=>([]))
  ]);
  const alunos=b.alunos||[];
  const now=new Date(),defaultMonth=now.getMonth()+1;
  $("#view").innerHTML=`
    <section class="rev-hero">
      <div><small>FINANCEIRO • PROJEÇÃO</small><h2>Receita estimada por aluno e série</h2><p>Simulação usando os <b>valores cheios da tabela oficial</b>. Não aplica descontos individuais, bolsas ou inadimplência.</p></div>
      <div class="rev-hero-badge">ESTIMATIVA<small>não contábil</small></div>
    </section>
    <section class="card rev-filters">
      <div class="field"><label>Ano letivo</label><select id="revYear"><option value="2026">2026 • alunos atuais</option><option value="2027">2027 • progressão prevista</option></select></div>
      <div class="field"><label>Plano de mensalidade</label><select id="revPlan"><option value="12">Plano 12 parcelas</option><option value="11">Plano 11 parcelas</option></select></div>
      <div class="field"><label>Mês para despesas</label><select id="revMonth">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===defaultMonth?"selected":""}>${new Date(2026,i,1).toLocaleDateString("pt-BR",{month:"long"})}</option>`).join("")}</select></div>
      <div class="field"><label>Série</label><select id="revSeries"><option value="">Todas as séries</option></select></div>
      <div class="field rev-search-field"><label>Aluno</label><input id="revSearch" class="search" autocomplete="off" placeholder="Digite nome ou matrícula…"></div>
      <div class="rev-filter-actions"><button class="btn btn-soft" id="revClear">Limpar</button><button class="btn btn-report" id="revExcel">📊 Excel</button><button class="btn btn-primary" id="revPdf">📄 PDF</button></div>
    </section>
    <div id="revNotice"></div>
    <div class="rev-kpis" id="revKpis"></div>
    <div class="rev-charts" id="revCharts"></div>
    <section class="card rev-summary-card"><div class="section-head"><div><h3>Receita por série</h3><span class="muted">Quantidade de alunos × valor cheio da mensalidade.</span></div><b id="revSeriesCount"></b></div><div id="revSummary"></div></section>
    <section class="card rev-students-card"><div class="section-head"><div><h3>Relação de alunos e mensalidades</h3><span class="muted">Base usada na estimativa financeira.</span></div><b id="revStudentCount"></b></div><div id="revStudents"></div></section>`;

  let current={rows:[],summary:[],filteredRows:[],filteredSummary:[],grossMonth:0,grossAnnual:0,expenseMonth:0,netMonth:0,netAnnualProjected:0,uncovered:0};

  const populateSeries=()=>{
    const year=Number($("#revYear").value),model=revBuildModel(alunos,products,year,$("#revPlan").value);
    const prev=$("#revSeries").value;
    $("#revSeries").innerHTML='<option value="">Todas as séries</option>'+model.summary.map(x=>`<option value="${esc(x.serie)}">${esc(x.serie)}</option>`).join("");
    if([...$("#revSeries").options].some(o=>o.value===prev))$("#revSeries").value=prev;
  };

  const calculate=()=>{
    const year=Number($("#revYear").value),plan=$("#revPlan").value,month=Number($("#revMonth").value);
    const model=revBuildModel(alunos,products,year,plan),series=$("#revSeries").value,q=revNorm($("#revSearch").value);
    const filteredRows=model.rows.filter(r=>(!series||r.serie===series)&&(!q||[r.aluno,r.matricula,r.serie].some(v=>revNorm(v).includes(q))));
    const map=new Map();
    filteredRows.forEach(r=>{
      if(!map.has(r.serie))map.set(r.serie,{serie:r.serie,students:0,covered:0,monthly:0,annual:0});
      const x=map.get(r.serie);x.students++;if(r.covered){x.covered++;x.monthly+=r.monthly;x.annual+=r.annual}
    });
    const filteredSummary=[...map.values()].sort((a,b)=>revSeriesRank(a.serie)-revSeriesRank(b.serie));
    const grossMonth=filteredRows.reduce((a,r)=>a+r.monthly,0),grossAnnual=filteredRows.reduce((a,r)=>a+r.annual,0);
    const expenseMonth=(cash||[]).filter(c=>{
      const p=revDateParts(c.DATA);return p.y===year&&p.m===month&&revNorm(c.TIPO)==="saida";
    }).reduce((a,c)=>a+revNum(c.VALOR),0);
    const netMonth=grossMonth-expenseMonth,netAnnualProjected=grossAnnual-(expenseMonth*12);
    const uncovered=filteredRows.filter(r=>!r.covered).length;
    current={rows:model.rows,summary:model.summary,filteredRows,filteredSummary,grossMonth,grossAnnual,expenseMonth,netMonth,netAnnualProjected,uncovered,year,plan,month,series,q};

    const monthName=new Date(year,month-1,1).toLocaleDateString("pt-BR",{month:"long"});
    $("#revNotice").innerHTML=`<div class="rev-warning"><b>Como ler esta projeção</b><span><strong>Receita bruta</strong> = valores cheios do catálogo × alunos. <strong>Líquida operacional estimada</strong> = bruta mensal − saídas registradas no Caixa em ${esc(monthName)}. Não considera descontos de alunos, bolsas, inadimplência, impostos ou taxas. A líquida anual apenas anualiza as saídas do mês (${money(expenseMonth)} × 12).</span></div>`;

    $("#revKpis").innerHTML=`
      <div><small>ALUNOS NA PROJEÇÃO</small><strong>${filteredRows.length}</strong><span>${uncovered?`${uncovered} sem mensalidade cadastrada`:"100% com valor cadastrado"}</span></div>
      <div><small>BRUTA MENSAL ESTIMADA</small><strong>${money(grossMonth)}</strong><span>valor cheio • plano ${plan}x</span></div>
      <div><small>BRUTA ANUAL ESTIMADA</small><strong>${money(grossAnnual)}</strong><span>anuidade cheia da tabela</span></div>
      <div><small>SAÍDAS DO MÊS</small><strong>${money(expenseMonth)}</strong><span>Caixa • ${esc(monthName)}</span></div>
      <div class="net"><small>LÍQUIDA OPERACIONAL / MÊS</small><strong>${money(netMonth)}</strong><span>bruta − saídas cadastradas</span></div>
      <div class="net"><small>LÍQUIDA ANUAL PROJETADA*</small><strong>${money(netAnnualProjected)}</strong><span>*saídas mensais anualizadas</span></div>`;

    $("#revCharts").innerHTML=`
      <section class="rev-chart-card"><div class="rev-chart-head"><div><small>GRÁFICO 1</small><h3>Receita mensal por série</h3></div><b>${money(grossMonth)}</b></div><div class="rev-bars">${revBars(filteredSummary,"monthly",revMoneyCompact)||'<div class="empty">Sem valores para exibir.</div>'}</div></section>
      <section class="rev-chart-card"><div class="rev-chart-head"><div><small>GRÁFICO 2</small><h3>Alunos por série</h3></div><b>${filteredRows.length} alunos</b></div><div class="rev-bars students">${revBars(filteredSummary,"students",v=>String(v))||'<div class="empty">Sem alunos para exibir.</div>'}</div></section>`;

    $("#revSeriesCount").textContent=filteredSummary.length+" série(s)";
    $("#revSummary").innerHTML=`<div class="table-wrap"><table><thead><tr><th>Série</th><th>Alunos</th><th>Com valor</th><th>Mensalidade cheia</th><th>Receita mensal</th><th>Receita anual</th></tr></thead><tbody>${filteredSummary.map(x=>{
      const one=filteredRows.find(r=>r.serie===x.serie&&r.covered);
      return `<tr><td><strong>${esc(x.serie)}</strong></td><td>${x.students}</td><td>${x.covered}</td><td class="money">${one?money(one.monthly):"Sem valor"}</td><td class="money"><strong>${money(x.monthly)}</strong></td><td class="money">${money(x.annual)}</td></tr>`;
    }).join("")||'<tr><td colspan="6" class="empty">Nenhum resultado.</td></tr>'}</tbody></table></div>`;

    $("#revStudentCount").textContent=filteredRows.length+" aluno(s)";
    $("#revStudents").innerHTML=`<div class="table-wrap"><table><thead><tr><th>Matrícula</th><th>Aluno</th><th>Série</th><th>Mensalidade cheia</th><th>Anuidade cheia</th><th>Base</th></tr></thead><tbody>${filteredRows.sort((a,b)=>revSeriesRank(a.serie)-revSeriesRank(b.serie)||a.aluno.localeCompare(b.aluno,"pt-BR")).map(r=>`<tr><td>${esc(r.matricula||"—")}</td><td><strong>${esc(r.aluno)}</strong></td><td>${esc(r.serie)}</td><td class="money">${r.covered?money(r.monthly):"—"}</td><td class="money">${r.covered?money(r.annual):"—"}</td><td>${r.covered?'<span class="pill ok">Tabela cheia</span>':'<span class="pill warn">Sem valor cadastrado</span>'}</td></tr>`).join("")||'<tr><td colspan="6" class="empty">Nenhum aluno encontrado.</td></tr>'}</tbody></table></div>`;
  };

  const exportProjection=async(format,btn)=>{
    calculate();
    const c=current,monthName=new Date(c.year,c.month-1,1).toLocaleDateString("pt-BR",{month:"long"});
    const chartDataUrl=revRevenueChartDataUrl(c.filteredSummary);
    await gfDownloadReport({
      format,title:"Projeção Financeira de Mensalidades",subtitle:`Ano ${c.year} • plano ${c.plan} parcelas • valores cheios sem descontos individuais`,
      filename:gfReportFile("projecao-receita",[c.year,c.series||"todas",c.plan+"x"]),
      orientation:"landscape",chartDataUrl,chartTitle:"Receita bruta mensal estimada por série",
      meta:gfReportMeta([{label:"Ano",value:String(c.year)},{label:"Plano",value:c.plan+" parcelas"},{label:"Série",value:c.series||"Todas"},{label:"Mês despesas",value:monthName}]),
      summary:[
        {label:"Alunos",value:String(c.filteredRows.length)},
        {label:"Bruta mensal",value:money(c.grossMonth)},
        {label:"Bruta anual",value:money(c.grossAnnual)},
        {label:"Líquida operacional/mês",value:money(c.netMonth)}
      ],
      columns:[
        {key:"matricula",label:"Matrícula",width:.9},{key:"aluno",label:"Aluno",width:2.3},{key:"serie",label:"Série",width:.9},
        {key:"mensal",label:"Mensalidade cheia",width:1.1,align:"right"},{key:"anual",label:"Anuidade cheia",width:1.1,align:"right"},{key:"status",label:"Base de cálculo",width:1.1}
      ],
      rows:c.filteredRows.map(r=>({matricula:r.matricula||"",aluno:r.aluno,serie:r.serie,mensal:r.covered?money(r.monthly):"Sem valor",anual:r.covered?money(r.annual):"Sem valor",status:r.covered?"Tabela cheia":"Sem mensalidade cadastrada"})),
      extraSheets:[
        {name:"Resumo por série",columns:["Série","Alunos","Com valor","Mensalidade cheia","Receita mensal","Receita anual"],rows:c.filteredSummary.map(x=>{const one=c.filteredRows.find(r=>r.serie===x.serie&&r.covered);return [x.serie,x.students,x.covered,one?.monthly||0,x.monthly,x.annual]})},
        {name:"Premissas",columns:["Premissa","Valor"],rows:[
          ["Valores individuais","Tabela cheia, sem descontos ou bolsas"],
          ["Inadimplência","Não considerada"],
          ["Saídas do mês",c.expenseMonth],
          ["Líquida mensal estimada",c.netMonth],
          ["Líquida anual projetada",c.netAnnualProjected],
          ["Observação","A líquida anual anualiza as saídas registradas no mês selecionado; não representa resultado contábil."]
        ]}
      ]
    },btn);
  };

  $("#revYear").onchange=()=>{populateSeries();calculate()};
  $("#revPlan").onchange=calculate;$("#revMonth").onchange=calculate;$("#revSeries").onchange=calculate;$("#revSearch").oninput=calculate;
  $("#revClear").onclick=()=>{$("#revSeries").value="";$("#revSearch").value="";calculate()};
  $("#revPdf").onclick=function(){exportProjection("pdf",this)};
  $("#revExcel").onclick=function(){exportProjection("xlsx",this)};
  populateSeries();calculate();
}

async function renderRecebimentos(){
  const list=await api("listarRecebimentos",{token:state.adminToken});
  $("#view").innerHTML=`<div class="section-head"><h2>Contas a receber</h2><div class="toolbar"><button class="btn btn-report" id="receivablesReport">📄 Relatório</button></div></div><div class="table-wrap"><table><thead><tr><th>Recebimento</th><th>Aluno</th><th>Parcela</th><th>Vencimento</th><th>Previsto</th><th>Recebido</th><th>Status</th><th></th></tr></thead><tbody>${list.map(r=>`<tr><td>${esc(r.ID_RECEBIMENTO)}</td><td>${esc(r.ID_ALUNO)}</td><td>${esc(r.PARCELA||"")}</td><td>${esc(r.VENCIMENTO||"")}</td><td class="money">${money(r.VALOR_PREVISTO)}</td><td class="money">${money(r.VALOR_RECEBIDO)}</td><td>${pill(r.STATUS_CALCULADO||r.STATUS||"")}</td><td><button class="icon-btn" data-pay="${esc(r.ID_RECEBIMENTO)}">Receber</button></td></tr>`).join("")||`<tr><td colspan="8" class="empty">Sem recebimentos.</td></tr>`}</tbody></table></div>`;
  $('#receivablesReport').onclick=()=>openReceivablesReport(list); $$('[data-pay]').forEach(x=>x.onclick=()=>payModal(x.dataset.pay));
}
function payModal(id){modal(`<div class="modal-head"><h3>Registrar pagamento</h3><button class="icon-btn" data-close>✕</button></div><div class="modal-body"><div class="form-grid"><div class="field"><label>Recebimento</label><input value="${esc(id)}" disabled></div><div class="field"><label>Valor *</label><input id="payValue" type="number" step="0.01"></div><div class="field"><label>Forma</label><select id="payMethod"><option>Pix</option><option>Dinheiro</option><option>Cartão de débito</option><option>Cartão de crédito</option><option>Boleto/Transferência</option></select></div></div></div><div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="savePay">Confirmar</button></div>`);$$('[data-close]').forEach(x=>x.onclick=closeModal);$("#savePay").onclick=async()=>{try{await api("registrarPagamento",{token:state.adminToken,data:{ID_RECEBIMENTO:id,VALOR:$("#payValue").value,FORMA_PAGAMENTO:$("#payMethod").value}});closeModal();renderRecebimentos();}catch(e){alert(e.message)}};}

async function renderCaixa(){
  const list=await api("listarCaixa",{token:state.adminToken});
  $("#view").innerHTML=`<div class="section-head"><h2>Movimentações</h2><div class="toolbar"><button class="btn btn-report" id="cashReport">📄 Relatório</button><button class="btn btn-primary" id="newMove">+ Movimento</button></div></div><div class="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Forma</th><th>Valor</th><th>Responsável</th><th class="action-col">Ação</th></tr></thead><tbody>${list.slice().reverse().map(c=>`<tr><td>${esc(c.DATA||"")}</td><td>${pill(c.TIPO||"",c.TIPO==="Entrada"?"ok":"warn")}</td><td>${esc(c.CATEGORIA||"")}<br><span class="muted">${esc(c.SUBCATEGORIA||"")}</span></td><td>${esc(c["DESCRIÇÃO"]||"")}</td><td>${esc(c.FORMA_PAGAMENTO||"")}</td><td class="money">${money(c.VALOR)}</td><td>${esc(c["RESPONSÁVEL"]||"")}</td><td class="action-col"><button class="trash-btn" data-del-move="${esc(c.ID_CAIXA||"")}" title="Apagar esta movimentação" aria-label="Apagar movimentação ${esc(c.ID_CAIXA||"")}">🗑️</button></td></tr>`).join("")||`<tr><td colspan="8" class="empty">Sem movimentos.</td></tr>`}</tbody></table></div>`;
  $("#newMove").onclick=openMoveModal;
  $$("[data-del-move]").forEach(btn=>btn.onclick=async()=>{
    const id=btn.dataset.delMove;
    const row=list.find(x=>String(x.ID_CAIXA||"")===String(id))||{};
    const prod=state.runMode==="PRODUCAO";
    const msg=(prod?"ATENÇÃO: você está na PRODUÇÃO.\n\n":"")+"Apagar esta movimentação individual?\n\n"+(row["DESCRIÇÃO"]||row.CATEGORIA||id)+" • "+money(row.VALOR)+"\n\nEsta ação não pode ser desfeita.";
    if(!confirm(msg))return;
    const old=btn.textContent;btn.disabled=true;btn.textContent="⏳";
    try{
      await api("excluirMovimentoCaixa",{token:state.adminToken,id});
      clearApiCache();
      showToast("Movimentação excluída ✓","ok");
      await renderCaixa();
    }catch(e){
      showToast(e.message||"Não foi possível excluir a movimentação.","error");
      btn.disabled=false;btn.textContent=old;
    }
  });
}
async function openMoveModal(){
  let cats=[];try{cats=await api("listarCategorias",{token:state.adminToken});}catch{}
  const clientRequestId="CXREQ-"+Date.now()+"-"+Math.random().toString(36).slice(2,8).toUpperCase();
  modal(`<div class="modal-head"><h3>Novo movimento de caixa</h3><button class="icon-btn" data-close>✕</button></div><div class="modal-body"><form id="moveForm" class="form-grid"><div class="field"><label>Data</label><input type="date" name="DATA" value="${new Date().toISOString().slice(0,10)}"></div><div class="field"><label>Tipo *</label><select name="TIPO" id="moveType"><option>Entrada</option><option>Saída</option></select></div><div class="field"><label>Valor *</label><input type="number" step="0.01" name="VALOR" required></div><div class="field span-2"><label>Categoria *</label><select name="CATEGORIA" id="moveCat" required><option value="">Selecione</option>${cats.map(c=>`<option data-type="${esc(c.TIPO)}" value="${esc(c.CATEGORIA)}">${esc(c.TIPO)} — ${esc(c.CATEGORIA)} / ${esc(c.SUBCATEGORIA||"")}</option>`).join("")}</select></div><div class="field"><label>Forma</label><select name="FORMA_PAGAMENTO"><option>Pix</option><option>Dinheiro</option><option>Cartão</option><option>Boleto/Transferência</option></select></div><div class="field span-3"><label>Descrição</label><input name="DESCRIÇÃO"></div></form></div><div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="saveMove">Salvar</button></div>`);
  $$('[data-close]').forEach(x=>x.onclick=closeModal);
  let saving=false;
  $("#saveMove").onclick=async()=>{
    if(saving)return;
    const f=$("#moveForm");if(!f.reportValidity())return;
    saving=true;
    const btn=$("#saveMove"),old=btn.textContent;
    btn.disabled=true;btn.classList.add("is-saving");btn.textContent="Salvando…";
    $$("[data-close]").forEach(x=>x.disabled=true);
    const data=Object.fromEntries(new FormData(f).entries());data.CLIENT_REQUEST_ID=clientRequestId;
    try{
      const res=await api("salvarMovimentoCaixa",{token:state.adminToken,data});
      clearApiCache();
      showToast(res?.duplicate?"Movimentação já havia sido salva; duplicidade evitada ✓":"Movimentação salva ✓","ok");
      closeModal();
      await renderCaixa();
    }catch(e){
      saving=false;btn.disabled=false;btn.classList.remove("is-saving");btn.textContent=old;
      $$("[data-close]").forEach(x=>x.disabled=false);
      showToast(e.message||"Não foi possível salvar a movimentação.","error");
    }
  };
}

async function renderFechamento(){
  const f=await api("getFechamento",{token:state.adminToken});
  const headers=f.headers||[], row=f.atual||[];
  $("#view").innerHTML=`<div class="section-head"><h2>Fechamento atual</h2><div class="toolbar"><button class="btn btn-report" id="closingReport">📄 Relatório</button></div></div><div class="cards grid">${headers.map((h,i)=>`<div class="card metric"><div class="label">${esc(h)}</div><div class="value" style="font-size:${i<3?"18":"23"}">${esc(row[i]||"—")}</div><div class="hint">período em acompanhamento</div></div>`).join("")}</div>`;
  $("#closingReport").onclick=()=>openClosingReport(f);
}

