async function renderAlunos(){
  const b=await loadBootstrap(); const alunos=b.alunos||[];
  $("#view").innerHTML=`<div class="section-head"><h2>${alunos.length} aluno(s)</h2><div class="toolbar"><input class="search" id="studentSearch" placeholder="Buscar nome, CPF, série…"><button class="btn btn-primary" id="newStudent">+ Novo aluno</button></div></div><div id="studentsTable"></div>`;
  const draw=()=>{
    const q=$("#studentSearch").value.toLowerCase().trim();
    const list=alunos.filter(a=>[a.NOME_COMPLETO,a.CPF,a["SÉRIE"],a.TURMA].join(" ").toLowerCase().includes(q));
    $("#studentsTable").innerHTML=`<div class="table-wrap"><table><thead><tr><th>ID</th><th>Aluno</th><th>Série</th><th>Turno</th><th>Tipo</th><th>CPF</th><th>Status</th><th></th></tr></thead><tbody>${list.map(a=>`<tr><td>${esc(a.ID_ALUNO)}</td><td><strong>${esc(a.NOME_COMPLETO)}</strong><br><span class="muted">${esc(a.ESCOLA_ORIGEM||"")}</span></td><td>${esc(a["SÉRIE"]||"")}</td><td>${esc(a.TURNO||"")}</td><td>${pill(a.TIPO_ALUNO||"")}</td><td>${esc(a.CPF||"")}</td><td>${pill(a.STATUS||"",a.STATUS==="Ativo"?"ok":"")}</td><td><button class="icon-btn" data-edit-student="${esc(a.ID_ALUNO)}">Editar</button></td></tr>`).join("")||`<tr><td colspan="8" class="empty">Nenhum aluno encontrado.</td></tr>`}</tbody></table></div>`;
    $$('[data-edit-student]').forEach(x=>x.onclick=()=>openStudentForm(alunos.find(a=>a.ID_ALUNO===x.dataset.editStudent)));
  };
  $("#studentSearch").oninput=draw; $("#newStudent").onclick=()=>openStudentForm(); draw();
}

function seriesOptions(selected=""){ const s=["Infantil 2","Infantil 3","Infantil 4","Infantil 5","1º Ano","2º Ano","3º Ano","4º Ano","5º Ano","6º Ano","7º Ano","8º Ano","9º Ano","1º EM","2º EM","3º EM"]; return s.map(x=>`<option ${x===selected?"selected":""}>${x}</option>`).join(""); }
function openStudentForm(a={}){
  modal(`<div class="modal-head"><h3>${a.ID_ALUNO?"Editar aluno":"Novo aluno"}</h3><button class="icon-btn" data-close>✕</button></div><div class="modal-body"><form id="studentForm" class="form-grid">
    <div class="field span-2"><label>Nome completo *</label><input name="NOME_COMPLETO" value="${esc(a.NOME_COMPLETO||"")}" required></div><div class="field"><label>Nome social</label><input name="NOME_SOCIAL" value="${esc(a.NOME_SOCIAL||"")}"></div>
    <div class="field"><label>Data de nascimento</label><input type="date" name="DATA_NASCIMENTO" value="${esc(a.DATA_NASCIMENTO||"")}"></div><div class="field"><label>Ano letivo</label><input type="number" name="ANO_LETIVO" min="2026" max="2100" value="${esc(a.ANO_LETIVO||state.attendanceYear||(new Date().getFullYear()+1))}"></div><div class="field"><label>CPF</label><input name="CPF" inputmode="numeric" value="${esc(a.CPF||"")}"></div><div class="field"><label>RG</label><input name="RG" value="${esc(a.RG||"")}"></div>
    <div class="field"><label>Série *</label><select name="SÉRIE" required><option value="">Selecione</option>${seriesOptions(a["SÉRIE"]||"")}</select></div><div class="field"><label>Turma</label><input name="TURMA" value="${esc(a.TURMA||"")}"></div><div class="field"><label>Turno</label><select name="TURNO"><option ${a.TURNO==="Manhã"?"selected":""}>Manhã</option><option ${a.TURNO==="Tarde"?"selected":""}>Tarde</option><option ${a.TURNO==="Integral"?"selected":""}>Integral</option></select></div>
    <div class="field"><label>Tipo</label><select name="TIPO_ALUNO"><option ${a.TIPO_ALUNO==="Novato"?"selected":""}>Novato</option><option ${a.TIPO_ALUNO==="Veterano"?"selected":""}>Veterano</option></select></div><div class="field"><label>Modalidade</label><input name="MODALIDADE" value="${esc(a.MODALIDADE||"Regular")}"></div><div class="field"><label>Escola de origem</label><input name="ESCOLA_ORIGEM" value="${esc(a.ESCOLA_ORIGEM||"")}"></div>
    <div class="field"><label>CEP</label><input name="CEP" value="${esc(a.CEP||"")}"></div><div class="field span-2"><label>Logradouro</label><input name="LOGRADOURO" value="${esc(a.LOGRADOURO||"")}"></div><div class="field"><label>Número</label><input name="NUMERO" value="${esc(a.NUMERO||"")}"></div><div class="field"><label>Bairro</label><input name="BAIRRO" value="${esc(a.BAIRRO||"")}"></div><div class="field"><label>Cidade</label><input name="CIDADE" value="${esc(a.CIDADE||"Fortaleza")}"></div>
    <div class="field span-3"><label>Observações</label><textarea name="OBSERVAÇÕES">${esc(a["OBSERVAÇÕES"]||"")}</textarea></div>
  </form></div><div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="saveStudent">Salvar aluno</button></div>`);
  $$('[data-close]').forEach(x=>x.onclick=closeModal);
  $("#saveStudent").onclick=async()=>{
    const f=$("#studentForm"); if(!f.reportValidity()) return;
    const data=Object.fromEntries(new FormData(f).entries()); if(a.ID_ALUNO)data.ID_ALUNO=a.ID_ALUNO;
    const btn=$("#saveStudent");btn.disabled=true;btn.textContent="Salvando…";
    try{await api("salvarAluno",{token:tokenFor("staff"),data});state.bootstrap=null;closeModal();setNotice("Aluno salvo com sucesso.","ok");await renderAlunos();}catch(e){alert(e.message);btn.disabled=false;btn.textContent="Salvar aluno";}
  };
}

