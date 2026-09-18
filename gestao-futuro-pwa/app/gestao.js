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
    try{const res=await api("aplicarReajusteCatalogo",{token:state.adminToken,data});state.productYear=Number(data.anoDestino);closeModal();setNotice(`Reajuste aplicado em ${res.quantidade||0} produto(s). O catálogo ${data.anoDestino} está ${data.publicar==="Sim"?"publicado":"em rascunho"} para o Atendimento.`,"ok");await renderProdutos()}catch(e){alert(e.message);btn.disabled=false;btn.textContent="Aplicar reajuste"}
  };
}

function openIndividualAdjustment(list,years){
  const origem=Number(state.productYear||years[0]||2026),destino=origem+1;
  const source=list.filter(p=>Number(p.ANO_LETIVO)===origem);
  modal(\`<div class="modal-head"><h3>Reajuste individual</h3><button class="icon-btn" data-close>✕</button></div>
  <div class="modal-body"><div class="notice">Escolha um único produto ou serviço. Você pode aplicar percentual ou definir diretamente o novo valor para o ano de destino.</div>
  <form id="individualForm" class="form-grid">
    <div class="field"><label>Ano de origem</label><select name="anoOrigem" id="indOrigin">\${years.map(y=>\`<option value="\${y}" \${y===origem?"selected":""}>\${y}</option>\`).join("")}</select></div>
    <div class="field"><label>Ano de destino</label><input type="number" name="anoDestino" value="\${destino}" min="2026" max="2100" required></div>
    <div class="field span-2"><label>Produto / serviço</label><select name="idProduto" id="indProduct" required></select></div>
    <div class="field"><label>Modo</label><select name="modo" id="indMode"><option value="percentual">Percentual (%)</option><option value="valor">Novo valor</option></select></div>
    <div class="field"><label id="indValueLabel">Reajuste (%)</label><input type="number" step="0.01" name="valor" id="indValue" value="0" required></div>
    <div class="field"><label>Publicar no Atendimento</label><select name="publicar"><option>Sim</option><option>Não</option></select></div>
    <div class="field span-3"><label>Observação</label><input name="observacao" placeholder="Ex.: reajuste negociado individualmente para 2027"></div>
  </form></div>
  <div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="applyIndividual">Aplicar reajuste individual</button></div>\`);
  const fill=()=>{const y=Number($("#indOrigin").value),arr=list.filter(p=>Number(p.ANO_LETIVO)===y);$("#indProduct").innerHTML=arr.map(p=>\`<option value="\${esc(p.ID_PRODUTO)}">\${esc(p.PRODUTO)} • \${esc(p["SEGMENTO_SÉRIE"]||"")} • \${money(p.VALOR_BASE)}</option>\`).join("")};
  fill();$("#indOrigin").onchange=fill;$("#indMode").onchange=()=>{$("#indValueLabel").textContent=$("#indMode").value==="percentual"?"Reajuste (%)":"Novo valor (R$)"};
  $$('[data-close]').forEach(x=>x.onclick=closeModal);
  $("#applyIndividual").onclick=async()=>{
    const f=$("#individualForm");if(!f.reportValidity())return;
    const data=Object.fromEntries(new FormData(f).entries()),btn=$("#applyIndividual");btn.disabled=true;btn.textContent="Aplicando…";
    try{
      const res=await api("aplicarReajusteIndividual",{token:state.adminToken,data});
      state.productYear=Number(data.anoDestino);state.catalogProducts=null;state.bootstrap=null;closeModal();
      setNotice(\`Reajuste individual aplicado em \${esc(res.produto||data.idProduto)}. O item já fica disponível no catálogo \${data.anoDestino} conforme a publicação escolhida.\`,"ok");
      await renderProdutos();
    }catch(e){alert(e.message);btn.disabled=false;btn.textContent="Aplicar reajuste individual"}
  };
}

function openNewProductService(){
  const y=Number(state.productYear||new Date().getFullYear());
  modal(\`<div class="modal-head"><h3>Novo produto ou serviço</h3><button class="icon-btn" data-close>✕</button></div>
  <div class="modal-body"><div class="notice">Cadastro central. O que for publicado passa a alimentar automaticamente Atendimento, Panfletos e opções da Matrícula.</div>
  <form id="newServiceForm" class="form-grid">
    <div class="field"><label>Ano letivo</label><input type="number" name="ANO_LETIVO" value="\${y}" min="2026" max="2100" required></div>
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
  <div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="saveNewService">Cadastrar e integrar</button></div>\`);
  $$('[data-close]').forEach(x=>x.onclick=closeModal);
  $("#saveNewService").onclick=async()=>{
    const f=$("#newServiceForm");if(!f.reportValidity())return;const data=Object.fromEntries(new FormData(f).entries()),btn=$("#saveNewService");btn.disabled=true;btn.textContent="Integrando…";
    try{
      const res=await api("criarProdutoServico",{token:state.adminToken,data});
      state.productYear=Number(data.ANO_LETIVO);state.catalogProducts=null;state.bootstrap=null;state.flyerCache={};closeModal();
      setNotice(\`\${esc(data.PRODUTO)} cadastrado com ID \${esc(res.id)} e integrado ao catálogo oficial.\`,"ok");
      await renderProdutos();
    }catch(e){alert(e.message);btn.disabled=false;btn.textContent="Cadastrar e integrar"}
  };
}

function openProductForm(p){
  modal(\`<div class="modal-head"><h3>Editar produto / serviço</h3><button class="icon-btn" data-close>✕</button></div><div class="modal-body"><form id="prodForm" class="form-grid">
    <div class="field"><label>Ano letivo</label><input type="number" name="ANO_LETIVO" value="\${esc(p.ANO_LETIVO||state.productYear||"")}" min="2026" max="2100"></div>
    <div class="field"><label>Categoria</label><select name="CATEGORIA">\${["Mensalidade","Material Didático","Fardamento","Adicional","Serviço","Taxa","Outros"].map(x=>\`<option \${p.CATEGORIA===x?"selected":""}>\${x}</option>\`).join("")}</select></div>
    <div class="field"><label>Subcategoria</label><input name="SUBCATEGORIA" value="\${esc(p.SUBCATEGORIA||"")}"></div>
    <div class="field span-2"><label>Produto / serviço</label><input name="PRODUTO" value="\${esc(p.PRODUTO||"")}"></div>
    <div class="field"><label>Série / segmento</label><input name="SEGMENTO_SÉRIE" value="\${esc(p["SEGMENTO_SÉRIE"]||"")}"></div>
    <div class="field span-3"><label>Descrição para a família</label><textarea name="DESCRIÇÃO">\${esc(p["DESCRIÇÃO"]||"")}</textarea></div>
    <div class="field span-3"><label>Observação pública</label><textarea name="OBSERVAÇÃO">\${esc(p["OBSERVAÇÃO"]||"")}</textarea></div>
    <div class="field span-3"><label>Observação interna</label><textarea name="OBSERVACAO_INTERNA">\${esc(p.OBSERVACAO_INTERNA||"")}</textarea></div>
    <div class="field"><label>Tipo de cobrança</label><select name="TIPO_COBRANCA">\${["Única","Mensal","Parcelada","Anual","Opcional"].map(x=>\`<option \${p.TIPO_COBRANCA===x?"selected":""}>\${x}</option>\`).join("")}</select></div>
    <div class="field"><label>Valor base</label><input type="number" step="0.01" name="VALOR_BASE" value="\${esc(p.VALOR_BASE||0)}"></div>
    <div class="field"><label>Valor pós-vencimento</label><input type="number" step="0.01" name="VALOR_PÓS_VENCIMENTO" value="\${esc(p["VALOR_PÓS_VENCIMENTO"]||0)}"></div>
    <div class="field"><label>Valor crédito</label><input type="number" step="0.01" name="VALOR_CRÉDITO" value="\${esc(p["VALOR_CRÉDITO"]||0)}"></div>
    <div class="field"><label>Valor parcela</label><input type="number" step="0.01" name="VALOR_PARCELA" value="\${esc(p.VALOR_PARCELA||0)}"></div>
    <div class="field"><label>Qtd parcelas</label><input type="number" name="QTD_PARCELAS" value="\${esc(p.QTD_PARCELAS||1)}"></div>
    <div class="field"><label>Vencimento padrão</label><input name="VENCIMENTO_PADRÃO" value="\${esc(p.VENCIMENTO_PADRÃO||"")}"></div>
    <div class="field"><label>Disponível na matrícula</label><select name="DISPONIVEL_MATRICULA"><option \${p.DISPONIVEL_MATRICULA!=="Não"?"selected":""}>Sim</option><option \${p.DISPONIVEL_MATRICULA==="Não"?"selected":""}>Não</option></select></div>
    <div class="field"><label>Publicado no Atendimento/Panfleto</label><select name="PUBLICADO_ATENDIMENTO"><option \${p.PUBLICADO_ATENDIMENTO!=="Não"?"selected":""}>Sim</option><option \${p.PUBLICADO_ATENDIMENTO==="Não"?"selected":""}>Não</option></select></div>
    <div class="field"><label>Ativo</label><select name="ATIVO"><option \${p.ATIVO==="Sim"?"selected":""}>Sim</option><option \${p.ATIVO==="Não"?"selected":""}>Não</option></select></div>
    <div class="field"><label>Ordem de exibição</label><input type="number" name="ORDEM_EXIBICAO" value="\${esc(p.ORDEM_EXIBICAO||100)}"></div>
  </form></div><div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="saveProd">Salvar e sincronizar</button></div>\`);
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

async function renderRecebimentos(){
  const list=await api("listarRecebimentos",{token:state.adminToken});
  $("#view").innerHTML=`<div class="section-head"><h2>Contas a receber</h2></div><div class="table-wrap"><table><thead><tr><th>Recebimento</th><th>Aluno</th><th>Parcela</th><th>Vencimento</th><th>Previsto</th><th>Recebido</th><th>Status</th><th></th></tr></thead><tbody>${list.map(r=>`<tr><td>${esc(r.ID_RECEBIMENTO)}</td><td>${esc(r.ID_ALUNO)}</td><td>${esc(r.PARCELA||"")}</td><td>${esc(r.VENCIMENTO||"")}</td><td class="money">${money(r.VALOR_PREVISTO)}</td><td class="money">${money(r.VALOR_RECEBIDO)}</td><td>${pill(r.STATUS_CALCULADO||r.STATUS||"")}</td><td><button class="icon-btn" data-pay="${esc(r.ID_RECEBIMENTO)}">Receber</button></td></tr>`).join("")||`<tr><td colspan="8" class="empty">Sem recebimentos.</td></tr>`}</tbody></table></div>`;
  $$('[data-pay]').forEach(x=>x.onclick=()=>payModal(x.dataset.pay));
}
function payModal(id){modal(`<div class="modal-head"><h3>Registrar pagamento</h3><button class="icon-btn" data-close>✕</button></div><div class="modal-body"><div class="form-grid"><div class="field"><label>Recebimento</label><input value="${esc(id)}" disabled></div><div class="field"><label>Valor *</label><input id="payValue" type="number" step="0.01"></div><div class="field"><label>Forma</label><select id="payMethod"><option>Pix</option><option>Dinheiro</option><option>Cartão de débito</option><option>Cartão de crédito</option><option>Boleto/Transferência</option></select></div></div></div><div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="savePay">Confirmar</button></div>`);$$('[data-close]').forEach(x=>x.onclick=closeModal);$("#savePay").onclick=async()=>{try{await api("registrarPagamento",{token:state.adminToken,data:{ID_RECEBIMENTO:id,VALOR:$("#payValue").value,FORMA_PAGAMENTO:$("#payMethod").value}});closeModal();renderRecebimentos();}catch(e){alert(e.message)}};}

async function renderCaixa(){
  const list=await api("listarCaixa",{token:state.adminToken});
  $("#view").innerHTML=`<div class="section-head"><h2>Movimentações</h2><div class="toolbar"><button class="btn btn-primary" id="newMove">+ Movimento</button></div></div><div class="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Forma</th><th>Valor</th><th>Responsável</th></tr></thead><tbody>${list.slice().reverse().map(c=>`<tr><td>${esc(c.DATA||"")}</td><td>${pill(c.TIPO||"",c.TIPO==="Entrada"?"ok":"warn")}</td><td>${esc(c.CATEGORIA||"")}<br><span class="muted">${esc(c.SUBCATEGORIA||"")}</span></td><td>${esc(c["DESCRIÇÃO"]||"")}</td><td>${esc(c.FORMA_PAGAMENTO||"")}</td><td class="money">${money(c.VALOR)}</td><td>${esc(c["RESPONSÁVEL"]||"")}</td></tr>`).join("")||`<tr><td colspan="7" class="empty">Sem movimentos.</td></tr>`}</tbody></table></div>`;$("#newMove").onclick=openMoveModal;
}
async function openMoveModal(){let cats=[];try{cats=await api("listarCategorias",{token:state.adminToken});}catch{} modal(`<div class="modal-head"><h3>Novo movimento de caixa</h3><button class="icon-btn" data-close>✕</button></div><div class="modal-body"><form id="moveForm" class="form-grid"><div class="field"><label>Data</label><input type="date" name="DATA" value="${new Date().toISOString().slice(0,10)}"></div><div class="field"><label>Tipo *</label><select name="TIPO" id="moveType"><option>Entrada</option><option>Saída</option></select></div><div class="field"><label>Valor *</label><input type="number" step="0.01" name="VALOR" required></div><div class="field span-2"><label>Categoria *</label><select name="CATEGORIA" id="moveCat" required><option value="">Selecione</option>${cats.map(c=>`<option data-type="${esc(c.TIPO)}" value="${esc(c.CATEGORIA)}">${esc(c.TIPO)} — ${esc(c.CATEGORIA)} / ${esc(c.SUBCATEGORIA||"")}</option>`).join("")}</select></div><div class="field"><label>Forma</label><select name="FORMA_PAGAMENTO"><option>Pix</option><option>Dinheiro</option><option>Cartão</option><option>Boleto/Transferência</option></select></div><div class="field span-3"><label>Descrição</label><input name="DESCRIÇÃO"></div></form></div><div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="saveMove">Salvar</button></div>`);$$('[data-close]').forEach(x=>x.onclick=closeModal);$("#saveMove").onclick=async()=>{const f=$("#moveForm");if(!f.reportValidity())return;const data=Object.fromEntries(new FormData(f).entries());try{await api("salvarMovimentoCaixa",{token:state.adminToken,data});closeModal();renderCaixa();}catch(e){alert(e.message)}};}

async function renderFechamento(){
  const f=await api("getFechamento",{token:state.adminToken});
  const headers=f.headers||[], row=f.atual||[];
  $("#view").innerHTML=`<div class="section-head"><h2>Fechamento atual</h2></div><div class="cards grid">${headers.map((h,i)=>`<div class="card metric"><div class="label">${esc(h)}</div><div class="value" style="font-size:${i<3?"18":"23"}">${esc(row[i]||"—")}</div><div class="hint">período em acompanhamento</div></div>`).join("")}</div>`;
}

