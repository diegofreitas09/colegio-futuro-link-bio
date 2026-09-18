
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
function gfCatalog(ps,y,s){return (ps||[]).filter(function(p){var pub=gfNorm(p.PUBLICADO_ATENDIMENTO);return p.ATIVO==="Sim"&&gfYear(p)===Number(y)&&pub!=="nao"&&pub!=="não"&&gfApplies(p,s)})}
function gfGroups(list){var m={};list.forEach(function(p){var k=p.CATEGORIA||"Outros";(m[k]||(m[k]=[])).push(p)});return m}
function gfRound2(v){return Math.round((Number(v||0)+Number.EPSILON)*100)/100}
function gfAnnualProduct(list){return (list||[]).find(function(p){return p.CATEGORIA==="Mensalidade"&&(gfNorm(p.SUBCATEGORIA).includes("anuidade")||gfNorm(p.PRODUTO).includes("anuidade")||Number(p.QTD_PARCELAS)===1)})||null}
function gfRecurringProduct(list,n){return (list||[]).find(function(p){return p.CATEGORIA==="Mensalidade"&&Number(p.QTD_PARCELAS)===Number(n)})||null}
function gfPlanCalc(list,n,discFirst,discRecurring){
  n=Number(n||12);discFirst=Math.max(0,Math.min(100,Number(discFirst||0)));discRecurring=Math.max(0,Math.min(100,Number(discRecurring||0)));
  var annual=gfAnnualProduct(list),annualValue=Number(annual&&annual.VALOR_BASE||0),monthly=gfRecurringProduct(list,n),recurringBase=Number(monthly&&monthly.VALOR_BASE||0);
  if(!recurringBase&&annualValue)recurringBase=gfRound2(annualValue/(n+1));
  var firstBase=annualValue?gfRound2(annualValue-(recurringBase*n)):recurringBase;
  if(firstBase<=0)firstBase=recurringBase;
  var firstFinal=gfRound2(firstBase*(1-discFirst/100)),recurringFinal=gfRound2(recurringBase*(1-discRecurring/100));
  var total=gfRound2(firstFinal+(recurringFinal*n)),economy=gfRound2(Math.max(0,annualValue-total));
  return {n:n,annual:annual,annualValue:annualValue,monthly:monthly,firstBase:firstBase,recurringBase:recurringBase,discFirst:discFirst,discRecurring:discRecurring,firstFinal:firstFinal,recurringFinal:recurringFinal,total:total,economy:economy};
}
function gfPlanSummary(plan){return "1ª parcela "+money(plan.firstFinal)+" + "+plan.n+"x de "+money(plan.recurringFinal)}
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