async function renderResponsaveis(){
  const b=await loadBootstrap();const rs=b.responsaveis||[], alunos=b.alunos||[];const names=Object.fromEntries(alunos.map(a=>[a.ID_ALUNO,a.NOME_COMPLETO]));
  $("#view").innerHTML=`<div class="section-head"><h2>Responsáveis</h2><div class="toolbar"><button class="btn btn-primary" id="newResp">+ Novo responsável</button></div></div><div class="table-wrap"><table><thead><tr><th>Responsável</th><th>Aluno</th><th>Parentesco</th><th>Telefone</th><th>E-mail</th><th>Financeiro</th></tr></thead><tbody>${rs.map(r=>`<tr><td><strong>${esc(r.NOME_COMPLETO)}</strong><br><span class="muted">${esc(r.CPF||"")}</span></td><td>${esc(names[r.ID_ALUNO]||r.ID_ALUNO||"")}</td><td>${esc(r.PARENTESCO||"")}</td><td>${esc(r.TELEFONE||"")}</td><td>${esc(r.EMAIL||"")}</td><td>${pill(r.RESPONSAVEL_FINANCEIRO||"")}</td></tr>`).join("")||`<tr><td colspan="6" class="empty">Nenhum responsável cadastrado.</td></tr>`}</tbody></table></div>`;
  $("#newResp").onclick=()=>openRespForm(alunos);
}
function openRespForm(alunos){
  modal(`<div class="modal-head"><h3>Novo responsável</h3><button class="icon-btn" data-close>✕</button></div><div class="modal-body"><form id="respForm" class="form-grid"><div class="field span-2"><label>Aluno *</label><select name="ID_ALUNO" required><option value="">Selecione</option>${alunos.map(a=>`<option value="${esc(a.ID_ALUNO)}">${esc(a.NOME_COMPLETO)} — ${esc(a["SÉRIE"]||"")}</option>`).join("")}</select></div><div class="field"><label>Parentesco</label><input name="PARENTESCO"></div><div class="field span-2"><label>Nome completo *</label><input name="NOME_COMPLETO" required></div><div class="field"><label>CPF</label><input name="CPF"></div><div class="field"><label>Telefone</label><input name="TELEFONE"></div><div class="field"><label>E-mail</label><input type="email" name="EMAIL"></div><div class="field"><label>Responsável financeiro</label><select name="RESPONSAVEL_FINANCEIRO"><option>Não</option><option>Sim</option></select></div><div class="field"><label>CEP</label><input name="CEP"></div><div class="field span-2"><label>Endereço</label><input name="ENDERECO"></div></form></div><div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="saveResp">Salvar</button></div>`);
  $$('[data-close]').forEach(x=>x.onclick=closeModal);$("#saveResp").onclick=async()=>{const f=$("#respForm");if(!f.reportValidity())return;const data=Object.fromEntries(new FormData(f).entries());try{await api("salvarResponsavel",{token:tokenFor("staff"),data});state.bootstrap=null;closeModal();await renderResponsaveis();}catch(e){alert(e.message)}};
}

