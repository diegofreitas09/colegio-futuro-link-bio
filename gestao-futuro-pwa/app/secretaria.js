function gfStudentNorm(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
function gfNextSeries(serie){
  const map={"Infantil 2":"Infantil 3","Infantil 3":"Infantil 4","Infantil 4":"Infantil 5","Infantil 5":"1º Ano","1º Ano":"2º Ano","2º Ano":"3º Ano","3º Ano":"4º Ano","4º Ano":"5º Ano","5º Ano":"6º Ano","6º Ano":"7º Ano","7º Ano":"8º Ano","8º Ano":"9º Ano","9º Ano":"1º EM","1º EM":"2º EM","2º EM":"3º EM","3º EM":"Concluinte"};
  return map[String(serie||"")]||"";
}
function gfSuggestedSeries(a,targetYear=2027){
  if(!a)return "";
  if(Number(targetYear)===2027)return a.PROXIMA_SERIE_2027||gfNextSeries(a.SERIE_ORIGEM_2026||a["SÉRIE"]||"");
  return gfNextSeries(a["SÉRIE"]||"");
}
function gfConfirmedSeries(a,targetYear=2027){
  if(!a)return "";
  if(Number(targetYear)===2027)return a.SERIE_CONFIRMADA_2027||"";
  return "";
}
function gfProgressionSituation(current,suggested,confirmed,stored=""){
  if(stored)return stored;
  if(!confirmed)return "Pendente de confirmação";
  if(confirmed===current)return "Retido / repetir série";
  if(confirmed===suggested)return "Aprovado / progredir";
  return "Definido manualmente";
}
function gfRematriculaStatus(a){
  return a?.REMATRICULA_STATUS|| (a?.SERIE_CONFIRMADA_2027?"Confirmada":"Não iniciada");
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
    $("#studentsTable").innerHTML=`<div class="table-wrap"><table><thead><tr><th>Matrícula</th><th>Aluno</th><th>Série 2026</th><th>Série sugerida 2027</th><th>Série confirmada 2027</th><th>Rematrícula</th><th>Ações</th></tr></thead><tbody>${list.map(a=>`<tr><td><b>${esc(a.MATRICULA_ORIGEM||"—")}</b><br><span class="muted">${esc(a.ID_ALUNO)}</span></td><td><strong>${esc(a.NOME_COMPLETO)}</strong><br><span class="muted">${esc(a.TURMA||"")}</span></td><td>${esc(a.SERIE_ORIGEM_2026||a["SÉRIE"]||"")}</td><td><span class="progression-chip">${esc(gfSuggestedSeries(a,2027)||"—")}</span></td><td><span class="progression-chip confirmed">${esc(gfConfirmedSeries(a,2027)||"A confirmar")}</span></td><td>${pill(gfRematriculaStatus(a),a.REMATRICULA_STATUS==="Realizada"?"ok":"")}</td><td><div class="row-actions"><button class="icon-btn" data-edit-student="${esc(a.ID_ALUNO)}">Editar dados</button><button class="icon-btn" data-doc-student="${esc(a.ID_ALUNO)}">Documentos</button></div></td></tr>`).join("")||`<tr><td colspan="7" class="empty">Nenhum aluno encontrado.</td></tr>`}</tbody></table></div>`;
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
  const migrated=!!a.MATRICULA_ORIGEM,next=gfSuggestedSeries(a,2027),confirmed=gfConfirmedSeries(a,2027);
  modal(`<div class="modal-head"><h3>${a.ID_ALUNO?"Editar aluno":"Novo aluno"}</h3><button class="icon-btn" data-close>✕</button></div><div class="modal-body">
    ${migrated?`<section class="migration-card"><div><small>MATRÍCULA DE ORIGEM</small><b>${esc(a.MATRICULA_ORIGEM||"")}</b></div><div><small>SÉRIE 2026</small><b>${esc(a.SERIE_ORIGEM_2026||a["SÉRIE"]||"")}</b></div><div><small>SÉRIE SUGERIDA 2027</small><b id="nextSeriesCard">${esc(next||"—")}</b></div><div><small>SÉRIE CONFIRMADA 2027</small><b>${esc(confirmed||"A confirmar")}</b></div><div><small>STATUS</small><b>${esc(gfRematriculaStatus(a))}</b></div></section>`:""}
    <form id="studentForm" class="form-grid">
    <input type="hidden" name="MATRICULA_ORIGEM" value="${esc(a.MATRICULA_ORIGEM||"")}"><input type="hidden" name="STATUS_ORIGEM" value="${esc(a.STATUS_ORIGEM||"")}"><input type="hidden" name="SERIE_ORIGEM_2026" value="${esc(a.SERIE_ORIGEM_2026||"")}"><input type="hidden" name="PROXIMA_SERIE_2027" id="nextSeriesHidden" value="${esc(next)}"><input type="hidden" name="FONTE_MIGRACAO" value="${esc(a.FONTE_MIGRACAO||"")}"><input type="hidden" name="DATA_MIGRACAO" value="${esc(a.DATA_MIGRACAO||"")}"><input type="hidden" name="LOCAL_ORIGEM" value="${esc(a.LOCAL_ORIGEM||"")}">
    <div class="field"><label>Resultado 2026</label><select name="RESULTADO_2026"><option value="" ${!a.RESULTADO_2026?"selected":""}>A definir</option><option ${a.RESULTADO_2026==="Aprovado"?"selected":""}>Aprovado</option><option ${a.RESULTADO_2026==="Retido"?"selected":""}>Retido</option></select></div><div class="field"><label>Série confirmada 2027</label><select name="SERIE_CONFIRMADA_2027"><option value="">A confirmar</option>${seriesOptions(confirmed)}</select></div><div class="field"><label>Status da rematrícula</label><select name="REMATRICULA_STATUS"><option ${gfRematriculaStatus(a)==="Não iniciada"?"selected":""}>Não iniciada</option><option ${gfRematriculaStatus(a)==="Em preparação"?"selected":""}>Em preparação</option><option ${gfRematriculaStatus(a)==="Realizada"?"selected":""}>Realizada</option><option ${gfRematriculaStatus(a)==="Corrigida"?"selected":""}>Corrigida</option></select></div><input type="hidden" name="PROGRESSAO_STATUS" value="${esc(a.PROGRESSAO_STATUS||"Prevista para 2027")}"><input type="hidden" name="REMATRICULA_ATUALIZADA_EM" value="${esc(a.REMATRICULA_ATUALIZADA_EM||"")}">
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
  $$('[data-close]').forEach(x=>x.onclick=closeModal);
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
  const loaded=await Promise.all([loadBootstrap(),loadCatalogProducts(true)]),b=loaded[0],catalog=loaded[1]||[];b.produtos=catalog;
  const mats=b.matriculas||[],alunos=b.alunos||[],itens=b.itensContrato||[];const names=Object.fromEntries(alunos.map(a=>[a.ID_ALUNO,a.NOME_COMPLETO]));
  const studentMap=Object.fromEntries(alunos.map(a=>[a.ID_ALUNO,a]));
  $("#view").innerHTML=`<div class="section-head"><h2>Matrículas</h2><div class="toolbar"><button class="btn btn-report" id="matReport">📄 Relatório</button><button class="btn btn-primary" id="newMat">+ Nova matrícula</button></div></div><div class="table-wrap"><table><thead><tr><th>Matrícula</th><th>Aluno</th><th>Ano</th><th>Série confirmada</th><th>Progressão</th><th>Plano</th><th>Valor contratado</th><th>Produtos/serviços</th><th>Status</th><th>Ações</th></tr></thead><tbody>${mats.map(m=>{const mid=m["ID_MATRÍCULA"]||"",mi=itens.filter(x=>x["ID_MATRÍCULA"]===mid&&x.STATUS!=="Cancelado"),a=studentMap[m.ID_ALUNO]||{},isRemat=String(m.TIPO_MATRICULA||"").toLowerCase()==="veterano"&&Number(m.ANO_LETIVO)===2027,origin=m.SERIE_ORIGEM||a.SERIE_ORIGEM_2026||a["SÉRIE"]||"",suggested=m.SERIE_SUGERIDA||gfSuggestedSeries(a,2027),sit=m.SITUACAO_PROGRESSAO||gfProgressionSituation(origin,suggested,m["SÉRIE"]||"",a.PROGRESSAO_STATUS||"");return `<tr><td>${esc(mid)}</td><td><strong>${esc(names[m.ID_ALUNO]||m.ID_ALUNO||"")}</strong><br><span class="muted">${esc(m.TIPO_MATRICULA||"")}</span></td><td>${esc(m.ANO_LETIVO||"")}</td><td><strong>${esc(m["SÉRIE"]||"")}</strong>${isRemat?`<br><span class="muted">sugerida: ${esc(suggested||"—")}</span>`:""}</td><td>${isRemat?pill(sit,/Retido/i.test(sit)?"warn":"ok"):"—"}</td><td>${esc(m.PLANO_PARCELAS||"")}x</td><td class="money">${money(m.VALOR_ANUIDADE_CONTRATADO)}</td><td>${mi.length?`<b>${mi.length} item(ns)</b><br><span class="muted">${esc(mi.slice(0,3).map(x=>x.PRODUTO).join(" • "))}${mi.length>3?"…":""}</span>`:"—"}</td><td>${pill(m.STATUS||"",m.STATUS==="Ativa"?"ok":"")}</td><td><div class="row-actions">${isRemat?(state.backendCaps.rematriculaCorrection===true?`<button class="icon-btn" data-correct-remat="${esc(mid)}">Corrigir série</button>`:`<button class="icon-btn" data-remat-pending="${esc(mid)}">Corrigir série</button>`):""}</div></td></tr>`}).join("")||`<tr><td colspan="10" class="empty">Nenhuma matrícula.</td></tr>`}</tbody></table></div>`;
  $("#matReport").onclick=()=>openMatriculaReport(mats,alunos); $("#newMat").onclick=()=>openMatForm(b);
  $$("[data-correct-remat]").forEach(btn=>btn.onclick=()=>openRematriculaCorrection(mats.find(m=>String(m["ID_MATRÍCULA"]||"")===String(btn.dataset.correctRemat)),studentMap, catalog));
  $$("[data-remat-pending]").forEach(btn=>btn.onclick=()=>setNotice("A interface de correção está pronta. Falta publicar a API 2026.09.30.1 do Apps Script para liberar a alteração pós-rematrícula com histórico.","error"));
}
function openRematriculaCorrection(m,studentMap,catalog){
  if(!m)return;
  const a=studentMap[m.ID_ALUNO]||{},current=m["SÉRIE"]||"",origin=m.SERIE_ORIGEM||a.SERIE_ORIGEM_2026||a["SÉRIE"]||"",suggested=m.SERIE_SUGERIDA||gfSuggestedSeries(a,2027),situation=m.SITUACAO_PROGRESSAO||gfProgressionSituation(origin,suggested,current,a.PROGRESSAO_STATUS||"");
  modal(`<div class="modal-head"><h3>Corrigir série da rematrícula</h3><button class="icon-btn" data-close>✕</button></div><div class="modal-body">
    <div class="rematricula-summary"><div><small>ALUNO</small><b>${esc(a.NOME_COMPLETO||m.ID_ALUNO||"")}</b></div><div><small>SÉRIE 2026</small><b>${esc(origin||"—")}</b></div><div><small>SUGERIDA 2027</small><b>${esc(suggested||"—")}</b></div><div><small>CONFIRMADA ATUAL</small><b>${esc(current||"—")}</b></div></div>
    <form id="rematCorrectionForm" class="form-grid">
      <div class="field"><label>Situação</label><select name="SITUACAO_PROGRESSAO" id="rematSituation"><option ${/Aprovado|progredir/i.test(situation)?"selected":""}>Aprovado / progredir</option><option ${/Retido|repetir/i.test(situation)?"selected":""}>Retido / repetir série</option><option ${/manual/i.test(situation)?"selected":""}>Definido manualmente</option></select></div>
      <div class="field"><label>Nova série confirmada *</label><select name="SERIE_CONFIRMADA" id="rematSeries" required><option value="">Selecione</option>${seriesOptions(current)}</select></div>
      <div class="field span-2"><label>Motivo / observação</label><textarea name="MOTIVO" required placeholder="Ex.: resultado final confirmou retenção no 6º Ano."></textarea></div>
      <div class="field span-3"><div class="notice warn"><b>Atenção:</b> a série da matrícula será alterada sem apagar o histórico. Se a nova série tiver valores diferentes, a plataforma recalculará a referência financeira e sinalizará a alteração.</div></div>
    </form></div><div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="saveRematCorrection">Salvar correção</button></div>`);
  $$("[data-close]").forEach(x=>x.onclick=closeModal);
  const sync=()=>{const s=$("#rematSituation").value;if(/Retido/.test(s))$("#rematSeries").value=origin;else if(/Aprovado/.test(s)&&suggested)$("#rematSeries").value=suggested};
  $("#rematSituation").onchange=sync;
  $("#saveRematCorrection").onclick=async()=>{
    const form=$("#rematCorrectionForm");if(!form.reportValidity())return;
    const d=Object.fromEntries(new FormData(form).entries()),btn=$("#saveRematCorrection");btn.disabled=true;btn.textContent="Corrigindo…";
    try{
      const res=await api("corrigirRematricula",{token:tokenFor("staff"),data:{ID_MATRICULA:m["ID_MATRÍCULA"],ID_ALUNO:m.ID_ALUNO,ANO_LETIVO:Number(m.ANO_LETIVO),SERIE_ORIGEM:origin,SERIE_SUGERIDA:suggested,SERIE_CONFIRMADA:d.SERIE_CONFIRMADA,SITUACAO_PROGRESSAO:d.SITUACAO_PROGRESSAO,MOTIVO:d.MOTIVO}});
      clearApiCache();closeModal();setNotice("Rematrícula corrigida: "+esc(current)+" → "+esc(d.SERIE_CONFIRMADA)+". Histórico preservado."+((res&&res.recalculado)?" Valores financeiros recalculados.":""),"ok");await renderMatriculas();
    }catch(e){showToast(e.message||"Não foi possível corrigir a rematrícula.","error");btn.disabled=false;btn.textContent="Salvar correção"}
  };
}

function openMatForm(b){
  const alunos=b.alunos||[], resp=b.responsaveis||[], prods=(b.produtos||[]).filter(p=>p.ATIVO==="Sim"&&String(p.PUBLICADO_ATENDIMENTO||"").trim().toLowerCase()==="sim");
  const inferYear=p=>Number(p.ANO_LETIVO)||Number((String(p.ID_PRODUTO||"")+" "+String(p.PRODUTO||"")).match(/20\d{2}/)?.[0])||0;
  const allYears=[...new Set(prods.map(inferYear).filter(Boolean))].sort((a,b)=>b-a);
  const flowYears=[2026,2027].filter(y=>allYears.includes(y)),years=flowYears.length?flowYears:allYears;
  const currentYear=years.includes(2027)?2027:(years[0]||new Date().getFullYear());
  const firstDue=`${currentYear}-01-05`;

  modal(`<div class="modal-head"><h3>Nova matrícula</h3><button class="icon-btn" data-close>✕</button></div><div class="modal-body"><form id="matForm" class="form-grid">
    <div class="field span-2"><label>Aluno *</label><input id="matAlunoSearch" list="matAlunoList" autocomplete="off" placeholder="Digite as primeiras letras…" required><datalist id="matAlunoList">${alunos.map(a=>`<option value="${esc(a.NOME_COMPLETO+" — "+(a["SÉRIE"]||"")+" — "+(a.MATRICULA_ORIGEM||a.ID_ALUNO||""))}"></option>`).join("")}</datalist><select name="ID_ALUNO" id="matAluno" class="hidden" required><option value="">Selecione</option>${alunos.map(a=>`<option value="${esc(a.ID_ALUNO)}" data-serie="${esc(a["SÉRIE"]||"")}" data-turno="${esc(a.TURNO||"")}">${esc(a.NOME_COMPLETO)} — ${esc(a["SÉRIE"]||"")}</option>`).join("")}</select></div>
    <div class="field"><label>Ano letivo *</label><select name="ANO_LETIVO" id="matYear" required>${years.map(y=>`<option value="${y}" ${y===currentYear?"selected":""}>${y}</option>`).join("")}</select></div>
    <div class="field"><label>Série *</label><select name="SÉRIE" id="matSerie" required><option value="">Selecione</option>${seriesOptions()}</select></div>
    <div class="field"><label>Turno</label><select name="TURNO" id="matTurno"><option>Manhã</option><option>Tarde</option><option>Integral</option></select></div>
    <div class="field"><label>Tipo</label><select name="TIPO_MATRICULA" id="matType"><option>Novato</option><option>Veterano</option></select></div>
    <input type="hidden" name="ANO_ORIGEM" id="matOriginYear"><input type="hidden" name="SERIE_ORIGEM" id="matOriginSeries"><input type="hidden" name="SERIE_SUGERIDA" id="matSuggestedSeries"><input type="hidden" name="REMATRICULA_DE" id="matRematFrom">
    <div class="field span-3 hidden" id="matProgressionCard"><div class="rematricula-flow-card"><div><small>SÉRIE 2026</small><b id="matOriginSeriesView">—</b></div><div><small>SÉRIE SUGERIDA PARA 2027</small><b id="matSuggestedSeriesView">—</b></div><div><small>SÉRIE CONFIRMADA NA REMATRÍCULA</small><b id="matConfirmedSeriesView">—</b></div><div class="field progression-choice"><label>Situação do aluno</label><select name="SITUACAO_PROGRESSAO" id="matProgressionSituation"><option>Aprovado / progredir</option><option>Retido / repetir série</option><option>Definido manualmente</option></select></div></div></div>
    <div class="field span-2"><label>Plano / produto principal</label><select name="ID_PRODUTO_PLANO" id="matPlano"><option value="">Definir manualmente</option></select></div>
    <div class="field"><label>Parcelas</label><input type="number" name="PLANO_PARCELAS" id="matPlanCount" value="12" min="1"></div>
    <div class="field"><label>Valor contratado</label><input type="number" step="0.01" name="VALOR_ANUIDADE_CONTRATADO" id="matAnnualValue" value="0"></div>
    <div class="field span-3"><div id="matCampaignInfo" class="mat-campaign-info"><span class="muted">Selecione ano e série para consultar a campanha vigente da 1ª parcela.</span></div></div>
    <div class="field"><label>Dia vencimento</label><input type="number" name="DIA_VENCIMENTO" id="matDueDay" value="5" min="1" max="31"></div>
    <div class="field"><label>Primeiro vencimento</label><input type="date" name="PRIMEIRO_VENCIMENTO" id="matFirstDue" value="${firstDue}"></div>
    <div class="field span-2"><label>Responsável financeiro</label><select name="ID_RESP_FINANCEIRO" id="matResp"><option value="">Selecione o aluno primeiro</option></select></div>
    <div class="field span-3"><label>Produtos e serviços adicionais</label><div id="matServices" class="service-picker"><span class="muted">Escolha ano e série para carregar os serviços disponíveis.</span></div><div class="service-total"><span>Total dos adicionais selecionados</span><b id="matServicesTotal">R$ 0,00</b></div></div>
    <div class="field span-3"><label>Observação</label><textarea name="OBSERVAÇÃO"></textarea></div>
  </form></div><div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="saveMat">Criar matrícula</button></div>`);

  $$('[data-close]').forEach(x=>x.onclick=closeModal);

  const refreshPlans=()=>{
    const year=Number($("#matYear").value),serie=$("#matSerie").value||"";
    const available=prods.filter(p=>inferYear(p)===year&&p.ATIVO==="Sim"&&(!serie||typeof gfApplies!=="function"||gfApplies(p,serie)));
    const filtered=available.filter(p=>p.CATEGORIA==="Mensalidade");
    $("#matPlano").innerHTML=`<option value="">Definir manualmente</option>${filtered.map(p=>`<option value="${esc(p.ID_PRODUTO)}">${esc(p.PRODUTO)} — ${esc(p.SUBCATEGORIA||p.QTD_PARCELAS+" parcela(s)")} — ${money(p.VALOR_BASE)}</option>`).join("")}`;
    const services=available.filter(p=>p.CATEGORIA!=="Mensalidade"&&!gfIsCampaignProduct(p)&&p.DISPONIVEL_MATRICULA!=="Não");
    $("#matServices").innerHTML=services.length?services.map(p=>`<label class="service-option"><input type="checkbox" data-mat-service="${esc(p.ID_PRODUTO)}"><span><b>${esc(p.PRODUTO)}</b><small>${esc(p.CATEGORIA||"")} • ${esc(p["DESCRIÇÃO"]||p["OBSERVAÇÃO"]||"")}</small></span><strong>${money(p.VALOR_BASE)}</strong></label>`).join(""):`<span class="muted">Nenhum produto ou serviço adicional disponível para esta série.</span>`;
    $$("[data-mat-service]").forEach(x=>x.onchange=refreshServiceTotal);
    refreshServiceTotal();
    refreshCampaign();
  };
  const refreshCampaign=()=>{
    const box=$("#matCampaignInfo");if(!box)return null;
    const year=Number($("#matYear").value),serie=$("#matSerie").value||"",studentType=$("#matType").value||"Todos";
    const available=prods.filter(p=>inferYear(p)===year&&p.ATIVO==="Sim"&&(!serie||typeof gfApplies!=="function"||gfApplies(p,serie)));
    const campaign=typeof gfCampaignFor==="function"?gfCampaignFor(available,year,serie,studentType,false):null;
    const campaignBase=typeof gfCampaignBaseAmount==="function"?gfCampaignBaseAmount(available,year,serie):0;
    if(!campaign||!campaignBase){
      box.dataset.campaignNote="";
      box.innerHTML="<span class='muted'>Nenhuma campanha ativa da 1ª parcela para este segmento e público.</span>";
      return null;
    }
    const meta=gfCampaignMeta(campaign),r=gfCampaignResult(campaignBase,campaign),condition=gfCampaignConditionText(campaign);
    box.dataset.campaignNote="Campanha da 1ª parcela: "+meta.name+" | base anuidade após vencimento ÷ 13 "+money(r.base)+" | desconto "+meta.discount+"% | valor final "+money(r.final)+" | "+condition;
    box.innerHTML="<div class='mat-campaign-head'><div><small>CAMPANHA VIGENTE</small><b>"+esc(meta.name)+"</b><span>"+esc(condition)+"</span></div><span class='pill ok'>Pré-autorizada</span></div>"+
      "<div class='mat-campaign-values'><div><small>Base • anuidade após vencimento ÷ 13</small><b>"+money(r.base)+"</b></div><div><small>1ª parcela com campanha</small><b>"+money(r.final)+"</b></div></div>";
    return {campaign:campaign,meta:meta,result:r};
  };
  const refreshServiceTotal=()=>{
    const ids=$$("[data-mat-service]:checked").map(x=>x.dataset.matService);
    const total=prods.filter(p=>ids.includes(String(p.ID_PRODUTO))).reduce((s,p)=>s+Number(p.VALOR_BASE||0),0);
    $("#matServicesTotal").textContent=money(total);
    return {ids,total};
  };
  const syncSelectedPlan=()=>{
    const id=$("#matPlano").value,p=prods.find(x=>String(x.ID_PRODUTO)===String(id));
    if(!p)return;
    const year=Number($("#matYear").value),serie=$("#matSerie").value||"";
    const available=prods.filter(x=>inferYear(x)===year&&x.ATIVO==="Sim"&&(!serie||typeof gfApplies!=="function"||gfApplies(x,serie)));
    const annual=available.find(x=>x.CATEGORIA==="Mensalidade"&&(String(x.SUBCATEGORIA||"").toLowerCase().includes("anuidade")||String(x.PRODUTO||"").toLowerCase().includes("anuidade")))||null;
    const q=Number(p.QTD_PARCELAS||0);
    if(q>1&&$("#matPlanCount"))$("#matPlanCount").value=q;
    if($("#matAnnualValue")){
      const v=annual?Number(annual.VALOR_BASE||0):(q===1?Number(p.VALOR_BASE||0):0);
      if(v)$("#matAnnualValue").value=v.toFixed(2);
    }
  };
  const syncFirstDue=()=>{
    const year=Number($("#matYear").value)||currentYear;
    const day=Math.max(1,Math.min(28,Number($("#matDueDay").value)||5));
    $("#matFirstDue").value=`${year}-01-${String(day).padStart(2,"0")}`;
  };
  refreshPlans();

  const selectedMatStudent=()=>alunos.find(a=>String(a.ID_ALUNO)===String($("#matAluno").value))||null;
  const syncProgressionCard=()=>{
    const a=selectedMatStudent(),year=Number($("#matYear").value),card=$("#matProgressionCard");
    if(!a){card?.classList.add("hidden");return}
    const origin=a.SERIE_ORIGEM_2026||a["SÉRIE"]||"",suggested=gfSuggestedSeries(a,year),priorConfirmed=year===2027?gfConfirmedSeries(a,2027):"";
    const isRemat=year===2027&&(a.TIPO_ALUNO==="Veterano"||!!a.MATRICULA_ORIGEM);
    $("#matType").value=isRemat?"Veterano":($("#matType").value||"Novato");
    if(!isRemat){
      card?.classList.add("hidden");
      $("#matOriginYear").value="";$("#matOriginSeries").value="";$("#matSuggestedSeries").value="";$("#matRematFrom").value="";
      if(a["SÉRIE"])$("#matSerie").value=a["SÉRIE"];
      refreshPlans();return;
    }
    const prior=(b.matriculas||[]).find(m=>String(m.ID_ALUNO)===String(a.ID_ALUNO)&&Number(m.ANO_LETIVO)===2026);
    $("#matOriginYear").value=2026;$("#matOriginSeries").value=origin;$("#matSuggestedSeries").value=suggested;$("#matRematFrom").value=prior?.["ID_MATRÍCULA"]||"";
    $("#matOriginSeriesView").textContent=origin||"—";$("#matSuggestedSeriesView").textContent=suggested||"—";
    let situation=a.RESULTADO_2026==="Retido"?"Retido / repetir série":a.RESULTADO_2026==="Aprovado"?"Aprovado / progredir":"Aprovado / progredir";
    $("#matProgressionSituation").value=situation;
    const target=priorConfirmed||(situation.startsWith("Retido")?origin:suggested)||origin;
    if(target)$("#matSerie").value=target;
    $("#matConfirmedSeriesView").textContent=$("#matSerie").value||"A confirmar";
    card?.classList.remove("hidden");refreshPlans();
  };
  const resolveMatStudent=()=>{
    const q=gfStudentNorm($("#matAlunoSearch").value),a=alunos.find(x=>gfStudentNorm(x.NOME_COMPLETO+" — "+(x["SÉRIE"]||"")+" — "+(x.MATRICULA_ORIGEM||x.ID_ALUNO||""))===q)||gfStudentSearchRows(alunos,$("#matAlunoSearch").value,1)[0];
    $("#matAluno").value=a?.ID_ALUNO||"";
    if(a){$("#matAlunoSearch").value=a.NOME_COMPLETO+" — "+(a["SÉRIE"]||"")+" — "+(a.MATRICULA_ORIGEM||a.ID_ALUNO||"");if(a.TURNO)$("#matTurno").value=a.TURNO}
    const rr=resp.filter(r=>r.ID_ALUNO===a?.ID_ALUNO);
    $("#matResp").innerHTML=`<option value="">Selecione</option>${rr.map(r=>`<option value="${esc(r.ID_RESPONSAVEL)}">${esc(r.NOME_COMPLETO)}${r.RESPONSAVEL_FINANCEIRO==="Sim"?" • financeiro":""}</option>`).join("")}`;
    syncProgressionCard();return a;
  };
  $("#matYear").onchange=()=>{syncProgressionCard();syncFirstDue();};
  $("#matSerie").onchange=()=>{if($("#matConfirmedSeriesView"))$("#matConfirmedSeriesView").textContent=$("#matSerie").value||"A confirmar";refreshPlans();};
  $("#matProgressionSituation").onchange=()=>{
    const a=selectedMatStudent();if(!a)return;
    const origin=a.SERIE_ORIGEM_2026||a["SÉRIE"]||"",suggested=gfSuggestedSeries(a,Number($("#matYear").value)),v=$("#matProgressionSituation").value;
    if(v.startsWith("Retido"))$("#matSerie").value=origin;else if(v.startsWith("Aprovado")&&suggested)$("#matSerie").value=suggested;
    $("#matConfirmedSeriesView").textContent=$("#matSerie").value||"A confirmar";refreshPlans();
  };
  $("#matPlano").onchange=syncSelectedPlan;
  $("#matType").onchange=refreshCampaign;
  $("#matDueDay").onchange=syncFirstDue;
  $("#matAluno").onchange=()=>{const a=selectedMatStudent();if(a)$("#matAlunoSearch").value=a.NOME_COMPLETO+" — "+(a["SÉRIE"]||"")+" — "+(a.MATRICULA_ORIGEM||a.ID_ALUNO||"");resolveMatStudent();};
  $("#matAlunoSearch").onchange=resolveMatStudent;
  $("#saveMat").onclick=async()=>{
    const picked=resolveMatStudent(),f=$("#matForm");if(!picked){showToast("Selecione um aluno válido.","error");return}if(!f.reportValidity())return;
    const data=Object.fromEntries(new FormData(f).entries());
    const selectedAluno=$("#matAluno").selectedOptions[0];
    data.NOME_ALUNO=(selectedAluno?.textContent||"").split(" — ")[0].trim();
    if(data.TIPO_MATRICULA==="Veterano"&&Number(data.ANO_LETIVO)===2027){
      data.SERIE_ORIGEM=data.SERIE_ORIGEM||picked.SERIE_ORIGEM_2026||picked["SÉRIE"]||"";
      data.SERIE_SUGERIDA=data.SERIE_SUGERIDA||gfSuggestedSeries(picked,2027);
      data.SITUACAO_PROGRESSAO=data.SITUACAO_PROGRESSAO||gfProgressionSituation(data.SERIE_ORIGEM,data.SERIE_SUGERIDA,data["SÉRIE"]);
    }
    const serviceInfo=refreshServiceTotal(),selectedServices=prods.filter(p=>serviceInfo.ids.includes(String(p.ID_PRODUTO)));
    data.SERVICOS_ADICIONAIS=JSON.stringify(selectedServices.map(p=>({ID_PRODUTO:p.ID_PRODUTO,PRODUTO:p.PRODUTO,CATEGORIA:p.CATEGORIA,VALOR:Number(p.VALOR_BASE||0)})));
    data.VALOR_SERVICOS_ADICIONAIS=serviceInfo.total;
    const campaignNote=$("#matCampaignInfo")?.dataset.campaignNote||"";
    if(campaignNote)data["OBSERVAÇÃO"]=(data["OBSERVAÇÃO"]?data["OBSERVAÇÃO"]+"\n":"")+campaignNote;
    if(selectedServices.length){
      const resumo="Produtos/serviços adicionais: "+selectedServices.map(p=>p.PRODUTO+" ("+money(p.VALOR_BASE)+")").join("; ")+". Total adicionais: "+money(serviceInfo.total)+".";
      data["OBSERVAÇÃO"]=(data["OBSERVAÇÃO"]?data["OBSERVAÇÃO"]+"\n":"")+resumo;
    }
    const btn=$("#saveMat");btn.disabled=true;btn.textContent="Criando…";
    try{
      const res=await api("criarMatriculaCompleta",{token:tokenFor("staff"),data});
      if(data.TIPO_MATRICULA==="Veterano"&&Number(data.ANO_LETIVO)===2027){
        const studentPatch=Object.assign({},picked,{
          ID_ALUNO:picked.ID_ALUNO,
          PROXIMA_SERIE_2027:data.SERIE_SUGERIDA||gfSuggestedSeries(picked,2027),
          SERIE_CONFIRMADA_2027:data["SÉRIE"],
          RESULTADO_2026:String(data.SITUACAO_PROGRESSAO||"").startsWith("Retido")?"Retido":"Aprovado",
          PROGRESSAO_STATUS:data.SITUACAO_PROGRESSAO||"Confirmada",
          REMATRICULA_STATUS:"Realizada",
          REMATRICULA_ATUALIZADA_EM:new Date().toISOString()
        });
        try{await api("salvarAluno",{token:tokenFor("staff"),data:studentPatch})}catch(_syncErr){}
      }
      clearApiCache();closeModal();
      setNotice(`Matrícula ${esc(res.id)} criada para ${esc(data.ANO_LETIVO)}. ${res.parcelas||0} parcela(s) gerada(s) e ${res.servicos||0} produto(s)/serviço(s) adicional(is) integrado(s).`,"ok");
      appAlert("matricula","Matrícula realizada com sucesso ✓");
      await renderMatriculas();
    }catch(e){alert(e.message);btn.disabled=false;btn.textContent="Criar matrícula";}
  };
}


function gfDocFormatBytes(bytes){
  const n=Number(bytes||0);if(!n)return "0 KB";
  if(n<1024*1024)return (n/1024).toLocaleString("pt-BR",{maximumFractionDigits:0})+" KB";
  return (n/1024/1024).toLocaleString("pt-BR",{maximumFractionDigits:1})+" MB";
}
function gfDocReadDataUrl(blob){
  return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||""));r.onerror=()=>reject(new Error("Não foi possível ler o arquivo."));r.readAsDataURL(blob)});
}
async function gfDocPrepareFile(file){
  const name=String(file&&file.name||"arquivo"),ext=(name.split(".").pop()||"").toLowerCase();
  const allowedExt=["pdf","jpg","jpeg","png","webp","doc","docx"];
  if(!allowedExt.includes(ext))throw new Error(name+": formato não permitido. Use PDF, imagem, DOC ou DOCX.");
  let blob=file,mime=file.type||({"pdf":"application/pdf","jpg":"image/jpeg","jpeg":"image/jpeg","png":"image/png","webp":"image/webp","doc":"application/msword","docx":"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}[ext]||"application/octet-stream"),outName=name;
  if(/^image\//.test(mime)&&file.size>1500000){
    const url=URL.createObjectURL(file);
    try{
      const img=await new Promise((resolve,reject)=>{const x=new Image();x.onload=()=>resolve(x);x.onerror=()=>reject(new Error(name+": imagem inválida."));x.src=url});
      const max=1800,scale=Math.min(1,max/Math.max(img.width,img.height)),w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale));
      const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;canvas.getContext("2d").drawImage(img,0,0,w,h);
      blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error(name+": falha ao compactar imagem.")),"image/jpeg",.84));
      mime="image/jpeg";outName=name.replace(/\.[^.]+$/,"")+".jpg";
    }finally{URL.revokeObjectURL(url)}
  }
  if(blob.size>4*1024*1024)throw new Error(outName+": arquivo acima de 4 MB. Compacte o documento antes do envio.");
  const dataUrl=await gfDocReadDataUrl(blob),base64=dataUrl.includes(",")?dataUrl.split(",")[1]:dataUrl;
  return {name:outName,mime:mime,size:blob.size,base64:base64};
}


const GF_DOCS_2026_RULES=Object.freeze([
  {id:"DOC-NOV-001",grupo:"Matrícula",documento:"Requerimento de matrícula 2026 preenchido e assinado",obrigatorio:"Sim",condicao:"Sempre",prazo:"Na matrícula"},
  {id:"DOC-NOV-002",grupo:"Matrícula",documento:"Contrato de Prestação de Serviços Educacionais 2026 assinado",obrigatorio:"Sim",condicao:"Sempre",prazo:"Na matrícula"},
  {id:"DOC-NOV-003",grupo:"Aluno",documento:"Pasta escolar",obrigatorio:"Sim",condicao:"Somente novatos • cor conforme segmento",prazo:"Na matrícula",novato:true},
  {id:"DOC-NOV-004",grupo:"Aluno",documento:"Cópia da Certidão de Nascimento ou Identidade",obrigatorio:"Sim",condicao:"Sempre",prazo:"Na matrícula",novato:true},
  {id:"DOC-NOV-005",grupo:"Aluno",documento:"Cópia do CPF e RG do pai e da mãe do aluno",obrigatorio:"Sim",condicao:"Sempre",prazo:"Na matrícula",novato:true},
  {id:"DOC-NOV-006",grupo:"Aluno",documento:"Dados do NIS",obrigatorio:"Condicional",condicao:"Se receber Bolsa Família",prazo:"Na matrícula",novato:true},
  {id:"DOC-NOV-007",grupo:"Aluno",documento:"Cópia do comprovante de endereço atual com CEP",obrigatorio:"Sim",condicao:"Emitido até 90 dias antes da matrícula",prazo:"Na matrícula",novato:true},
  {id:"DOC-NOV-008",grupo:"Aluno",documento:"2 fotos 3x4 coloridas e recentes",obrigatorio:"Sim",condicao:"Sempre",prazo:"Na matrícula",novato:true},
  {id:"DOC-NOV-009",grupo:"Aluno",documento:"Cartão de Vacinação",obrigatorio:"Sim",condicao:"Obrigatório na matrícula e rematrícula • Lei nº 16.929/2019 (CE)",prazo:"Na matrícula/rematrícula"},
  {id:"DOC-NOV-010",grupo:"Aluno",documento:"Atestado médico para prática de Educação Física",obrigatorio:"Sim",condicao:"Alunos do 1º ao 9º Ano",prazo:"Data informada no guia: 17/01/2025 • revisar",novato:true,series:"1-9"},
  {id:"DOC-NOV-011",grupo:"Aluno",documento:"Histórico Escolar original ou declaração provisória da escola de origem",obrigatorio:"Sim",condicao:"A partir do 2º Ano do Ensino Fundamental",prazo:"Histórico até 19/01/2026",novato:true,series:"2-9"},
  {id:"DOC-NOV-012",grupo:"Responsável financeiro",documento:"Cópia do RG e CPF do responsável financeiro",obrigatorio:"Sim",condicao:"Sempre",prazo:"Na matrícula"},
  {id:"DOC-NOV-013",grupo:"Responsável financeiro",documento:"Cópia do comprovante de residência do responsável financeiro",obrigatorio:"Sim",condicao:"Emitido até 90 dias antes da matrícula",prazo:"Na matrícula"},
  {id:"DOC-NOV-014",grupo:"Responsável financeiro",documento:"Contrato de prestação de serviços educacionais devidamente assinado",obrigatorio:"Sim",condicao:"Com valor da anuidade e formas de pagamento",prazo:"Na matrícula"},
  {id:"DOC-NOV-015",grupo:"Responsável financeiro",documento:"Comprovante de pagamento da 1ª parcela da anuidade de 2026",obrigatorio:"Sim",condicao:"Sempre",prazo:"Na efetivação"}
]);
function gfDocGradeNumber(serie){
  const s=String(serie||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase(),m=s.match(/\b([1-9])\s*(?:º|o)?\s*ano\b/);
  return m?Number(m[1]):0;
}
function gfDocFolderLabel(serie){
  const s=String(serie||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase(),n=gfDocGradeNumber(serie);
  if(s.includes("infantil"))return "Pasta escolar rosa (Educação Infantil)";
  if(n>=1&&n<=5)return "Pasta escolar amarela (Anos Iniciais)";
  if(n>=6&&n<=9)return "Pasta escolar verde (Anos Finais)";
  return "Pasta escolar conforme orientação da Secretaria";
}
function gfDocs2026ForStudent(aluno,mat,sourceRows){
  const serie=(mat&&mat["SÉRIE"])||aluno&&aluno["SÉRIE"]||"",n=gfDocGradeNumber(serie),tipo=String(mat&&mat.TIPO_MATRICULA||aluno&&aluno.TIPO_ALUNO||"Novato").toLowerCase(),isNovato=tipo!=="veterano";
  if(Array.isArray(sourceRows)&&sourceRows.length){
    const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    return sourceRows.filter(r=>{
      if(String(r.ATIVO||"Sim")==="Não"||String(r.PUBLICADO_SECRETARIA||"Sim")==="Não")return false;
      const t=norm(r.TIPO_MATRICULA||"Todos");
      if(t!=="todos"&&t!==tipo)return false;
      const appl=norm(r.SERIE_APLICAVEL||"Todos");
      if(appl.includes("1º ao 9º")||appl.includes("1o ao 9o"))return n>=1&&n<=9;
      if(appl.includes("2º ao 9º")||appl.includes("2o ao 9o"))return n>=2&&n<=9;
      if(appl==="todos")return true;
      return !serie||norm(serie).includes(appl)||appl.includes(norm(serie));
    }).map(r=>({
      id:r.ID_REGRA,
      grupo:r.PUBLICO||"Aluno",
      documento:String(r.DOCUMENTO||"").toLowerCase()==="pasta escolar"?gfDocFolderLabel(serie):r.DOCUMENTO,
      obrigatorio:r.OBRIGATORIO||"Sim",
      condicao:r.CONDICAO||"",
      prazo:r.PRAZO||"",
      novato:norm(r.TIPO_MATRICULA)==="novato"
    }));
  }
  return GF_DOCS_2026_RULES.filter(r=>{
    if(r.novato&&!isNovato)return false;
    if(r.series==="1-9"&&!(n>=1&&n<=9))return false;
    if(r.series==="2-9"&&!(n>=2&&n<=9))return false;
    return true;
  }).map(r=>r.id==="DOC-NOV-003"?{...r,documento:gfDocFolderLabel(serie)}:{...r});
}
function gfDocChecklistSummaryHtml(rules){
  const groups=["Matrícula","Aluno","Responsável financeiro"];
  return groups.map(g=>{
    const rows=rules.filter(r=>r.grupo===g);if(!rows.length)return "";
    return '<section class="official-doc-group"><h4>'+esc(g)+'</h4>'+rows.map(r=>'<div class="official-doc-row"><span class="official-doc-check">□</span><div><b>'+esc(r.documento)+'</b><small>'+esc(r.condicao)+(r.prazo?' • '+esc(r.prazo):'')+'</small></div><em>'+esc(r.obrigatorio)+'</em></div>').join("")+'</section>';
  }).join("");
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
      const mats=(b.matriculas||[]).filter(m=>String(m.ID_ALUNO)===String(id)).sort((a,z)=>Number(z.ANO_LETIVO||0)-Number(a.ANO_LETIVO||0));
      const mat=mats[0]||null;
      let centralRules=[];try{centralRules=await api("listarChecklistDocumentos",{token:tokenFor("staff"),ano:2026})}catch(e){}
      const officialRules=gfDocs2026ForStudent(aluno,mat,centralRules);
      const generatedIds=new Set(docs.map(d=>String(d.ID_REGRA||"")));
      const pendingOfficial=officialRules.filter(r=>!generatedIds.has(r.id));
      const isNovato=String(mat&&mat.TIPO_MATRICULA||aluno.TIPO_ALUNO||"Novato").toLowerCase()!=="veterano";
      $("#docsArea").innerHTML=`
        <section class="student-doc-profile">
          <div><small>ALUNO</small><strong>${esc(aluno.NOME_COMPLETO||"")}</strong><span>${esc(aluno.MATRICULA_ORIGEM?"Matrícula "+aluno.MATRICULA_ORIGEM:"")}</span></div>
          <div><small>SÉRIE ATUAL</small><strong>${esc(aluno["SÉRIE"]||"—")}</strong></div>
          <div><small>PRÓXIMA SÉRIE</small><strong>${esc(aluno.PROXIMA_SERIE_2027||gfNextSeries(aluno["SÉRIE"])||"—")}</strong></div>
          <div><small>DOCUMENTOS</small><strong>${docs.length}</strong><span>${docs.filter(d=>d.STATUS==="Entregue").length} entregue(s)</span></div>
        </section>
        <section class="official-docs-card">
          <div class="official-docs-head"><div><small>SECRETARIA • DOCUMENTAÇÃO 2026</small><h3>Documentos necessários para efetivação da matrícula</h3><p>${isNovato?"Aluno identificado como novato.":"Aluno identificado como veterano; itens exclusivos de novatos foram ocultados."}</p></div><span class="official-docs-count">${officialRules.length} item(ns)</span></div>
          <div class="official-docs-alert"><b>Importante:</b> o texto de origem informa prazo de <b>17/01/2025</b> para o atestado de Educação Física, embora o checklist seja de 2026. A plataforma sinaliza essa data para revisão administrativa e não a corrige automaticamente.</div>
          <div class="official-docs-grid">${gfDocChecklistSummaryHtml(officialRules)}</div>
          <div class="official-docs-actions"><button class="btn btn-primary" id="generateOfficialDocs" ${pendingOfficial.length?"":"disabled"}>${pendingOfficial.length?`Gerar ${pendingOfficial.length} pendência(s) no checklist`:"Checklist oficial já aplicado"}</button><span>${generatedIds.size?`${officialRules.length-pendingOfficial.length} item(ns) já vinculados ao aluno.`:"Os itens serão criados como Pendente, sem marcar entrega automaticamente."}</span></div>
        </section>
        <div class="section-head"><h2>Checklist / Pasta documental</h2><div class="toolbar"><button class="btn btn-primary" id="addStudentDoc">+ Adicionar documento</button><button class="btn btn-report" id="docsReport">📄 Relatório</button></div></div>
        <div class="table-wrap"><table><thead><tr><th>Documento</th><th>Obrigatório</th><th>Status</th><th>Entrega</th><th>Link</th><th></th></tr></thead><tbody>${docs.map(d=>`<tr><td><strong>${esc(d.DOCUMENTO)}</strong><br><span class="muted">${esc(d.OBSERVACAO||"")}</span></td><td>${esc(d.OBRIGATORIO||"")}</td><td>${pill(d.STATUS||"Pendente",d.STATUS==="Entregue"?"ok":"warn")}</td><td>${esc(d.DATA_ENTREGA||"")}</td><td>${d.LINK_DRIVE?`<a href="${esc(d.LINK_DRIVE)}" target="_blank" rel="noopener noreferrer">Abrir</a>`:"—"}</td><td><button class="icon-btn" data-doc="${esc(d.ID_DOCUMENTO)}" data-status="${esc(d.STATUS||"")}">${d.STATUS==="Entregue"?"Reabrir":"Marcar entregue"}</button></td></tr>`).join("")||`<tr><td colspan="6" class="empty">Nenhum documento cadastrado ainda. Use “Adicionar documento” para iniciar a pasta do aluno.</td></tr>`}</tbody></table></div>`;
      $("#docsReport").onclick=()=>openDocumentsReport(aluno,docs);
      $("#addStudentDoc").onclick=()=>openAddDocument(aluno,docs);
      if($("#generateOfficialDocs"))$("#generateOfficialDocs").onclick=async()=>{
        const btn=$("#generateOfficialDocs");if(!pendingOfficial.length)return;
        btn.disabled=true;const original=btn.textContent;
        try{
          let done=0;
          for(const rule of pendingOfficial){
            btn.textContent="Criando "+(done+1)+" de "+pendingOfficial.length+"…";
            await api("adicionarDocumentoAluno",{token:tokenFor("staff"),data:{
              ID_ALUNO:aluno.ID_ALUNO,
              ID_MATRICULA:mat&&(mat["ID_MATRÍCULA"]||mat.ID_MATRICULA)||"",
              ID_REGRA:rule.id,
              DOCUMENTO:rule.documento,
              STATUS:"Pendente",
              OBRIGATORIO:rule.obrigatorio,
              PENDENCIA:rule.condicao,
              OBSERVACAO:[rule.condicao,rule.prazo].filter(Boolean).join(" • ")
            }});
            done++;
          }
          clearApiCache();showToast("Checklist oficial 2026 vinculado ao aluno ✓","ok");await loadDocs(id);
        }catch(e){showToast(e.message||"Não foi possível gerar o checklist oficial.","error");btn.disabled=false;btn.textContent=original}
      };
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
    let selectedFiles=[];
    modal(`<div class="modal-head"><h3>Adicionar documentos</h3><button class="icon-btn" data-close>✕</button></div><div class="modal-body">
      <div class="report-intro"><b>${esc(aluno.NOME_COMPLETO||"")}</b><span>${esc(aluno["SÉRIE"]||"")} • ${esc(aluno.MATRICULA_ORIGEM?"Matrícula "+aluno.MATRICULA_ORIGEM:"")}</span></div>
      <form id="addDocForm" class="form-grid">
        <div class="field span-3">
          <label>Arquivos do dispositivo</label>
          <input id="docFilesInput" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" class="hidden">
          <div id="docDropZone" class="doc-dropzone" tabindex="0">
            <div class="doc-drop-icon">☁️</div>
            <b>Arraste e solte os documentos aqui</b>
            <span>ou escolha vários arquivos de uma vez no computador ou celular</span>
            <button type="button" class="btn btn-soft" id="pickDocFiles">Selecionar arquivos do dispositivo</button>
            <small>PDF, JPG, PNG, WEBP, DOC e DOCX • até 4 MB por arquivo • imagens grandes são compactadas automaticamente</small>
          </div>
          <div id="docFilesList" class="doc-files-list"></div>
        </div>
        <div class="field span-2"><label>Nome/categoria do documento</label><input name="DOCUMENTO" placeholder="Opcional. Com vários arquivos, o nome de cada arquivo será usado."></div>
        <div class="field"><label>Obrigatório</label><select name="OBRIGATORIO"><option>A conferir</option><option>Sim</option><option>Não</option><option>Condicional</option></select></div>
        <div class="field"><label>Status</label><select name="STATUS" id="docStatus"><option>Entregue</option><option>Pendente</option><option>Dispensado</option></select></div>
        <div class="field"><label>Data de entrega</label><input type="date" name="DATA_ENTREGA" id="docDeliveryDate" value="${new Date().toISOString().slice(0,10)}"></div>
        <div class="field span-2"><label>Link manual do Drive/pasta</label><input type="url" name="LINK_DRIVE" placeholder="Opcional — use quando o arquivo já estiver no Drive"></div>
        <div class="field span-3"><label>Observação</label><textarea name="OBSERVACAO"></textarea></div>
      </form>
      <div class="doc-drive-note"><b>✓ Organização automática no Drive</b><span>Os arquivos enviados serão salvos em Gestão Futuro - Documentos de Alunos → aluno → ano letivo e o link ficará registrado no cadastro.</span></div>
    </div><div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="saveNewDoc">Salvar documento</button></div>`);
    $$('[data-close]').forEach(x=>x.onclick=closeModal);
    const input=$("#docFilesInput"),zone=$("#docDropZone"),list=$("#docFilesList"),save=$("#saveNewDoc");
    const renderFiles=()=>{
      list.innerHTML=selectedFiles.length?selectedFiles.map((f,i)=>`<div class="doc-file-row"><span class="doc-file-type">${esc((f.name.split(".").pop()||"ARQ").toUpperCase())}</span><div><b>${esc(f.name)}</b><small>${gfDocFormatBytes(f.size)}</small></div><button type="button" class="icon-btn" data-remove-file="${i}" title="Remover">✕</button></div>`).join(""):"";
      save.textContent=selectedFiles.length>1?`Salvar ${selectedFiles.length} documentos`:"Salvar documento";
      $$("[data-remove-file]",list).forEach(btn=>btn.onclick=()=>{selectedFiles.splice(Number(btn.dataset.removeFile),1);renderFiles()});
    };
    const addFiles=files=>{
      const incoming=[...(files||[])];
      incoming.forEach(file=>{
        const key=file.name+"|"+file.size+"|"+file.lastModified;
        if(!selectedFiles.some(x=>x.name+"|"+x.size+"|"+x.lastModified===key))selectedFiles.push(file);
      });
      if(selectedFiles.length>10){selectedFiles=selectedFiles.slice(0,10);showToast("Máximo de 10 documentos por envio.","error")}
      if(selectedFiles.length){$("#docStatus").value="Entregue";$("#docDeliveryDate").value=new Date().toISOString().slice(0,10)}
      renderFiles();
    };
    $("#pickDocFiles").onclick=()=>input.click();
    zone.onclick=e=>{if(!e.target.closest("button"))input.click()};
    zone.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();input.click()}};
    input.onchange=()=>{addFiles(input.files);input.value=""};
    ["dragenter","dragover"].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.classList.add("dragging")}));
    ["dragleave","drop"].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.classList.remove("dragging")}));
    zone.addEventListener("drop",e=>addFiles(e.dataTransfer&&e.dataTransfer.files||[]));
    save.onclick=async()=>{
      const form=$("#addDocForm"),data=Object.fromEntries(new FormData(form).entries());
      if(!selectedFiles.length&&!String(data.DOCUMENTO||"").trim()&&!String(data.LINK_DRIVE||"").trim()){showToast("Selecione um arquivo, arraste um documento ou informe um link do Drive.","error");return}
      const mats=(b.matriculas||[]).filter(m=>String(m.ID_ALUNO)===String(aluno.ID_ALUNO)).sort((a,z)=>Number(z.ANO_LETIVO||0)-Number(a.ANO_LETIVO||0));
      const mat=mats[0]||null;data.ID_ALUNO=aluno.ID_ALUNO;data.ANO_LETIVO=Number(mat&&mat.ANO_LETIVO||2027);data.ID_MATRICULA=mat&&(mat["ID_MATRÍCULA"]||mat.ID_MATRICULA)||"";
      save.disabled=true;
      try{
        if(selectedFiles.length){
          let done=0;
          for(const file of selectedFiles){
            save.textContent=`Preparando ${done+1} de ${selectedFiles.length}…`;
            const prepared=await gfDocPrepareFile(file);
            const label=selectedFiles.length===1&&String(data.DOCUMENTO||"").trim()?String(data.DOCUMENTO).trim():prepared.name.replace(/\.[^.]+$/,"");
            save.textContent=`Enviando ${done+1} de ${selectedFiles.length} para o Drive…`;
            await api("uploadDocumentoAluno",{token:tokenFor("staff"),data:{...data,DOCUMENTO:label,NOME_ARQUIVO:prepared.name,MIME_TYPE:prepared.mime,TAMANHO_BYTES:prepared.size,BASE64:prepared.base64,STATUS:data.STATUS||"Entregue"}});
            done++;
          }
          showToast(selectedFiles.length+" documento(s) salvo(s) no Drive ✓","ok");
        }else{
          await api("adicionarDocumentoAluno",{token:tokenFor("staff"),data});
          showToast("Documento adicionado ✓","ok");
        }
        closeModal();clearApiCache();await loadDocs(aluno.ID_ALUNO);
      }catch(e){
        showToast(e.message||"Não foi possível salvar os documentos.","error");save.disabled=false;renderFiles();
      }
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


