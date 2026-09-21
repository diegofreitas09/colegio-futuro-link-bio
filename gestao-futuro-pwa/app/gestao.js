async function renderProdutos(){
  const list=await api("listarProdutosGestao",{token:state.adminToken});
  const inferYear=p=>Number(p.ANO_LETIVO)||Number((String(p.ID_PRODUTO||"")+" "+String(p.PRODUTO||"")).match(/20\d{2}/)?.[0])||0;
  const years=[...new Set(list.map(inferYear).filter(Boolean))].sort((a,b)=>b-a);
  const defaultYear=state.productYear&&years.includes(Number(state.productYear))?Number(state.productYear):(years[0]||new Date().getFullYear());
  state.productYear=defaultYear;

  $("#view").innerHTML=`<div class="section-head"><h2>Catálogo oficial</h2><div class="toolbar">
    <select id="prodYear" class="search" style="max-width:160px">${years.map(y=>`<option value="${y}" ${y===defaultYear?"selected":""}>${y}</option>`).join("")}</select>
    <input class="search" id="prodSearch" placeholder="Buscar produto, série…">
    <button class="btn btn-soft" id="newProductService">+ Produto/serviço</button>
    <button class="btn btn-gold" id="individualAdjustment">Reajuste individual</button>
    <button class="btn btn-primary" id="newSchoolYear">Reajuste em lote</button>
  </div></div>
  <div class="card" style="margin-bottom:14px"><strong>Ano letivo: <span id="yearLabel">${defaultYear}</span></strong><br><span class="muted">Cada ano mantém seu próprio catálogo e seus próprios valores. O histórico dos anos anteriores não é apagado.</span></div>
  <div id="prodTable"></div>`;

  const draw=()=>{
    const q=$("#prodSearch").value.toLowerCase();
    const year=Number($("#prodYear").value);
    state.productYear=year;
    $("#yearLabel").textContent=year;
    const arr=list.filter(p=>inferYear(p)===year && [p.PRODUTO,p.CATEGORIA,p["SEGMENTO_SÉRIE"]].join(" ").toLowerCase().includes(q));
    $("#prodTable").innerHTML=`<div class="table-wrap"><table><thead><tr><th>ID</th><th>Ano</th><th>Produto</th><th>Série</th><th>Valor base</th><th>Pós-vencimento</th><th>Parcelas</th><th>Publicado</th><th>Ativo</th><th></th></tr></thead><tbody>${arr.map(p=>`<tr><td>${esc(p.ID_PRODUTO)}</td><td><strong>${esc(inferYear(p)||"")}</strong></td><td><strong>${esc(p.PRODUTO)}</strong><br><span class="muted">${esc(p.CATEGORIA||"")}</span></td><td>${esc(p["SEGMENTO_SÉRIE"]||"")}</td><td class="money">${money(p.VALOR_BASE)}</td><td class="money">${money(p["VALOR_PÓS_VENCIMENTO"])}</td><td>${esc(p.QTD_PARCELAS||"")}</td><td>${pill(p.PUBLICADO_ATENDIMENTO||"Sim")}</td><td>${pill(p.ATIVO||"")}</td><td><button class="icon-btn" data-prod="${esc(p.ID_PRODUTO)}">Editar</button></td></tr>`).join("")||`<tr><td colspan="10" class="empty">Nenhum produto cadastrado para ${year}.</td></tr>`}</tbody></table></div>`;
    $$('[data-prod]').forEach(x=>x.onclick=()=>openProductForm(list.find(p=>p.ID_PRODUTO===x.dataset.prod)));
  };
  $("#prodSearch").oninput=draw;
  $("#prodYear").onchange=draw;
  $("#newSchoolYear").onclick=()=>openSchoolYearForm(years);
  $("#individualAdjustment").onclick=()=>openIndividualAdjustment(list,years);
  $("#newProductService").onclick=()=>openNewProductService();
  draw();
}

function openSchoolYearForm(years){
  const origem=Number(state.productYear||years[0]||2026),destino=origem+1;
  modal(`<div class="modal-head"><h3>Reajuste em lote</h3><button class="icon-btn" data-close>✕</button></div>
  <div class="modal-body"><div class="notice">A Gestão define o percentual uma vez e a plataforma cria/atualiza os valores do ano seguinte sem apagar o histórico.</div>
  <form id="yearForm" class="form-grid">
    <div class="field"><label>Ano de origem</label><select name="anoOrigem">${years.map(y=>`<option value="${y}" ${y===origem?"selected":""}>${y}</option>`).join("")}</select></div>
    <div class="field"><label>Ano de destino</label><input type="number" name="anoDestino" value="${destino}" min="2026" max="2100" required></div>
    <div class="field"><label>Reajuste (%)</label><input type="number" step="0.01" name="percentual" value="0" required></div>
    <div class="field"><label>Categoria</label><select name="categoria"><option>Todas</option><option>Mensalidade</option><option>Material Didático</option><option>Fardamento</option><option>Adicional</option><option>Serviço</option><option>Taxa</option><option>Outros</option></select></div>
    <div class="field"><label>Publicar no Atendimento</label><select name="publicar"><option>Sim</option><option>Não</option></select></div>
    <div class="field span-3"><label>Regra</label><div class="muted">Ex.: 2026 → 2027, 8%. O sistema calcula todos os itens selecionados; depois você pode ajustar qualquer produto individualmente.</div></div>
  </form></div>
  <div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="createYear">Aplicar reajuste</button></div>`);
  $$('[data-close]').forEach(x=>x.onclick=closeModal);
  $("#createYear").onclick=async()=>{
    const f=$("#yearForm");if(!f.reportValidity())return;const data=Object.fromEntries(new FormData(f).entries());
    const btn=$("#createYear");btn.disabled=true;btn.textContent="Aplicando…";
    try{const res=await api("aplicarReajusteCatalogo",{token:state.adminToken,data});state.productYear=Number(data.anoDestino);state.catalogProducts=null;state.bootstrap=null;state.flyerCache={};closeModal();setNotice(`Reajuste aplicado em ${res.quantidade||0} produto(s). O catálogo ${data.anoDestino} está ${data.publicar==="Sim"?"publicado":"em rascunho"} para o Atendimento.`,"ok");await renderProdutos()}catch(e){alert(e.message);btn.disabled=false;btn.textContent="Aplicar reajuste"}
  };
}