async function renderMatriculas(){
  const b=await loadBootstrap();const mats=b.matriculas||[],alunos=b.alunos||[];const names=Object.fromEntries(alunos.map(a=>[a.ID_ALUNO,a.NOME_COMPLETO]));
  $("#view").innerHTML=`<div class="section-head"><h2>Matrículas</h2><div class="toolbar"><button class="btn btn-primary" id="newMat">+ Nova matrícula</button></div></div><div class="table-wrap"><table><thead><tr><th>Matrícula</th><th>Aluno</th><th>Ano</th><th>Série</th><th>Plano</th><th>Valor contratado</th><th>Documentos</th><th>Status</th></tr></thead><tbody>${mats.map(m=>`<tr><td>${esc(m["ID_MATRÍCULA"]||"")}</td><td><strong>${esc(names[m.ID_ALUNO]||m.ID_ALUNO||"")}</strong></td><td>${esc(m.ANO_LETIVO||"")}</td><td>${esc(m["SÉRIE"]||"")}</td><td>${esc(m.PLANO_PARCELAS||"")}x</td><td class="money">${money(m.VALOR_ANUIDADE_CONTRATADO)}</td><td>${pill(m.STATUS_DOCUMENTOS||"Pendente",m.STATUS_DOCUMENTOS==="Concluído"?"ok":"warn")}</td><td>${pill(m.STATUS||"",m.STATUS==="Ativa"?"ok":"")}</td></tr>`).join("")||`<tr><td colspan="8" class="empty">Nenhuma matrícula.</td></tr>`}</tbody></table></div>`;
  $("#newMat").onclick=()=>openMatForm(b);
}
function openMatForm(b){
  const alunos=b.alunos||[], resp=b.responsaveis||[], prods=(b.produtos||[]).filter(p=>p.ATIVO==="Sim");
  const inferYear=p=>Number(p.ANO_LETIVO)||Number((String(p.ID_PRODUTO||"")+" "+String(p.PRODUTO||"")).match(/20\d{2}/)?.[0])||0;
  const years=[...new Set(prods.map(inferYear).filter(Boolean))].sort((a,b)=>b-a);
  const currentYear=years[0]||new Date().getFullYear();
  const firstDue=`${currentYear}-01-05`;

  modal(`<div class="modal-head"><h3>Nova matrícula</h3><button class="icon-btn" data-close>✕</button></div><div class="modal-body"><form id="matForm" class="form-grid">
    <div class="field span-2"><label>Aluno *</label><select name="ID_ALUNO" id="matAluno" required><option value="">Selecione</option>${alunos.map(a=>`<option value="${esc(a.ID_ALUNO)}" data-serie="${esc(a["SÉRIE"]||"")}" data-turno="${esc(a.TURNO||"")}">${esc(a.NOME_COMPLETO)} — ${esc(a["SÉRIE"]||"")}</option>`).join("")}</select></div>
    <div class="field"><label>Ano letivo *</label><select name="ANO_LETIVO" id="matYear" required>${years.map(y=>`<option value="${y}">${y}</option>`).join("")}</select></div>
    <div class="field"><label>Série *</label><select name="SÉRIE" id="matSerie" required><option value="">Selecione</option>${seriesOptions()}</select></div>
    <div class="field"><label>Turno</label><select name="TURNO" id="matTurno"><option>Manhã</option><option>Tarde</option><option>Integral</option></select></div>
    <div class="field"><label>Tipo</label><select name="TIPO_MATRICULA"><option>Novato</option><option>Veterano</option></select></div>
    <div class="field span-2"><label>Plano / produto principal</label><select name="ID_PRODUTO_PLANO" id="matPlano"><option value="">Definir manualmente</option></select></div>
    <div class="field"><label>Parcelas</label><input type="number" name="PLANO_PARCELAS" value="12" min="1"></div>
    <div class="field"><label>Valor contratado</label><input type="number" step="0.01" name="VALOR_ANUIDADE_CONTRATADO" value="0"></div>
    <div class="field"><label>Dia vencimento</label><input type="number" name="DIA_VENCIMENTO" id="matDueDay" value="5" min="1" max="31"></div>
    <div class="field"><label>Primeiro vencimento</label><input type="date" name="PRIMEIRO_VENCIMENTO" id="matFirstDue" value="${firstDue}"></div>
    <div class="field span-2"><label>Responsável financeiro</label><select name="ID_RESP_FINANCEIRO" id="matResp"><option value="">Selecione o aluno primeiro</option></select></div>
    <div class="field span-3"><label>Produtos e serviços adicionais</label><div id="matServices" class="service-picker"><span class="muted">Escolha ano e série para carregar os serviços disponíveis.</span></div><div class="service-total"><span>Total dos adicionais selecionados</span><b id="matServicesTotal">R$ 0,00</b></div></div>
    <div class="field span-3"><label>Observação</label><textarea name="OBSERVAÇÃO"></textarea></div>
  </form></div><div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="saveMat">Criar matrícula</button></div>`);

  $$('[data-close]').forEach(x=>x.onclick=closeModal);

  const refreshPlans=()=>{
    const year=Number($("#matYear").value),serie=$("#matSerie").value||"";
    const available=(typeof gfCatalog==="function"&&serie)?gfCatalog(prods,year,serie):prods.filter(p=>inferYear(p)===year&&p.ATIVO==="Sim");
    const filtered=available.filter(p=>p.CATEGORIA==="Mensalidade");
    $("#matPlano").innerHTML=`<option value="">Definir manualmente</option>${filtered.map(p=>`<option value="${esc(p.ID_PRODUTO)}">${esc(p.PRODUTO)} — ${esc(p.SUBCATEGORIA||p.QTD_PARCELAS+" parcela(s)")} — ${money(p.VALOR_BASE)}</option>`).join("")}`;
    const services=available.filter(p=>p.CATEGORIA!=="Mensalidade"&&p.DISPONIVEL_MATRICULA!=="Não");
    $("#matServices").innerHTML=services.length?services.map(p=>`<label class="service-option"><input type="checkbox" data-mat-service="${esc(p.ID_PRODUTO)}"><span><b>${esc(p.PRODUTO)}</b><small>${esc(p.CATEGORIA||"")} • ${esc(p["DESCRIÇÃO"]||p["OBSERVAÇÃO"]||"")}</small></span><strong>${money(p.VALOR_BASE)}</strong></label>`).join(""):`<span class="muted">Nenhum produto ou serviço adicional disponível para esta série.</span>`;
    $("[data-mat-service]").forEach(x=>x.onchange=refreshServiceTotal);
    refreshServiceTotal();
  };
  const refreshServiceTotal=()=>{
    const ids=$("[data-mat-service]:checked").map(x=>x.dataset.matService);
    const total=prods.filter(p=>ids.includes(String(p.ID_PRODUTO))).reduce((s,p)=>s+Number(p.VALOR_BASE||0),0);
    $("#matServicesTotal").textContent=money(total);
    return {ids,total};
  };
  const syncFirstDue=()=>{
    const year=Number($("#matYear").value)||currentYear;
    const day=Math.max(1,Math.min(28,Number($("#matDueDay").value)||5));
    $("#matFirstDue").value=`${year}-01-${String(day).padStart(2,"0")}`;
  };
  refreshPlans();

  $("#matYear").onchange=()=>{refreshPlans();syncFirstDue();};
  $("#matSerie").onchange=refreshPlans;
  $("#matDueDay").onchange=syncFirstDue;
  $("#matAluno").onchange=()=>{
    const o=$("#matAluno").selectedOptions[0];
    if(o?.dataset.serie)$("#matSerie").value=o.dataset.serie;
    if(o?.dataset.turno)$("#matTurno").value=o.dataset.turno;
    refreshPlans();
    const id=$("#matAluno").value;
    const rr=resp.filter(r=>r.ID_ALUNO===id);
    $("#matResp").innerHTML=`<option value="">Selecione</option>${rr.map(r=>`<option value="${esc(r.ID_RESPONSAVEL)}">${esc(r.NOME_COMPLETO)}${r.RESPONSAVEL_FINANCEIRO==="Sim"?" • financeiro":""}</option>`).join("")}`;
  };
  $("#saveMat").onclick=async()=>{
    const f=$("#matForm");if(!f.reportValidity())return;
    const data=Object.fromEntries(new FormData(f).entries());
    const serviceInfo=refreshServiceTotal(),selectedServices=prods.filter(p=>serviceInfo.ids.includes(String(p.ID_PRODUTO)));
    data.SERVICOS_ADICIONAIS=JSON.stringify(selectedServices.map(p=>({ID_PRODUTO:p.ID_PRODUTO,PRODUTO:p.PRODUTO,CATEGORIA:p.CATEGORIA,VALOR:Number(p.VALOR_BASE||0)})));
    data.VALOR_SERVICOS_ADICIONAIS=serviceInfo.total;
    if(selectedServices.length){
      const resumo="Produtos/serviços adicionais: "+selectedServices.map(p=>p.PRODUTO+" ("+money(p.VALOR_BASE)+")").join("; ")+". Total adicionais: "+money(serviceInfo.total)+".";
      data["OBSERVAÇÃO"]=(data["OBSERVAÇÃO"]?data["OBSERVAÇÃO"]+"\n":"")+resumo;
    }
    const btn=$("#saveMat");btn.disabled=true;btn.textContent="Criando…";
    try{
      const res=await api("criarMatriculaCompleta",{token:tokenFor("staff"),data});
      state.bootstrap=null;closeModal();
      setNotice(`Matrícula ${esc(res.id)} criada para ${esc(data.ANO_LETIVO)}. ${res.parcelas||0} parcela(s) gerada(s).`,"ok");
      await renderMatriculas();
    }catch(e){alert(e.message);btn.disabled=false;btn.textContent="Criar matrícula";}
  };
}