const GF_ATT_DRAFT_KEY="gestao_futuro_atendimento_rascunho_v1";
function gfSaveAttendanceDraft(){
  var f=$("#attForm");if(!f)return;
  var data=Object.fromEntries(new FormData(f).entries());
  data.ID_ALUNO=$("#attStudent")?.value||"";
  data.ETAPA=state.attendanceStage||"Contato";
  data.ITENS=[...(state.attendanceItems||new Set())];
  data.SAVED_AT=new Date().toISOString();
  try{localStorage.setItem(GF_ATT_DRAFT_KEY,JSON.stringify(data))}catch(e){}
}
function gfLoadAttendanceDraft(){try{return JSON.parse(localStorage.getItem(GF_ATT_DRAFT_KEY)||"null")}catch(e){return null}}
function gfClearAttendanceDraft(){try{localStorage.removeItem(GF_ATT_DRAFT_KEY)}catch(e){}}
function gfSavedAttendanceKey(id){return "gestao_futuro_atendimento_salvo_"+String(id||"")}
function gfCacheSavedAttendance(id,rec,itens){try{localStorage.setItem(gfSavedAttendanceKey(id),JSON.stringify({atendimento:rec,itens:itens||[],cachedAt:new Date().toISOString()}))}catch(e){}}
function gfReadCachedAttendance(id){try{return JSON.parse(localStorage.getItem(gfSavedAttendanceKey(id))||"null")}catch(e){return null}}
function gfApplyAttendanceForm(rec){
  if(!rec)return;
  var f=$("#attForm");if(!f)return;
  Object.keys(rec).forEach(function(k){
    var el=f.elements[k];if(!el)return;
    if(el.type==="checkbox")el.checked=!!rec[k];else if(rec[k]!==undefined&&rec[k]!==null)el.value=rec[k];
  });
  if($("#attStudent")&&rec.ID_ALUNO)$("#attStudent").value=rec.ID_ALUNO;
}
async function gfResumeAttendance(id,fallback){
  var rec=fallback||null,items=[];var local=gfReadCachedAttendance(id);if(local){rec=local.atendimento||rec;items=local.itens||items;}
  try{
    var d=await api("getAtendimento",{token:tokenFor("staff"),id:id});
    rec=d&&d.atendimento||rec;items=d&&d.itens||[];
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
async function renderAtendimento(){
  var b=await loadBootstrap(),products=b.produtos||[],students=b.alunos||[],at=[];
  try{at=await api("listarAtendimentos",{token:tokenFor("staff")})||[]}catch(e){}
  var resume=state.resumeAttendance||null;
  var years=[...new Set(products.map(gfYear).filter(Boolean))].sort(function(a,b){return b-a}),year=Number(resume?.ANO_LETIVO||state.attendanceYear||years[0]||2027);
  state.attendanceItems=state.attendanceItems||new Set();
  state.attendanceStage=resume?.ETAPA||state.attendanceStage||"Contato";
  var studentOpts=students.map(function(a){return "<option value='"+esc(a.ID_ALUNO)+"'>"+esc(a.NOME_COMPLETO)+" • "+esc(a["SÉRIE"]||"")+"</option>"}).join("");
  var yearOpts=years.map(function(y){return "<option value='"+y+"' "+(y===year?"selected":"")+">"+y+"</option>"}).join("");
  var recent=at.slice().reverse().slice(0,50).map(function(a){
    var plan=a.PLANO_PARCELAS?("<br><span class='muted'>1ª parcela + "+esc(a.PLANO_PARCELAS)+"x</span>"):"";
    return "<tr><td><b>"+esc(a.NOME_ALUNO||a.ID_ALUNO||"")+"</b><br><span class='muted'>"+esc(a.RESPONSAVEL||"")+"</span></td><td>"+esc(a.ANO_LETIVO||"")+"</td><td>"+esc(a.SERIE_PRETENDIDA||"")+"</td><td>"+pill(a.ETAPA||"")+"</td><td>"+pill(a.STATUS||"")+"</td><td class='money'>"+money(a.TOTAL_PROPOSTA)+plan+"</td><td><button class='btn btn-soft btn-sm' data-resume-att='"+esc(a.ID_ATENDIMENTO)+"'>Continuar</button></td></tr>";
  }).join("");
  var draft=(!resume&&!state.currentAttendanceId)?gfLoadAttendanceDraft():null;
  var draftBar=draft&&draft.NOME_ALUNO?("<div class='draft-bar'><div><b>Rascunho encontrado</b><span>"+esc(draft.NOME_ALUNO)+" • "+esc(draft.SERIE_PRETENDIDA||"sem série")+" • salvo automaticamente</span></div><div><button class='btn btn-primary btn-sm' id='restoreDraft'>Retomar rascunho</button><button class='btn btn-soft btn-sm' id='discardDraft'>Descartar</button></div></div>"):"";
  $("#view").innerHTML=draftBar+"<div class='crm-hero'><div><span>ATENDIMENTO DE MATRÍCULAS</span><h2>Da primeira conversa à matrícula, em um único fluxo.</h2><p>Escolha ano e série. A proposta usa somente os valores publicados pela Gestão.</p></div><div class='crm-hero-kpi'><small>Em andamento</small><strong>"+at.filter(function(x){return x.STATUS==="Em andamento"}).length+"</strong></div></div>"+
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
  "<div class='field span-2'><label>Aluno já cadastrado</label><select id='attStudent'><option value=''>Novo / não localizado</option>"+studentOpts+"</select></div><div class='field'><label>Tipo</label><select name='TIPO_ALUNO' id='attType'><option>Novato</option><option>Veterano</option></select></div><div class='field span-2'><label>Nome do aluno *</label><input name='NOME_ALUNO' id='attName' required></div><div class='field'><label>Responsável *</label><input name='RESPONSAVEL' required></div><div class='field'><label>Telefone</label><input name='TELEFONE'></div><div class='field'><label>E-mail</label><input name='EMAIL' type='email'></div><div class='field'><label>Ano letivo *</label><select name='ANO_LETIVO' id='attYear'>"+yearOpts+"</select></div><div class='field'><label>Série pretendida *</label><select name='SERIE_PRETENDIDA' id='attSerie' required><option value=''>Selecione</option>"+gfOptions(resume?.SERIE_PRETENDIDA||"")+"</select></div><div class='field'><label>Turno</label><select name='TURNO'><option>Manhã</option><option>Tarde</option><option>Integral</option></select></div><div class='field'><label>Modalidade</label><input name='MODALIDADE' value='Regular'></div><div class='field'><label>Origem</label><select name='ORIGEM'><option></option><option>Instagram</option><option>Google</option><option>Indicação</option><option>WhatsApp</option><option>Aluno da casa</option><option>Outros</option></select></div><div class='field span-2'><label>Observações</label><textarea name='OBSERVACAO'></textarea></div></form></div>"+
  "<div class='card stage-card'><div class='section-head compact'><h2>Etapa</h2><span id='stagePct' class='pill'>"+GF_PCT[state.attendanceStage]+"%</span></div><div class='stage-flow' id='stageFlow'>"+gfStageButtons()+"</div><div class='progress-line'><i id='stageBar' style='width:"+GF_PCT[state.attendanceStage]+"%'></i></div></div><div id='catalogArea' class='empty card'>Escolha a série.</div><div class='crm-actions'><div><span class='muted'>Total apresentado</span><strong id='attTotal'>R$ 0,00</strong></div><button class='btn btn-primary' id='saveAttendance'>"+(state.currentAttendanceId?"Atualizar atendimento":"Salvar atendimento")+"</button></div><div class='section-head'><h2>Atendimentos salvos</h2><span class='muted'>Clique em “Continuar” para retomar depois.</span></div><div class='table-wrap'><table><thead><tr><th>Aluno</th><th>Ano</th><th>Série</th><th>Etapa</th><th>Status</th><th>Total</th><th></th></tr></thead><tbody>"+(recent||"<tr><td colspan='7' class='empty'>Nenhum atendimento salvo ainda.</td></tr>")+"</tbody></table></div>";

  function setHidden(name,value){var el=$("#attForm").elements[name];if(el)el.value=value==null?"":value}
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
    var list=gfCatalog(products,y,s),monthly=list.filter(function(p){return p.CATEGORIA==="Mensalidade"}),others=list.filter(function(p){return p.CATEGORIA!=="Mensalidade"}),annual=gfAnnualProduct(monthly),groups=gfGroups(others),disc=currentPlanDiscounts();
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
      "<div class='plan-results'><div><small>1ª parcela base</small><b id='planFirstBase'>"+money(plan.firstBase)+"</b></div><div><small>1ª parcela com desconto</small><b id='planFirstFinal'>"+money(plan.firstFinal)+"</b></div><div><small>"+plan.n+" parcelas base</small><b id='planRecurringBase'>"+money(plan.recurringBase)+"</b></div><div><small>"+plan.n+" parcelas com desconto</small><b id='planRecurringFinal'>"+money(plan.recurringFinal)+"</b></div><div class='total'><small>Total negociado</small><b id='planTotal'>"+money(plan.total)+"</b></div><div class='economy'><small>Economia</small><b id='planEconomy'>"+money(plan.economy)+"</b></div></div>"+
      "<div class='plan-note'><span>Resumo:</span><b id='planSummary'>"+gfPlanSummary(plan)+"</b><button type='button' class='btn btn-gold btn-sm "+((plan.discFirst||plan.discRecurring)?"":"hidden")+"' id='requestPlanDiscount'>Solicitar autorização desta condição</button></div></section>";
    }
    var html="<div class='section-head'><div><h2>Proposta automática • "+esc(s)+" • "+y+"</h2><span class='muted'>Mensalidade calculada pela anuidade + produtos e serviços escolhidos.</span></div><button class='btn btn-soft' id='flyerShortcut'>Panfleto da série</button></div>"+planHtml+"<div class='catalog-groups'>";
    Object.keys(groups).forEach(function(cat){
      html+="<section class='catalog-group'><h3>"+esc(cat)+"</h3><div class='catalog-grid'>";
      groups[cat].forEach(function(p){
        var checked=state.attendanceItems.has(p.ID_PRODUTO);
        html+="<article class='catalog-item "+(checked?"selected":"")+"'><label><input type='checkbox' data-att-product='"+esc(p.ID_PRODUTO)+"' "+(checked?"checked":"")+"><div><small>"+esc(p.SUBCATEGORIA||"")+"</small><strong>"+esc(p.PRODUTO)+"</strong><span>"+esc(p["DESCRIÇÃO"]||p["OBSERVAÇÃO"]||"")+"</span></div></label><div class='catalog-price'><b>"+money(p.VALOR_BASE)+"</b><button type='button' class='discount-link' data-discount='"+esc(p.ID_PRODUTO)+"'>Pedir desconto</button></div></article>";
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
      var extras=others.filter(function(p){return state.attendanceItems.has(p.ID_PRODUTO)}).reduce(function(a,p){return a+Number(p.VALOR_BASE||0)},0);
      $("#attTotal").textContent=money(gfRound2(calc.total+extras));
      gfSaveAttendanceDraft();
      return calc;
    }
    ["#planCount","#planDiscFirst","#planDiscRecurring"].forEach(function(sel){var el=$(sel);if(el){el.oninput=updatePlanAndTotal;el.onchange=updatePlanAndTotal}});
    $$("[data-att-product]").forEach(function(x){x.onchange=function(){x.checked?state.attendanceItems.add(x.dataset.attProduct):state.attendanceItems.delete(x.dataset.attProduct);gfSaveAttendanceDraft();drawCatalog()}});
    $$("[data-discount]").forEach(function(x){x.onclick=function(){openDiscountRequest(list.find(function(p){return p.ID_PRODUTO===x.dataset.discount}),{ano:y,serie:s})}});
    $("#requestPlanDiscount")?.addEventListener("click",async function(){
      var calc=updatePlanAndTotal();
      if(!state.currentAttendanceId)return alert("Salve o atendimento primeiro. Depois você pode enviar esta condição para autorização da Gestão.");
      var overall=calc.annualValue?gfRound2((calc.economy/calc.annualValue)*100):0;
      try{
        await api("solicitarDesconto",{token:tokenFor("staff"),data:{ID_ATENDIMENTO:state.currentAttendanceId,ID_PRODUTO:annual.ID_PRODUTO,ANO_LETIVO:y,SERIE:s,VALOR_TABELA:calc.annualValue,DESCONTO_SOLICITADO:overall,VALOR_SOLICITADO:calc.total,MOTIVO:"Plano 1ª parcela + "+calc.n+"x | desconto 1ª parcela: "+calc.discFirst+"% | desconto parcelas seguintes: "+calc.discRecurring+"% | "+gfPlanSummary(calc)}});
        setNotice("Condição enviada para autorização da Gestão.","ok");
      }catch(e){alert(e.message)}
    });
    $("#flyerShortcut").onclick=function(){gfSaveAttendanceDraft();state.flyerYear=y;state.flyerSeries=s;navigate("panfletos")};
    updatePlanAndTotal();
  }
  if(resume){
    gfApplyAttendanceForm(resume);
    if(resume.ID_ALUNO&&$("#attStudent"))$("#attStudent").value=resume.ID_ALUNO;
    if(resume.SERIE_PRETENDIDA)$("#attSerie").value=resume.SERIE_PRETENDIDA;
    if(resume.ANO_LETIVO)$("#attYear").value=String(resume.ANO_LETIVO);
  }
  $("#attSerie").onchange=function(){gfSaveAttendanceDraft();drawCatalog()};
  $("#attYear").onchange=function(){gfSaveAttendanceDraft();drawCatalog()};
  $$("#stageFlow [data-stage]").forEach(function(x){
    x.classList.toggle("active",x.dataset.stage===state.attendanceStage);
    x.onclick=function(){state.attendanceStage=x.dataset.stage;$$("#stageFlow [data-stage]").forEach(function(b){b.classList.toggle("active",b===x)});$("#stagePct").textContent=GF_PCT[state.attendanceStage]+"%";$("#stageBar").style.width=GF_PCT[state.attendanceStage]+"%";gfSaveAttendanceDraft()}
  });
  $("#attStudent").onchange=function(){var a=students.find(function(x){return x.ID_ALUNO===$("#attStudent").value});if(a){$("#attName").value=a.NOME_COMPLETO||"";$("#attType").value="Veterano";$("#attSerie").value=a["SÉRIE"]||"";drawCatalog()}gfSaveAttendanceDraft()};
  $("#attForm").addEventListener("input",function(){clearTimeout(state.attDraftTimer);state.attDraftTimer=setTimeout(function(){gfSaveAttendanceDraft();var el=$("#autosaveStatus");if(el){el.textContent="Rascunho salvo agora";setTimeout(function(){if($("#autosaveStatus"))$("#autosaveStatus").textContent="Rascunho automático ativo"},1200)}},350)});
  $("#attForm").addEventListener("change",gfSaveAttendanceDraft);
  $("#clearAttend").onclick=function(){state.currentAttendanceId="";state.resumeAttendance=null;state.resumeItems=[];state.attendanceItems=new Set();state.attendanceStage="Contato";gfClearAttendanceDraft();renderAtendimento()};
  $("#restoreDraft")?.addEventListener("click",function(){var d=gfLoadAttendanceDraft();if(!d)return;state.currentAttendanceId=d.ID_ATENDIMENTO||"";state.resumeAttendance=d;state.resumeItems=(d.ITENS||[]).map(function(id){return {ID_PRODUTO:id,SELECIONADO:"Sim"}});state.attendanceItems=new Set(d.ITENS||[]);state.attendanceStage=d.ETAPA||"Contato";renderAtendimento()});
  $("#discardDraft")?.addEventListener("click",function(){gfClearAttendanceDraft();$("#restoreDraft")?.closest(".draft-bar")?.remove()});
  $$("[data-resume-att]").forEach(function(btn){btn.onclick=function(){var rec=at.find(function(a){return a.ID_ATENDIMENTO===btn.dataset.resumeAtt});gfResumeAttendance(btn.dataset.resumeAtt,rec)}});
  $("#saveAttendance").onclick=async function(){
    var f=$("#attForm");if(!f.reportValidity())return;
    var data=Object.fromEntries(new FormData(f).entries());data.ID_ALUNO=$("#attStudent").value||"";data.ETAPA=state.attendanceStage;data.PROGRESSO=GF_PCT[state.attendanceStage];data.STATUS=state.attendanceStage==="Matriculado"?"Matriculado":state.attendanceStage==="Não converteu"?"Perdido":"Em andamento";
    var selected=gfCatalog(products,Number(data.ANO_LETIVO),data.SERIE_PRETENDIDA).filter(function(p){return p.CATEGORIA!=="Mensalidade"&&state.attendanceItems.has(p.ID_PRODUTO)}).map(function(p){return {ID_PRODUTO:p.ID_PRODUTO,PRODUTO:p.PRODUTO,CATEGORIA:p.CATEGORIA,SERIE:data.SERIE_PRETENDIDA,QTD:1,VALOR_TABELA:Number(p.VALOR_BASE||0),DESCONTO:0,VALOR_APRESENTADO:Number(p.VALOR_BASE||0),SELECIONADO:"Sim",OBSERVACAO:p["OBSERVAÇÃO"]||""}});
    var btn=$("#saveAttendance");btn.disabled=true;btn.textContent="Salvando…";
    try{
      var r=await api("salvarAtendimento",{token:tokenFor("staff"),data:data,itens:selected});
      state.currentAttendanceId=r.id;data.ID_ATENDIMENTO=r.id;state.resumeAttendance=data;state.resumeItems=selected;gfCacheSavedAttendance(r.id,data,selected);gfClearAttendanceDraft();
      setNotice("Atendimento "+esc(r.id)+" salvo. Plano: 1ª parcela + "+esc(data.PLANO_PARCELAS)+"x. Você pode continuar depois em “Atendimentos salvos”.","ok");
      await renderAtendimento();
    }catch(e){
      gfSaveAttendanceDraft();alert(e.message+" — O rascunho deste atendimento ficou salvo neste aparelho para você não perder os dados.");
      btn.disabled=false;btn.textContent=state.currentAttendanceId?"Atualizar atendimento":"Salvar atendimento";
    }
  };
  drawCatalog();
}

function openDiscountRequest(product,ctx){if(!state.currentAttendanceId)return alert("Salve o atendimento primeiro.");var v=Number(product&&product.VALOR_BASE||0);modal("<div class='modal-head'><h3>Solicitar condição especial</h3><button class='icon-btn' data-close>✕</button></div><div class='modal-body'><div class='approval-product'><b>"+esc(product.PRODUTO)+"</b><span>Tabela: "+money(v)+"</span></div><form id='discForm' class='form-grid'><div class='field'><label>Desconto %</label><input id='discPct' name='DESCONTO' type='number' step='.01' value='0'></div><div class='field'><label>Valor solicitado</label><input id='discVal' name='VALOR' type='number' step='.01' value='"+v.toFixed(2)+"'></div><div class='field span-3'><label>Motivo *</label><textarea name='MOTIVO' required></textarea></div></form></div><div class='modal-foot'><button class='btn btn-soft' data-close>Cancelar</button><button class='btn btn-primary' id='sendDisc'>Enviar para Gestão</button></div>");$$("[data-close]").forEach(function(x){x.onclick=closeModal});$("#discPct").oninput=function(){$("#discVal").value=(v*(1-(Number($("#discPct").value)||0)/100)).toFixed(2)};$("#sendDisc").onclick=async function(){var f=$("#discForm");if(!f.reportValidity())return;var d=Object.fromEntries(new FormData(f).entries());try{await api("solicitarDesconto",{token:tokenFor("staff"),data:{ID_ATENDIMENTO:state.currentAttendanceId,ID_PRODUTO:product.ID_PRODUTO,ANO_LETIVO:ctx.ano,SERIE:ctx.serie,VALOR_TABELA:v,DESCONTO_SOLICITADO:Number(d.DESCONTO||0),VALOR_SOLICITADO:Number(d.VALOR||0),MOTIVO:d.MOTIVO}});closeModal();setNotice("Pedido enviado para a Gestão.","ok")}catch(e){alert(e.message)}}}
async function renderAutorizacoes(){var list=await api("listarSolicitacoesDesconto",{token:state.adminToken}),pending=list.filter(function(x){return x.STATUS==="Aguardando"});triggerManagerAlert(pending.length);var cards=list.map(function(r){return "<article class='approval-card'><div class='approval-top'><div><b>"+esc(r.ALUNO||r.ID_ALUNO||"Aluno")+"</b><span>"+esc(r.SERIE||"")+" • "+esc(r.ANO_LETIVO||"")+"</span></div>"+pill(r.STATUS||"")+"</div><div class='approval-product'><b>"+esc(r.PRODUTO||r.ID_PRODUTO||"")+"</b></div><div class='approval-values'><div><small>Tabela</small><b>"+money(r.VALOR_TABELA)+"</b></div><div><small>Desconto</small><b>"+Number(r["DESCONTO_SOLICITADO_%"]||0).toFixed(2)+"%</b></div><div><small>Solicitado</small><b>"+money(r.VALOR_SOLICITADO)+"</b></div></div>"+(r.MOTIVO?"<p class='approval-note'><b>Pedido:</b> "+esc(r.MOTIVO)+"</p>":"")+(r.STATUS==="Aguardando"?"<div class='approval-actions'><button class='btn btn-primary' data-decide='Autorizado' data-id='"+esc(r.ID_SOLICITACAO)+"'>Autorizar</button><button class='btn btn-danger' data-decide='Negado' data-id='"+esc(r.ID_SOLICITACAO)+"'>Negar</button></div>":"")+"</article>"}).join("");$("#view").innerHTML="<div class='approval-hero'><div><span>CENTRAL DA DIREÇÃO</span><h2>Autorizações de desconto</h2><p>Pedidos da equipe sem alterar a tabela oficial.</p></div><button class='btn btn-gold' id='enableAlerts'>Ativar alertas</button></div><div class='cards grid'><div class='card metric'><div class='label'>Aguardando</div><div class='value'>"+pending.length+"</div></div><div class='card metric'><div class='label'>Autorizados</div><div class='value'>"+list.filter(function(x){return x.STATUS==="Autorizado"}).length+"</div></div><div class='card metric'><div class='label'>Negados</div><div class='value'>"+list.filter(function(x){return x.STATUS==="Negado"}).length+"</div></div><div class='card metric'><div class='label'>Concluídos</div><div class='value'>"+list.filter(function(x){return x.STATUS==="Concluído"}).length+"</div></div></div><div class='section-head'><h2>Fila de decisão</h2></div><div class='approval-list'>"+(cards||"<div class='card empty'>Nenhum pedido.</div>")+"</div>";$("#enableAlerts").onclick=requestManagerNotifications;$$("[data-decide]").forEach(function(b){b.onclick=function(){decisionModal(list.find(function(x){return x.ID_SOLICITACAO===b.dataset.id}),b.dataset.decide)}})}
function decisionModal(r,status){modal("<div class='modal-head'><h3>"+(status==="Autorizado"?"Autorizar":"Negar")+"</h3><button class='icon-btn' data-close>✕</button></div><div class='modal-body'><div class='form-grid'>"+(status==="Autorizado"?"<div class='field'><label>Valor autorizado</label><input id='authVal' type='number' step='.01' value='"+Number(r.VALOR_SOLICITADO||0).toFixed(2)+"'></div>":"")+"<div class='field span-3'><label>Observação</label><textarea id='authNote'></textarea></div></div></div><div class='modal-foot'><button class='btn btn-soft' data-close>Cancelar</button><button class='btn btn-primary' id='confirmDecision'>Confirmar</button></div>");$$("[data-close]").forEach(function(x){x.onclick=closeModal});$("#confirmDecision").onclick=async function(){try{await api("decidirSolicitacaoDesconto",{token:state.adminToken,id:r.ID_SOLICITACAO,status:status,valorAutorizado:status==="Autorizado"?Number($("#authVal").value||0):null,observacao:$("#authNote").value});closeModal();renderAutorizacoes()}catch(e){alert(e.message)}}}
async function requestManagerNotifications(){if("Notification" in window&&Notification.permission!=="granted")await Notification.requestPermission();navigator.vibrate&&navigator.vibrate([100,60,100]);setNotice("Alertas locais ativados.","ok")}
function triggerManagerAlert(count){var old=Number(sessionStorage.getItem("gf_pending_approvals")||0);sessionStorage.setItem("gf_pending_approvals",String(count));var b=$("#approvalBadge");if(b){b.textContent=count;b.classList.toggle("hidden",count<1)}if(count<=old||count<1)return;navigator.vibrate&&navigator.vibrate([240,120,240,120,300]);try{var C=window.AudioContext||window.webkitAudioContext,c=new C(),o=c.createOscillator(),g=c.createGain();o.frequency.value=880;g.gain.value=.05;o.connect(g);g.connect(c.destination);o.start();setTimeout(function(){o.stop();c.close()},250)}catch(e){}if("Notification" in window&&Notification.permission==="granted")new Notification("Gestão Futuro",{body:count+" pedido(s) aguardando decisão."})}
async function pollApprovals(){if(!state.adminToken)return;try{var l=await api("listarSolicitacoesDesconto",{token:state.adminToken});triggerManagerAlert(l.filter(function(x){return x.STATUS==="Aguardando"}).length)}catch(e){}}

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
function gfFlyerMarkup(y,s,cfg,list){
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
  return "<article class='flyer flyer-a4"+density+"' id='flyerPreview'>"+
    "<div class='flyer-head'>"+(window.FUTURO_BRAND&&window.FUTURO_BRAND.logo?"<img src='"+window.FUTURO_BRAND.logo+"' alt='Colégio Futuro'>":"")+
    "<div><span>MATRÍCULAS "+y+"</span><h2>"+esc(cfg.TITULO||("Colégio Futuro • "+s))+"</h2><p>"+esc(cfg.SUBTITULO||"Educação que prepara para o presente e impulsiona cada estudante para o futuro.")+"</p></div></div>"+
    "<div class='flyer-series'>"+esc(s)+"</div>"+
    "<div class='flyer-content-grid'>"+body+extrasHtml+offer+"</div>"+
    "<div class='flyer-cols'><section><h3>Novatos</h3><p>"+esc(cfg.DOCUMENTOS_NOVATO||"Documentação conforme orientação da Secretaria.")+"</p></section><section><h3>Veteranos</h3><p>"+esc(cfg.DOCUMENTOS_VETERANO||"Atualização cadastral e novo contrato.")+"</p></section></div>"+
    notes+
    "<footer><b>Colégio Futuro</b><span>Informações oficiais • Gestão Futuro</span></footer></article>";
}
function gfBindFlyerActions(y,s,cfg,list){
  $("#printFlyer").onclick=function(){
    var w=window.open("","_blank");if(!w)return alert("Permita pop-ups para gerar o PDF.");
    w.document.write("<!doctype html><html><head><meta charset='utf-8'><title>Panfleto "+esc(s)+" "+y+"</title><link rel='stylesheet' href='/styles.css'><style>@page{size:A4 portrait;margin:5mm}html,body{margin:0!important;padding:0!important;background:#fff!important}.flyer-actions{display:none!important}.flyer-a4{width:200mm!important;max-width:200mm!important;min-height:auto!important;margin:0 auto!important;box-shadow:none!important;border:0!important;border-radius:0!important;padding:6mm!important;box-sizing:border-box!important}</style></head><body>"+$("#flyerPreview").outerHTML+"<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>");
    w.document.close();
  };
  $("#editFlyer")?.addEventListener("click",function(){editFlyerContent(y,s,cfg)});
}
async function renderPanfletos(){
  var defaultYear=Number(state.flyerYear||2027),serie=state.flyerSeries||"Infantil 2";
  $("#view").innerHTML="<div class='section-head'><div><h2>Panfleto por série</h2><span class='muted'>Modelo vertical A4 • uma página • pronto para família.</span></div><div class='toolbar'><select id='flyerYear' class='search'><option>"+defaultYear+"</option><option>"+(defaultYear-1)+"</option></select><select id='flyerSerie' class='search'>"+gfOptions(serie)+"</select><button class='btn btn-primary' id='generateFlyer'>Atualizar</button></div></div><div id='flyerArea'><div class='card flyer-loading'><b>Carregando panfleto…</b><span class='muted'>Abrindo a visualização imediatamente e atualizando os dados em segundo plano.</span></div></div>";
  var products=[];
  try{
    products=state.catalogProducts||[];
    if(!products.length){
      products=await loadCatalogProducts();
    }
  }catch(e){
    try{var b=await loadBootstrap();products=b.produtos||[]}catch(_e){}
  }
  var years=[...new Set(products.map(gfYear).filter(Boolean))].sort(function(a,b){return b-a});
  if(years.length){
    if(!years.includes(defaultYear)) defaultYear=years[0];
    $("#flyerYear").innerHTML=years.map(function(y){return "<option value='"+y+"' "+(y===defaultYear?"selected":"")+">"+y+"</option>"}).join("");
  }
  async function generate(){
    var y=Number($("#flyerYear").value||defaultYear),s=$("#flyerSerie").value||serie;
    state.flyerYear=y;state.flyerSeries=s;
    var localList=gfCatalog(products,y,s),cacheKey=y+"|"+s,cached=state.flyerCache&&state.flyerCache[cacheKey],cfg=cached?.config||{};
    $("#flyerArea").innerHTML=gfFlyerMarkup(y,s,cfg,localList)+"<div class='flyer-actions'><button class='btn btn-primary' id='printFlyer'>Imprimir / Salvar PDF</button>"+(state.adminToken?"<button class='btn btn-gold' id='editFlyer'>Editar conteúdo e adicionais</button>":"")+"</div>";
    gfBindFlyerActions(y,s,cfg,localList);
    try{
      var d=await api("getPanfletoSerie",{token:tokenFor("staff"),ano:y,serie:s});
      state.flyerCache=state.flyerCache||{};state.flyerCache[cacheKey]=d;
      cfg=d.config||{};var list=gfCatalog(d.produtos||localList,y,s);
      $("#flyerArea").innerHTML=gfFlyerMarkup(y,s,cfg,list)+"<div class='flyer-actions'><button class='btn btn-primary' id='printFlyer'>Imprimir / Salvar PDF</button>"+(state.adminToken?"<button class='btn btn-gold' id='editFlyer'>Editar conteúdo e adicionais</button>":"")+"</div>";
      gfBindFlyerActions(y,s,cfg,list);
    }catch(e){setNotice("Panfleto exibido com os dados locais. A personalização não pôde ser atualizada agora: "+esc(e.message),"error")}
  }
  $("#generateFlyer").onclick=generate;$("#flyerYear").onchange=generate;$("#flyerSerie").onchange=generate;
  await generate();
}
function editFlyerContent(y,s,cfg){
  var extras=gfParseExtras(cfg.SERVICOS_ADICIONAIS);
  modal("<div class='modal-head'><h3>Conteúdo do panfleto</h3><button class='icon-btn' data-close>✕</button></div><div class='modal-body'><form id='flyerEdit' class='form-grid'>"+
    "<div class='field span-2'><label>Título</label><input name='TITULO' value='"+esc(cfg.TITULO||("Colégio Futuro • "+s))+"'></div>"+
    "<div class='field span-3'><label>Subtítulo</label><input name='SUBTITULO' value='"+esc(cfg.SUBTITULO||"")+"'></div>"+
    "<div class='field span-3'><label>O que oferece</label><textarea name='O_QUE_OFERECE'>"+esc(cfg.O_QUE_OFERECE||"")+"</textarea></div>"+
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
    try{
      var data=Object.fromEntries(new FormData($("#flyerEdit")).entries());
      data.SERVICOS_ADICIONAIS=JSON.stringify(gfExtrasJsonFromForm());
      await api("salvarPanfletoSerie",{token:state.adminToken,ano:y,serie:s,data:data});
      state.flyerCache=state.flyerCache||{};delete state.flyerCache[y+"|"+s];
      closeModal();renderPanfletos();
    }catch(e){alert(e.message)}
  };
}
