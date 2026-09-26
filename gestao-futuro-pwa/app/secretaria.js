function gfStudentNorm(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
function gfNextSeries(serie){
  const map={"Infantil 2":"Infantil 3","Infantil 3":"Infantil 4","Infantil 4":"Infantil 5","Infantil 5":"1º Ano","1º Ano":"2º Ano","2º Ano":"3º Ano","3º Ano":"4º Ano","4º Ano":"5º Ano","5º Ano":"6º Ano","6º Ano":"7º Ano","7º Ano":"8º Ano","8º Ano":"9º Ano","9º Ano":"1º EM","1º EM":"2º EM","2º EM":"3º EM","3º EM":"Concluinte"};
  return map[String(serie||"")]||"";
}
function gfStudentSearchRows(alunos,q,limit=10){
  q=gfStudentNorm(q);if(!q)return [];
  return (alunos||[]).map(a=>{
    const name=gfStudentNorm(a.NOME_COMPLETO),mat=gfStudentNorm(a.MATRICULA_ORIGEM||""),id=gfStudentNorm(a.ID_ALUNO||""),serie=gfStudentNorm(a["SÉRIE"]||"");
    const starts=name.startsWith(q)||mat.startsWith(q)||id.startsWith(q);
    const hit=starts||name.includes(q)||mat.includes(q)||id.includes(q)||serie.includes(q);
    return {a,starts,hit};
  }).filter(x=>x.hit).sort((x,y)=>(x.starts===y.starts?String(x.a.NOME_COMPLETO||"").localeCompare(String(y.a.NOME_COMPLETO||""),"pt-BR"):x.starts?-1:1)).slice(0,limit).map(x=>x.a);
}
function gfStudentSuggestHtml(list){
  return list.map(a=>`<button type="button" class="student-suggest-item" data-student-pick="${esc(a.ID_ALUNO)}"><span><strong>${esc(a.NOME_COMPLETO||"")}</strong><small>${esc(a.MATRICULA_ORIGEM?"Matrícula "+a.MATRICULA_ORIGEM:"")}</small></span><b>${esc(a["SÉRIE"]||"")}<em>→ ${esc(a.PROXIMA_SERIE_2027||gfNextSeries(a["SÉRIE"])||"")}</em></b></button>`).join("");
}
async function renderAlunos(){
  const b=await loadBootstrap(); const alunos=b.alunos||[];
  const series=[...new Set(alunos.map(a=>a["SÉRIE"]).filter(Boolean))];
  $("#view").innerHTML=`
    <div class="student-migration-summary">
      <div><small>BASE ATUAL</small><strong>${alunos.length}</strong><span>alunos vinculados</span></div>
      <div><small>SÉRIES</small><strong>${series.length}</strong><span>da Educação Infantil ao 9º Ano</span></div>
      <div><small>MIGRAÇÃO</small><strong>${alunos.filter(a=>a.MATRICULA_ORIGEM).length}</strong><span>com matrícula de origem preservada</span></div>
      <div><small>PROGRESSÃO</small><strong>${alunos.filter(a=>a.PROXIMA_SERIE_2027).length}</strong><span>com série seguinte registrada</span></div>
    </div>
    <div class="section-head"><h2>${alunos.length} aluno(s)</h2><div class="toolbar student-toolbar">
      <div class="student-search-wrap"><input class="search" id="studentSearch" autocomplete="off" placeholder="Digite as primeiras letras do nome ou matrícula…"><div class="student-suggest hidden" id="studentSuggest"></div></div>
      <button class="btn btn-report" id="studentReport">📄 Relatórios</button><button class="btn btn-primary" id="newStudent">+ Novo aluno</button>
    </div></div><div id="studentsTable"></div>`;
  const bindRows=()=>{
    $$('[data-edit-student]').forEach(x=>x.onclick=()=>openStudentForm(alunos.find(a=>a.ID_ALUNO===x.dataset.editStudent)));
    $$('[data-doc-student]').forEach(x=>x.onclick=()=>{state.docsStudentId=x.dataset.docStudent;navigate("documentos")});
  };
  const draw=()=>{
    const q=$("#studentSearch").value.trim(),qn=gfStudentNorm(q);
    const list=!qn?alunos:alunos.filter(a=>[a.NOME_COMPLETO,a.CPF,a["SÉRIE"],a.TURMA,a.MATRICULA_ORIGEM,a.ID_ALUNO].some(v=>gfStudentNorm(v).includes(qn)));
    $("#studentsTable").innerHTML=`<div class="table-wrap"><table><thead><tr><th>Matrícula</th><th>Aluno</th><th>Série atual</th><th>Próxima série</th><th>Tipo</th><th>Status</th><th>Ações</th></tr></thead><tbody>${list.map(a=>`<tr><td><b>${esc(a.MATRICULA_ORIGEM||"—")}</b><br><span class="muted">${esc(a.ID_ALUNO)}</span></td><td><strong>${esc(a.NOME_COMPLETO)}</strong><br><span class="muted">${esc(a.TURMA||"")}</span></td><td>${esc(a["SÉRIE"]||"")}</td><td><span class="progression-chip">${esc(a.PROXIMA_SERIE_2027||gfNextSeries(a["SÉRIE"])||"—")}</span></td><td>${pill(a.TIPO_ALUNO||"")}</td><td>${pill(a.STATUS||"",a.STATUS==="Ativo"?"ok":"")}</td><td><div class="row-actions"><button class="icon-btn" data-edit-student="${esc(a.ID_ALUNO)}">Editar dados</button><button class="icon-btn" data-doc-student="${esc(a.ID_ALUNO)}">Documentos</button></div></td></tr>`).join("")||`<tr><td colspan="7" class="empty">Nenhum aluno encontrado.</td></tr>`}</tbody></table></div>`;
    bindRows();
    const sug=$("#studentSuggest"),matches=q?gfStudentSearchRows(alunos,q,8):[];
    if(matches.length){sug.innerHTML=gfStudentSuggestHtml(matches);sug.classList.remove("hidden");$$("[data-student-pick]").forEach(btn=>btn.onclick=()=>{const a=alunos.find(x=>x.ID_ALUNO===btn.dataset.studentPick);sug.classList.add("hidden");$("#studentSearch").value=a?.NOME_COMPLETO||"";openStudentForm(a||{})})}
    else{sug.innerHTML="";sug.classList.add("hidden")}
  };
  let searchFrame=0;
  $("#studentSearch").oninput=()=>{cancelAnimationFrame(searchFrame);searchFrame=requestAnimationFrame(draw)};
  $("#studentSearch").onfocus=()=>{if($("#studentSearch").value.trim())draw()};
  document.addEventListener("click",function closeSuggest(ev){if(!ev.target.closest(".student-search-wrap")){$("#studentSuggest")?.classList.add("hidden");document.removeEventListener("click",closeSuggest)}});
  $("#studentReport").onclick=()=>openStudentReport(alunos,"cadastro"); $("#newStudent").onclick=()=>openStudentForm(); draw();
}

function seriesOptions(selected=""){ const s=["Infantil 2","Infantil 3","Infantil 4","Infantil 5","1º Ano","2º Ano","3º Ano","4º Ano","5º Ano","6º Ano","7º Ano","8º Ano","9º Ano","1º EM","2º EM","3º EM"]; return s.map(x=>`<option ${x===selected?"selected":""}>${x}</option>`).join(""); }
function openStudentForm(a={}){
  const migrated=!!a.MATRICULA_ORIGEM,next=a.PROXIMA_SERIE_2027||gfNextSeries(a["SÉRIE"]||"");
  modal(`<div class="modal-head"><h3>${a.ID_ALUNO?"Editar aluno":"Novo aluno"}</h3><button class="icon-btn" data-close>✕</button></div><div class="modal-body">
    ${migrated?`<section class="migration-card"><div><small>MATRÍCULA DE ORIGEM</small><b>${esc(a.MATRICULA_ORIGEM||"")}</b></div><div><small>SÉRIE 2026</small><b>${esc(a.SERIE_ORIGEM_2026||a["SÉRIE"]||"")}</b></div><div><small>PROGRESSÃO 2027</small><b id="nextSeriesCard">${esc(next||"—")}</b></div><div><small>STATUS DA MIGRAÇÃO</small><b>${esc(a.PROGRESSAO_STATUS||"Migrado")}</b></div></section>`:""}
    <form id="studentForm" class="form-grid">
    <input type="hidden" name="MATRICULA_ORIGEM" value="${esc(a.MATRICULA_ORIGEM||"")}"><input type="hidden" name="STATUS_ORIGEM" value="${esc(a.STATUS_ORIGEM||"")}"><input type="hidden" name="SERIE_ORIGEM_2026" value="${esc(a.SERIE_ORIGEM_2026||"")}"><input type="hidden" name="PROXIMA_SERIE_2027" id="nextSeriesHidden" value="${esc(next)}"><input type="hidden" name="PROGRESSAO_STATUS" value="${esc(a.PROGRESSAO_STATUS||"Prevista para 2027")}"><input type="hidden" name="FONTE_MIGRACAO" value="${esc(a.FONTE_MIGRACAO||"")}"><input type="hidden" name="DATA_MIGRACAO" value="${esc(a.DATA_MIGRACAO||"")}"><input type="hidden" name="LOCAL_ORIGEM" value="${esc(a.LOCAL_ORIGEM||"")}">
    <div class="field span-2"><label>Nome completo *</label><input name="NOME_COMPLETO" value="${esc(a.NOME_COMPLETO||"")}" required></div><div class="field"><label>Nome social</label><input name="NOME_SOCIAL" value="${esc(a.NOME_SOCIAL||"")}"></div>
    <div class="field"><label>Data de nascimento</label><input type="date" name="DATA_NASCIMENTO" value="${esc(a.DATA_NASCIMENTO||"")}"></div><div class="field"><label>Ano letivo</label><input type="number" name="ANO_LETIVO" min="2026" max="2100" value="${esc(a.ANO_LETIVO||2026)}"></div><div class="field"><label>CPF</label><input name="CPF" inputmode="numeric" value="${esc(a.CPF||"")}"></div><div class="field"><label>RG</label><input name="RG" value="${esc(a.RG||"")}"></div>
    <div class="field"><label>Série *</label><select name="SÉRIE" id="studentSeries" required><option value="">Selecione</option>${seriesOptions(a["SÉRIE"]||"")}</select></div><div class="field"><label>Turma</label><input name="TURMA" value="${esc(a.TURMA||"")}"></div><div class="field"><label>Turno</label><select name="TURNO"><option value=""></option><option ${a.TURNO==="Manhã"?"selected":""}>Manhã</option><option ${a.TURNO==="Tarde"?"selected":""}>Tarde</option><option ${a.TURNO==="Integral"?"selected":""}>Integral</option></select></div>
    <div class="field"><label>Tipo</label><select name="TIPO_ALUNO"><option ${a.TIPO_ALUNO==="Novato"?"selected":""}>Novato</option><option ${a.TIPO_ALUNO==="Veterano"||!a.TIPO_ALUNO?"selected":""}>Veterano</option></select></div><div class="field"><label>Modalidade</label><input name="MODALIDADE" value="${esc(a.MODALIDADE||"Regular")}"></div><div class="field"><label>Status</label><select name="STATUS"><option ${a.STATUS==="Ativo"||!a.STATUS?"selected":""}>Ativo</option><option ${a.STATUS==="Inativo"?"selected":""}>Inativo</option></select></div>
    <div class="field span-2"><label>Responsável</label><input name="RESPONSÁVEL" value="${esc(a["RESPONSÁVEL"]||"")}"></div><div class="field"><label>Telefone</label><input name="TELEFONE" value="${esc(a.TELEFONE||"")}"></div><div class="field"><label>NIS</label><input name="NIS" value="${esc(a.NIS||"")}"></div>
    <div class="field"><label>Sexo</label><input name="SEXO" value="${esc(a.SEXO||"")}"></div><div class="field"><label>Nacionalidade</label><input name="NACIONALIDADE" value="${esc(a.NACIONALIDADE||"")}"></div><div class="field"><label>Naturalidade</label><input name="NATURALIDADE_CIDADE" value="${esc(a.NATURALIDADE_CIDADE||"")}"></div><div class="field"><label>UF naturalidade</label><input name="NATURALIDADE_UF" maxlength="2" value="${esc(a.NATURALIDADE_UF||"")}"></div>
    <div class="field"><label>Órgão expedidor</label><input name="ORGAO_EXPEDIDOR" value="${esc(a.ORGAO_EXPEDIDOR||"")}"></div><div class="field span-2"><label>Certidão de nascimento</label><input name="CERTIDAO_NASCIMENTO" value="${esc(a.CERTIDAO_NASCIMENTO||"")}"></div><div class="field"><label>Cartão SUS</label><input name="CARTAO_SUS" value="${esc(a.CARTAO_SUS||"")}"></div>
    <div class="field span-2"><label>Necessidade educacional</label><input name="NECESSIDADE_EDUCACIONAL" value="${esc(a.NECESSIDADE_EDUCACIONAL||"")}"></div><div class="field"><label>Deficiência</label><input name="DEFICIENCIA" value="${esc(a.DEFICIENCIA||"")}"></div><div class="field"><label>Alergia</label><input name="ALERGIA" value="${esc(a.ALERGIA||"")}"></div><div class="field"><label>Medicação</label><input name="MEDICACAO" value="${esc(a.MEDICACAO||"")}"></div>
    <div class="field"><label>Plano de saúde</label><input name="PLANO_SAUDE" value="${esc(a.PLANO_SAUDE||"")}"></div><div class="field"><label>Contato de emergência</label><input name="NOME_EMERGENCIA" value="${esc(a.NOME_EMERGENCIA||"")}"></div><div class="field"><label>Telefone emergência</label><input name="TELEFONE_EMERGENCIA" value="${esc(a.TELEFONE_EMERGENCIA||"")}"></div>
    <div class="field"><label>CEP</label><input name="CEP" value="${esc(a.CEP||"")}"></div><div class="field span-2"><label>Logradouro</label><input name="LOGRADOURO" value="${esc(a.LOGRADOURO||"")}"></div><div class="field"><label>Número</label><input name="NUMERO" value="${esc(a.NUMERO||"")}"></div><div class="field"><label>Complemento</label><input name="COMPLEMENTO" value="${esc(a.COMPLEMENTO||"")}"></div><div class="field"><label>Bairro</label><input name="BAIRRO" value="${esc(a.BAIRRO||"")}"></div><div class="field"><label>Cidade</label><input name="CIDADE" value="${esc(a.CIDADE||"")}"></div><div class="field"><label>UF</label><input name="UF" maxlength="2" value="${esc(a.UF||"")}"></div>
    <div class="field"><label>Cor/Raça</label><input name="COR_RACA" value="${esc(a.COR_RACA||"")}"></div><div class="field"><label>Religião</label><input name="RELIGIAO" value="${esc(a.RELIGIAO||"")}"></div><div class="field span-2"><label>Link/Pasta de documentos</label><input name="LINK_DOCUMENTOS" value="${esc(a.LINK_DOCUMENTOS||"")}"></div>
    <div class="field span-3"><label>Observações</label><textarea name="OBSERVAÇÕES">${esc(a["OBSERVAÇÕES"]||"")}</textarea></div>
  </form></div><div class="modal-foot">${a.ID_ALUNO?`<button class="btn btn-report" id="studentDocsBtn">📁 Documentos</button>`:""}<button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="saveStudent">Salvar aluno</button></div>`);
  $$$('[data-close]').forEach(x=>x.onclick=closeModal);
  const syncNext=()=>{const n=gfNextSeries($("#studentSeries").value);$("#nextSeriesHidden").value=n;if($("#nextSeriesCard"))$("#nextSeriesCard").textContent=n||"—"};
  $("#studentSeries").onchange=syncNext;
  if($("#studentDocsBtn"))$("#studentDocsBtn").onclick=()=>{state.docsStudentId=a.ID_ALUNO;closeModal();navigate("documentos")};
  $("#saveStudent").onclick=async()=>{
    const f=$("#studentForm"); if(!f.reportValidity()) return;
    syncNext();
    const data=Object.fromEntries(new FormData(f).entries());
    data.CLIENT_REQUEST_ID=data.CLIENT_REQUEST_ID||("MAT-"+Date.now()+"-"+Math.random().toString(36).slice(2)); if(a.ID_ALUNO)data.ID_ALUNO=a.ID_ALUNO;
    const btn=$("#saveStudent");btn.disabled=true;btn.textContent="Salvando…";
    try{await api("salvarAluno",{token:tokenFor("staff"),data});state.bootstrap=null;closeModal();setNotice("Aluno salvo com sucesso.","ok");await renderAlunos();}catch(e){alert(e.message);btn.disabled=false;btn.textContent="Salvar aluno";}
  };
}

async function renderResponsaveis(){
  const b=await loadBootstrap();const rs=b.responsaveis||[], alunos=b.alunos||[];const names=Object.fromEntries(alunos.map(a=>[a.ID_ALUNO,a.NOME_COMPLETO]));
  $("#view").innerHTML=`<div class="section-head"><h2>Responsáveis</h2><div class="toolbar"><button class="btn btn-report" id="respReport">📄 Relatório / Assinaturas</button><button class="btn btn-primary" id="newResp">+ Novo responsável</button></div></div><div class="table-wrap"><table><thead><tr><th>Responsável</th><th>Aluno</th><th>Parentesco</th><th>Telefone</th><th>E-mail</th><th>Financeiro</th></tr></thead><tbody>${rs.map(r=>`<tr><td><strong>${esc(r.NOME_COMPLETO)}</strong><br><span class="muted">${esc(r.CPF||"")}</span></td><td>${esc(names[r.ID_ALUNO]||r.ID_ALUNO||"")}</td><td>${esc(r.PARENTESCO||"")}</td><td>${esc(r.TELEFONE||"")}</td><td>${esc(r.EMAIL||"")}</td><td>${pill(r.RESPONSAVEL_FINANCEIRO||"")}</td></tr>`).join("")||`<tr><td colspan="6" class="empty">Nenhum responsável cadastrado.</td></tr>`}</tbody></table></div>`;
  $("#respReport").onclick=()=>openResponsibleReport(rs,alunos,"cadastro"); $("#newResp").onclick=()=>openRespForm(alunos);
}
function openRespForm(alunos){
  const lookup=alunos.map(a=>`<option value="${esc(a.NOME_COMPLETO+" — "+(a["SÉRIE"]||"")+" — "+(a.MATRICULA_ORIGEM||a.ID_ALUNO||""))}"></option>`).join("");
  modal(`<div class="modal-head"><h3>Novo responsável</h3><button class="icon-btn" data-close>✕</button></div><div class="modal-body"><form id="respForm" class="form-grid"><div class="field span-2"><label>Aluno *</label><input id="respStudentSearch" list="respStudentList" autocomplete="off" placeholder="Digite as primeiras letras…" required><datalist id="respStudentList">${lookup}</datalist><input type="hidden" name="ID_ALUNO" id="respStudentId"></div><div class="field"><label>Parentesco</label><input name="PARENTESCO"></div><div class="field span-2"><label>Nome completo *</label><input name="NOME_COMPLETO" required></div><div class="field"><label>CPF</label><input name="CPF"></div><div class="field"><label>Telefone</label><input name="TELEFONE"></div><div class="field"><label>E-mail</label><input type="email" name="EMAIL"></div><div class="field"><label>Responsável financeiro</label><select name="RESPONSAVEL_FINANCEIRO"><option>Não</option><option>Sim</option></select></div><div class="field"><label>CEP</label><input name="CEP"></div><div class="field span-2"><label>Endereço</label><input name="ENDERECO"></div></form></div><div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="saveResp">Salvar</button></div>`);
  $$('[data-close]').forEach(x=>x.onclick=closeModal);
  const resolveAluno=()=>{const q=gfStudentNorm($("#respStudentSearch").value),a=alunos.find(x=>gfStudentNorm(x.NOME_COMPLETO+" — "+(x["SÉRIE"]||"")+" — "+(x.MATRICULA_ORIGEM||x.ID_ALUNO||""))===q)||gfStudentSearchRows(alunos,$("#respStudentSearch").value,1)[0];$("#respStudentId").value=a?.ID_ALUNO||"";return a};
  $("#respStudentSearch").onchange=resolveAluno;
  $("#saveResp").onclick=async()=>{const f=$("#respForm");const a=resolveAluno();if(!a){showToast("Selecione um aluno da lista.","error");return}if(!f.reportValidity())return;const data=Object.fromEntries(new FormData(f).entries());try{await api("salvarResponsavel",{token:tokenFor("staff"),data});state.bootstrap=null;closeModal();await renderResponsaveis();}catch(e){alert(e.message)}};
}

async function renderMatriculas(){
  const b=await loadBootstrap();const mats=b.matriculas||[],alunos=b.alunos||[],itens=b.itensContrato||[];const names=Object.fromEntries(alunos.map(a=>[a.ID_ALUNO,a.NOME_COMPLETO]));
  $("#view").innerHTML=`<div class="section-head"><h2>Matrículas</h2><div class="toolbar"><button class="btn btn-report" id="matReport">📄 Relatório</button><button class="btn btn-primary" id="newMat">+ Nova matrícula</button></div></div><div class="table-wrap"><table><thead><tr><th>Matrícula</th><th>Aluno</th><th>Ano</th><th>Série</th><th>Plano</th><th>Valor contratado</th><th>Produtos/serviços</th><th>Documentos</th><th>Status</th></tr></thead><tbody>${mats.map(m=>{const mid=m["ID_MATRÍCULA"]||"",mi=itens.filter(x=>x["ID_MATRÍCULA"]===mid&&x.STATUS!=="Cancelado");return `<tr><td>${esc(mid)}</td><td><strong>${esc(names[m.ID_ALUNO]||m.ID_ALUNO||"")}</strong></td><td>${esc(m.ANO_LETIVO||"")}</td><td>${esc(m["SÉRIE"]||"")}</td><td>${esc(m.PLANO_PARCELAS||"")}x</td><td class="money">${money(m.VALOR_ANUIDADE_CONTRATADO)}</td><td>${mi.length?`<b>${mi.length} item(ns)</b><br><span class="muted">${esc(mi.slice(0,3).map(x=>x.PRODUTO).join(" • "))}${mi.length>3?"…":""}</span>`:"—"}</td><td>${pill(m.STATUS_DOCUMENTOS||"Pendente",m.STATUS_DOCUMENTOS==="Concluído"?"ok":"warn")}</td><td>${pill(m.STATUS||"",m.STATUS==="Ativa"?"ok":"")}</td></tr>`}).join("")||`<tr><td colspan="9" class="empty">Nenhuma matrícula.</td></tr>`}</tbody></table></div>`;
  $("#matReport").onclick=()=>openMatriculaReport(mats,alunos); $("#newMat").onclick=()=>openMatForm(b);
}
function openMatForm(b){
  const alunos=b.alunos||[], resp=b.responsaveis||[], prods=(b.produtos||[]).filter(p=>p.ATIVO==="Sim");
  const inferYear=p=>Number(p.ANO_LETIVO)||Number((String(p.ID_PRODUTO||"")+" "+String(p.PRODUTO||"")).match(/20\d{2}/)?.[0])||0;
  const years=[...new Set(prods.map(inferYear).filter(Boolean))].sort((a,b)=>b-a);
  const currentYear=years[0]||new Date().getFullYear();
  const firstDue=`${currentYear}-01-05`;

  modal(`<div class="modal-head"><h3>Nova matrícula</h3><button class="icon-btn" data-close>✕</button></div><div class="modal-body"><form id="matForm" class="form-grid">
    <div class="field span-2"><label>Aluno *</label><input id="matAlunoSearch" list="matAlunoList" autocomplete="off" placeholder="Digite as primeiras letras…" required><datalist id="matAlunoList">${alunos.map(a=>`<option value="${esc(a.NOME_COMPLETO+" — "+(a["SÉRIE"]||"")+" — "+(a.MATRICULA_ORIGEM||a.ID_ALUNO||""))}"></option>`).join("")}</datalist><select name="ID_ALUNO" id="matAluno" class="hidden" required><option value="">Selecione</option>${alunos.map(a=>`<option value="${esc(a.ID_ALUNO)}" data-serie="${esc(a["SÉRIE"]||"")}" data-turno="${esc(a.TURNO||"")}">${esc(a.NOME_COMPLETO)} — ${esc(a["SÉRIE"]||"")}</option>`).join("")}</select></div>
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

  $$$('[data-close]').forEach(x=>x.onclick=closeModal);

  const refreshPlans=()=>{
    const year=Number($("#matYear").value),serie=$("#matSerie").value||"";
    const available=prods.filter(p=>inferYear(p)===year&&p.ATIVO==="Sim"&&(!serie||typeof gfApplies!=="function"||gfApplies(p,serie)));
    const filtered=available.filter(p=>p.CATEGORIA==="Mensalidade");
    $("#matPlano").innerHTML=`<option value="">Definir manualmente</option>${filtered.map(p=>`<option value="${esc(p.ID_PRODUTO)}">${esc(p.PRODUTO)} — ${esc(p.SUBCATEGORIA||p.QTD_PARCELAS+" parcela(s)")} — ${money(p.VALOR_BASE)}</option>`).join("")}`;
    const services=available.filter(p=>p.CATEGORIA!=="Mensalidade"&&p.DISPONIVEL_MATRICULA!=="Não");
    $("#matServices").innerHTML=services.length?services.map(p=>`<label class="service-option"><input type="checkbox" data-mat-service="${esc(p.ID_PRODUTO)}"><span><b>${esc(p.PRODUTO)}</b><small>${esc(p.CATEGORIA||"")} • ${esc(p["DESCRIÇÃO"]||p["OBSERVAÇÃO"]||"")}</small></span><strong>${money(p.VALOR_BASE)}</strong></label>`).join(""):`<span class="muted">Nenhum produto ou serviço adicional disponível para esta série.</span>`;
    $$("[data-mat-service]").forEach(x=>x.onchange=refreshServiceTotal);
    refreshServiceTotal();
  };
  const refreshServiceTotal=()=>{
    const ids=$$("[data-mat-service]:checked").map(x=>x.dataset.matService);
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
    const selectedAluno=$("#matAluno").selectedOptions[0];
    data.NOME_ALUNO=(selectedAluno?.textContent||"").split(" — ")[0].trim();
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
      setNotice(`Matrícula ${esc(res.id)} criada para ${esc(data.ANO_LETIVO)}. ${res.parcelas||0} parcela(s) gerada(s) e ${res.servicos||0} produto(s)/serviço(s) adicional(is) integrado(s).`,"ok");
      appAlert("matricula","Matrícula realizada com sucesso ✓");
      await renderMatriculas();
    }catch(e){alert(e.message);btn.disabled=false;btn.textContent="Criar matrícula";}
  };
}

async function renderDocumentos(){
  const b=await loadBootstrap();const alunos=b.alunos||[];
  $("#view").innerHTML=`<div class="section-head"><h2>Documentos do aluno</h2></div>
  <div class="card student-doc-search-card"><div class="field"><label>Localizar aluno</label><div class="student-search-wrap"><input class="search" id="docsSearch" autocomplete="off" placeholder="Digite as primeiras letras do nome ou matrícula…"><div class="student-suggest hidden" id="docsSuggest"></div></div><small class="muted">A busca mostra nome, série atual e progressão para o próximo ano.</small></div></div>
  <div id="docsArea"></div>`;

  async function loadDocs(id){
    if(!id){$("#docsArea").innerHTML="";return}
    const aluno=alunos.find(a=>String(a.ID_ALUNO)===String(id))||{};
    state.docsStudentId=id;$("#docsSearch").value=aluno.NOME_COMPLETO||"";
    $("#docsSuggest").classList.add("hidden");
    $("#docsArea").innerHTML=`<div class="empty">Carregando documentos…</div>`;
    try{
      const docs=await api("listarDocumentosAluno",{token:tokenFor("staff"),idAluno:id});
      $("#docsArea").innerHTML=`
        <section class="student-doc-profile">
          <div><small>ALUNO</small><strong>${esc(aluno.NOME_COMPLETO||"")}</strong><span>${esc(aluno.MATRICULA_ORIGEM?"Matrícula "+aluno.MATRICULA_ORIGEM:"")}</span></div>
          <div><small>SÉRIE ATUAL</small><strong>${esc(aluno["SÉRIE"]||"—")}</strong></div>
          <div><small>PRÓXIMA SÉRIE</small><strong>${esc(aluno.PROXIMA_SERIE_2027||gfNextSeries(aluno["SÉRIE"])||"—")}</strong></div>
          <div><small>DOCUMENTOS</small><strong>${docs.length}</strong><span>${docs.filter(d=>d.STATUS==="Entregue").length} entregue(s)</span></div>
        </section>
        <div class="section-head"><h2>Checklist / Pasta documental</h2><div class="toolbar"><button class="btn btn-primary" id="addStudentDoc">+ Adicionar documento</button><button class="btn btn-report" id="docsReport">📄 Relatório</button></div></div>
        <div class="table-wrap"><table><thead><tr><th>Documento</th><th>Obrigatório</th><th>Status</th><th>Entrega</th><th>Link</th><th></th></tr></thead><tbody>${docs.map(d=>`<tr><td><strong>${esc(d.DOCUMENTO)}</strong><br><span class="muted">${esc(d.OBSERVACAO||"")}</span></td><td>${esc(d.OBRIGATORIO||"")}</td><td>${pill(d.STATUS||"Pendente",d.STATUS==="Entregue"?"ok":"warn")}</td><td>${esc(d.DATA_ENTREGA||"")}</td><td>${d.LINK_DRIVE?`<a href="${esc(d.LINK_DRIVE)}" target="_blank" rel="noopener noreferrer">Abrir</a>`:"—"}</td><td><button class="icon-btn" data-doc="${esc(d.ID_DOCUMENTO)}" data-status="${esc(d.STATUS||"")}">${d.STATUS==="Entregue"?"Reabrir":"Marcar entregue"}</button></td></tr>`).join("")||`<tr><td colspan="6" class="empty">Nenhum documento cadastrado ainda. Use “Adicionar documento” para iniciar a pasta do aluno.</td></tr>`}</tbody></table></div>`;
      $("#docsReport").onclick=()=>openDocumentsReport(aluno,docs);
      $("#addStudentDoc").onclick=()=>openAddDocument(aluno,docs);
      $$('[data-doc]').forEach(x=>x.onclick=async()=>{
        const novo=x.dataset.status==="Entregue"?"Pendente":"Entregue";
        x.disabled=true;x.textContent="Salvando…";
        try{
          await api("atualizarDocumento",{token:tokenFor("staff"),id:x.dataset.doc,data:{STATUS:novo,DATA_ENTREGA:novo==="Entregue"?new Date().toISOString().slice(0,10):""}});
          await loadDocs(id);
        }catch(e){showToast(e.message||"Não foi possível atualizar o documento.","error");x.disabled=false}
      });
    }catch(e){$("#docsArea").innerHTML=`<div class="notice error">${esc(e.message)}</div>`}
  }

  function openAddDocument(aluno,docs){
    modal(`<div class="modal-head"><h3>Adicionar documento</h3><button class="icon-btn" data-close>✕</button></div><div class="modal-body">
      <div class="report-intro"><b>${esc(aluno.NOME_COMPLETO||"")}</b><span>${esc(aluno["SÉRIE"]||"")} • ${esc(aluno.MATRICULA_ORIGEM?"Matrícula "+aluno.MATRICULA_ORIGEM:"")}</span></div>
      <form id="addDocForm" class="form-grid">
        <div class="field span-2"><label>Documento *</label><input name="DOCUMENTO" required placeholder="Ex.: Certidão de nascimento"></div>
        <div class="field"><label>Obrigatório</label><select name="OBRIGATORIO"><option>A conferir</option><option>Sim</option><option>Não</option><option>Condicional</option></select></div>
        <div class="field"><label>Status</label><select name="STATUS"><option>Pendente</option><option>Entregue</option><option>Dispensado</option></select></div>
        <div class="field"><label>Data de entrega</label><input type="date" name="DATA_ENTREGA"></div>
        <div class="field span-2"><label>Link do arquivo/pasta</label><input type="url" name="LINK_DRIVE" placeholder="https://..."></div>
        <div class="field span-3"><label>Observação</label><textarea name="OBSERVACAO"></textarea></div>
      </form></div><div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="saveNewDoc">Salvar documento</button></div>`);
    $$$('[data-close]').forEach(x=>x.onclick=closeModal);
    $("#saveNewDoc").onclick=async()=>{
      const form=$("#addDocForm");if(!form.reportValidity())return;
      const data=Object.fromEntries(new FormData(form).entries());data.ID_ALUNO=aluno.ID_ALUNO;
      const mat=(b.matriculas||[]).find(m=>String(m.ID_ALUNO)===String(aluno.ID_ALUNO)&&String(m.ANO_LETIVO||"")==="2026");
      if(mat)data.ID_MATRICULA=mat["ID_MATRÍCULA"]||mat.ID_MATRICULA||"";
      const btn=$("#saveNewDoc");btn.disabled=true;btn.textContent="Salvando…";
      try{await api("adicionarDocumentoAluno",{token:tokenFor("staff"),data});closeModal();state.bootstrap=null;await loadDocs(aluno.ID_ALUNO);showToast("Documento adicionado ✓","ok")}catch(e){showToast(e.message||"Não foi possível adicionar o documento.","error");btn.disabled=false;btn.textContent="Salvar documento"}
    };
  }

  const input=$("#docsSearch"),suggest=$("#docsSuggest");
  input.oninput=()=>{
    const q=input.value.trim(),matches=q?gfStudentSearchRows(alunos,q,10):[];
    if(matches.length){suggest.innerHTML=gfStudentSuggestHtml(matches).replaceAll("data-student-pick","data-doc-pick");suggest.classList.remove("hidden");$$("[data-doc-pick]").forEach(btn=>btn.onclick=()=>loadDocs(btn.dataset.docPick))}
    else{suggest.innerHTML="";suggest.classList.add("hidden")}
  };
  input.onfocus=()=>{if(input.value.trim())input.dispatchEvent(new Event("input"))};
  if(state.docsStudentId&&alunos.some(a=>String(a.ID_ALUNO)===String(state.docsStudentId)))await loadDocs(state.docsStudentId);
}