function openIndividualAdjustment(list,years){
  const origem=Number(state.productYear||years[0]||2026),destino=origem+1;
  const source=list.filter(p=>Number(p.ANO_LETIVO)===origem);
  modal(`<div class="modal-head"><h3>Reajuste individual</h3><button class="icon-btn" data-close>✕</button></div>
  <div class="modal-body"><div class="notice">Escolha um único produto ou serviço. Você pode aplicar percentual ou definir diretamente o novo valor para o ano de destino.</div>
  <form id="individualForm" class="form-grid">
    <div class="field"><label>Ano de origem</label><select name="anoOrigem" id="indOrigin">${years.map(y=>`<option value="${y}" ${y===origem?"selected":""}>${y}</option>`).join("")}</select></div>
    <div class="field"><label>Ano de destino</label><input type="number" name="anoDestino" value="${destino}" min="2026" max="2100" required></div>
    <div class="field span-2"><label>Produto / serviço</label><select name="idProduto" id="indProduct" required></select></div>
    <div class="field"><label>Modo</label><select name="modo" id="indMode"><option value="percentual">Percentual (%)</option><option value="valor">Novo valor</option></select></div>
    <div class="field"><label id="indValueLabel">Reajuste (%)</label><input type="number" step="0.01" name="valor" id="indValue" value="0" required></div>
    <div class="field"><label>Publicar no Atendimento</label><select name="publicar"><option>Sim</option><option>Não</option></select></div>
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
      state.productYear=Number(data.anoDestino);state.catalogProducts=null;state.bootstrap=null;closeModal();
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
    <div class="field"><label>Publicado no atendimento/panfleto</label><select name="PUBLICADO_ATENDIMENTO"><option>Sim</option><option>Não</option></select></div>
    <div class="field"><label>Ativo</label><select name="ATIVO"><option>Sim</option><option>Não</option></select></div>
    <div class="field"><label>Ordem de exibição</label><input type="number" name="ORDEM_EXIBICAO" value="100"></div>
  </form></div>
  <div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="saveNewService">Cadastrar e integrar</button></div>`);
  $$('[data-close]').forEach(x=>x.onclick=closeModal);
  $("#saveNewService").onclick=async()=>{
    const f=$("#newServiceForm");if(!f.reportValidity())return;const data=Object.fromEntries(new FormData(f).entries()),btn=$("#saveNewService");btn.disabled=true;btn.textContent="Integrando…";
    try{
      const res=await api("criarProdutoServico",{token:state.adminToken,data});
      state.productYear=Number(data.ANO_LETIVO);state.catalogProducts=null;state.bootstrap=null;state.flyerCache={};closeModal();
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
    <div class="field"><label>Publicado no Atendimento/Panfleto</label><select name="PUBLICADO_ATENDIMENTO"><option ${p.PUBLICADO_ATENDIMENTO!=="Não"?"selected":""}>Sim</option><option ${p.PUBLICADO_ATENDIMENTO==="Não"?"selected":""}>Não</option></select></div>
    <div class="field"><label>Ativo</label><select name="ATIVO"><option ${p.ATIVO==="Sim"?"selected":""}>Sim</option><option ${p.ATIVO==="Não"?"selected":""}>Não</option></select></div>
    <div class="field"><label>Ordem de exibição</label><input type="number" name="ORDEM_EXIBICAO" value="${esc(p.ORDEM_EXIBICAO||100)}"></div>
  </form></div><div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="saveProd">Salvar e sincronizar</button></div>`);
  $$('[data-close]').forEach(x=>x.onclick=closeModal);
  $("#saveProd").onclick=async()=>{
    const data=Object.fromEntries(new FormData($("#prodForm")).entries());
    try{
      await api("atualizarProduto",{token:state.adminToken,id:p.ID_PRODUTO,data});
      state.productYear=Number(data.ANO_LETIVO)||state.productYear;
      state.catalogProducts=null;state.bootstrap=null;state.flyerCache={};
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