async function renderDocumentos(){
  const b=await loadBootstrap();const alunos=b.alunos||[];
  $("#view").innerHTML=`<div class="section-head"><h2>Documentos do aluno</h2></div><div class="card"><div class="field"><label>Selecione um aluno</label><select id="docsAluno"><option value="">Selecione</option>${alunos.map(a=>`<option value="${esc(a.ID_ALUNO)}">${esc(a.NOME_COMPLETO)} — ${esc(a["SÉRIE"]||"")}</option>`).join("")}</select></div></div><div id="docsArea"></div>`;
  $("#docsAluno").onchange=async()=>{const id=$("#docsAluno").value;if(!id){$("#docsArea").innerHTML="";return;}$("#docsArea").innerHTML=`<div class="empty">Carregando…</div>`;try{const docs=await api("listarDocumentosAluno",{token:tokenFor("staff"),idAluno:id});$("#docsArea").innerHTML=`<div class="section-head"><h2>Checklist</h2></div><div class="table-wrap"><table><thead><tr><th>Documento</th><th>Obrigatório</th><th>Status</th><th>Entrega</th><th></th></tr></thead><tbody>${docs.map(d=>`<tr><td>${esc(d.DOCUMENTO)}</td><td>${esc(d.OBRIGATORIO||"")}</td><td>${pill(d.STATUS||"Pendente",d.STATUS==="Entregue"?"ok":"warn")}</td><td>${esc(d.DATA_ENTREGA||"")}</td><td><button class="icon-btn" data-doc="${esc(d.ID_DOCUMENTO)}" data-status="${esc(d.STATUS||"")}">${d.STATUS==="Entregue"?"Reabrir":"Marcar entregue"}</button></td></tr>`).join("")||`<tr><td colspan="5" class="empty">Sem documentos.</td></tr>`}</tbody></table></div>`;$$('[data-doc]').forEach(x=>x.onclick=async()=>{const novo=x.dataset.status==="Entregue"?"Pendente":"Entregue";await api("atualizarDocumento",{token:tokenFor("staff"),id:x.dataset.doc,data:{STATUS:novo}});$("#docsAluno").dispatchEvent(new Event("change"));});}catch(e){$("#docsArea").innerHTML=`<div class="notice error">${esc(e.message)}</div>`;}};
}

