const GF_INTEGRATION_ENDPOINT="/api/integrations";
const GF_INTEGRATION_ENTITIES=[
  ["alunos","Alunos"],
  ["responsaveis","Responsáveis"],
  ["matriculas","Matrículas"],
  ["produtos","Produtos / serviços"],
  ["atendimentos","Atendimentos"]
];

async function integrationApi(body){
  const r=await fetch(GF_INTEGRATION_ENDPOINT,{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify(body)
  });
  let out={};try{out=await r.json()}catch{}
  if(!r.ok||!out?.ok)throw new Error(out?.error||"Falha na central de integrações.");
  return out.data;
}
function gfIntDate(v){
  if(!v)return "—";
  try{return new Date(v).toLocaleString("pt-BR")}catch{return String(v)}
}
function gfIntStatus(v){
  const map={STAGED:["Pronto","warn"],PROCESSING:["Processando","warn"],COMPLETED:["Concluído","ok"],ERROR:["Erro","error"]};
  const x=map[v]||[v||"—",""];
  return pill(x[0],x[1]);
}
function gfIntEntityOptions(sel=""){
  return GF_INTEGRATION_ENTITIES.map(([v,l])=>`<option value="${v}" ${v===sel?"selected":""}>${l}</option>`).join("");
}
function gfIntTemplate(entity){
  const headers={
    alunos:["NOME_COMPLETO","DATA_NASCIMENTO","CPF","RG","SÉRIE","TURMA","TURNO","TIPO_ALUNO","MODALIDADE","ESCOLA_ORIGEM","CEP","LOGRADOURO","NUMERO","BAIRRO","CIDADE","ANO_LETIVO"],
    responsaveis:["ID_ALUNO","NOME_COMPLETO","CPF","PARENTESCO","TELEFONE","EMAIL","RESPONSAVEL_FINANCEIRO","CEP","ENDERECO"],
    matriculas:["ID_ALUNO","ANO_LETIVO","SÉRIE","TURNO","TIPO_MATRICULA","ID_PRODUTO_PLANO","PLANO_PARCELAS","VALOR_ANUIDADE_CONTRATADO","DIA_VENCIMENTO","PRIMEIRO_VENCIMENTO","OBSERVAÇÃO"],
    produtos:["ANO_LETIVO","CATEGORIA","SUBCATEGORIA","PRODUTO","SEGMENTO_SÉRIE","DESCRIÇÃO","VALOR_BASE","QTD_PARCELAS","TIPO_COBRANCA","ATIVO"],
    atendimentos:["NOME_ALUNO","RESPONSAVEL","TELEFONE","EMAIL","TIPO_ALUNO","ANO_LETIVO","SERIE_PRETENDIDA","TURNO","MODALIDADE","ORIGEM","ETAPA","STATUS","OBSERVACAO"]
  };
  return headers[entity]||[];
}
function gfDownloadCsvTemplate(entity){
  const h=gfIntTemplate(entity);
  if(!h.length)return;
  const blob=new Blob(["\ufeff"+h.join(";")+"\n"],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="modelo_"+entity+"_gestao_futuro.csv";a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function gfCopy(textValue){
  try{await navigator.clipboard.writeText(textValue);showToast("Copiado ✓","ok")}
  catch{prompt("Copie:",textValue)}
}

async function renderIntegracoes(){
  const [jobs,keys]=await Promise.all([
    integrationApi({action:"admin:list-jobs",token:state.adminToken}).catch(()=>([])),
    integrationApi({action:"admin:list-keys",token:state.adminToken}).catch(()=>([]))
  ]);

  $("#view").innerHTML=`
    <div class="integration-hero">
      <div><span>CENTRAL DE INTEGRAÇÕES</span><h2>Entrada de dados externos</h2><p>Receba dados por API, CSV ou Excel, faça uma pré-validação e só depois grave no banco oficial.</p></div>
      <div class="integration-badges"><b>API</b><b>CSV</b><b>Excel</b><b>JSON</b></div>
    </div>

    <div class="integration-grid">
      <section class="card">
        <div class="section-head compact"><div><h2>Importar arquivo</h2><span class="muted">CSV, XLSX ou XLS</span></div></div>
        <form id="intFileForm" class="form-grid">
          <div class="field"><label>Tipo de dado</label><select name="entity" id="intFileEntity">${gfIntEntityOptions("alunos")}</select></div>
          <div class="field"><label>Origem</label><input name="source" placeholder="Ex.: sistema antigo, Computex, planilha 2026"></div>
          <div class="field"><label>Ambiente</label><select name="environment"><option value="TESTE">Teste / Simulação</option><option value="PRODUCAO">Produção</option></select></div>
          <div class="field span-3"><label>Arquivo</label><input type="file" name="file" accept=".csv,.xlsx,.xls" required></div>
        </form>
        <div class="integration-actions">
          <button class="btn btn-soft" id="downloadTemplate">Baixar modelo CSV</button>
          <button class="btn btn-primary" id="stageFile">Receber e validar</button>
        </div>
      </section>

      <section class="card">
        <div class="section-head compact"><div><h2>Puxar de outra API</h2><span class="muted">Importação sob demanda</span></div></div>
        <div class="form-grid">
          <div class="field"><label>Tipo de dado</label><select id="pullEntity">${gfIntEntityOptions("alunos")}</select></div>
          <div class="field span-2"><label>URL HTTPS da API</label><input id="pullUrl" placeholder="https://sistema.exemplo.com/api/alunos"></div>
          <div class="field"><label>Origem</label><input id="pullSource" placeholder="Nome da plataforma"></div>
          <div class="field span-2"><label>Authorization (opcional)</label><input id="pullAuth" type="password" placeholder="Bearer ..."></div>
          <div class="field"><label>Ambiente</label><select id="pullEnv"><option value="TESTE">Teste / Simulação</option><option value="PRODUCAO">Produção</option></select></div>
        </div>
        <div class="integration-actions"><button class="btn btn-primary" id="pullApi">Puxar dados</button></div>
      </section>
    </div>

    <section class="card integration-api-card">
      <div class="section-head"><div><h2>API para outra plataforma enviar dados</h2><span class="muted">Endpoint: <code>/api/integrations</code></span></div><button class="btn btn-gold" id="newIntegrationKey">+ Nova chave API</button></div>
      <div class="api-example"><code>POST /api/integrations<br>Authorization: Bearer SUA_CHAVE<br><br>{ "action":"ingest", "entity":"alunos", "source":"Sistema parceiro", "records":[ ... ] }</code></div>
      <div class="table-wrap"><table><thead><tr><th>Integração</th><th>Prefixo</th><th>Criada em</th><th>Status</th><th></th></tr></thead><tbody>
        ${keys.map(k=>`<tr><td><b>${esc(k.label||"Integração")}</b></td><td><code>${esc(k.prefix||"")}</code></td><td>${esc(gfIntDate(k.createdAt))}</td><td>${pill(k.active===false?"Revogada":"Ativa",k.active===false?"":"ok")}</td><td>${k.active===false?"":`<button class="btn btn-danger btn-sm" data-revoke-key="${esc(k.id)}">Revogar</button>`}</td></tr>`).join("")||`<tr><td colspan="5" class="empty">Nenhuma chave criada.</td></tr>`}
      </tbody></table></div>
    </section>

    <section>
      <div class="section-head"><div><h2>Fila de importações</h2><span class="muted">Nada entra no banco sem passar por esta fila.</span></div><button class="btn btn-soft" id="refreshJobs">Atualizar</button></div>
      <div class="table-wrap"><table><thead><tr><th>Importação</th><th>Origem</th><th>Tipo</th><th>Canal</th><th>Registros</th><th>Ambiente</th><th>Status</th><th></th></tr></thead><tbody>
        ${jobs.map(j=>`<tr><td><b>${esc(j.id)}</b><br><span class="muted">${esc(gfIntDate(j.createdAt))}</span></td><td>${esc(j.source||"")}</td><td>${esc(j.entity||"")}</td><td>${esc((j.channel||"").toUpperCase())}</td><td>${esc(j.recordCount||0)}</td><td>${pill(j.environment||"")}</td><td>${gfIntStatus(j.status)}</td><td><div class="integration-row-actions"><button class="btn btn-soft btn-sm" data-preview-job="${esc(j.id)}">Prévia</button>${j.status!=="COMPLETED"?`<button class="btn btn-primary btn-sm" data-commit-job="${esc(j.id)}">Processar</button>`:""}</div></td></tr>`).join("")||`<tr><td colspan="8" class="empty">Nenhuma importação recebida.</td></tr>`}
      </tbody></table></div>
    </section>
  `;

  $("#downloadTemplate").onclick=()=>gfDownloadCsvTemplate($("#intFileEntity").value);
  $("#stageFile").onclick=async function(){
    const f=$("#intFileForm");if(!f.reportValidity())return;
    const fd=new FormData(f);fd.append("token",state.adminToken);fd.append("mode","upsert");
    const b=this,old=b.textContent;b.disabled=true;b.textContent="Validando…";
    try{
      const r=await fetch(GF_INTEGRATION_ENDPOINT,{method:"POST",body:fd});
      const out=await r.json();if(!r.ok||!out?.ok)throw new Error(out?.error||"Falha na importação.");
      showToast(out.data.recordCount+" registro(s) recebidos para validação ✓","ok");
      await renderIntegracoes();
    }catch(e){showToast(e.message,"error");b.disabled=false;b.textContent=old}
  };

  $("#pullApi").onclick=async function(){
    const b=this,old=b.textContent;b.disabled=true;b.textContent="Conectando…";
    try{
      const data=await integrationApi({
        action:"admin:pull",token:state.adminToken,entity:$("#pullEntity").value,
        url:$("#pullUrl").value,source:$("#pullSource").value,authorization:$("#pullAuth").value,
        environment:$("#pullEnv").value,mode:"upsert"
      });
      showToast(data.recordCount+" registro(s) recebidos da API ✓","ok");
      await renderIntegracoes();
    }catch(e){showToast(e.message,"error");b.disabled=false;b.textContent=old}
  };

  $("#newIntegrationKey").onclick=()=>openIntegrationKeyModal();
  $$("[data-revoke-key]").forEach(b=>b.onclick=async()=>{
    if(!confirm("Revogar esta chave de integração?"))return;
    try{await integrationApi({action:"admin:revoke-key",token:state.adminToken,keyId:b.dataset.revokeKey});showToast("Chave revogada.","ok");renderIntegracoes()}catch(e){showToast(e.message,"error")}
  });
  $$("[data-preview-job]").forEach(b=>b.onclick=()=>openIntegrationPreview(b.dataset.previewJob));
  $$("[data-commit-job]").forEach(b=>b.onclick=()=>commitIntegrationJob(b.dataset.commitJob,b));
  $("#refreshJobs").onclick=()=>renderIntegracoes();
}

function openIntegrationKeyModal(){
  modal(`<div class="modal-head"><h3>Nova chave de integração</h3><button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body"><div class="field"><label>Nome da plataforma / integração</label><input id="intKeyLabel" placeholder="Ex.: Sistema acadêmico, CRM parceiro"></div>
    <div class="notice warn">A chave completa será exibida somente uma vez. Guarde-a na plataforma que enviará os dados.</div></div>
    <div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary" id="createIntKey">Gerar chave</button></div>`);
  $$("[data-close]").forEach(x=>x.onclick=closeModal);
  $("#createIntKey").onclick=async function(){
    const label=$("#intKeyLabel").value.trim();if(!label)return;
    this.disabled=true;this.textContent="Gerando…";
    try{
      const data=await integrationApi({action:"admin:create-key",token:state.adminToken,label});
      modal(`<div class="modal-head"><h3>Chave criada</h3><button class="icon-btn" data-close>✕</button></div>
        <div class="modal-body"><p class="muted">Copie agora. Depois ela ficará mascarada.</p><div class="api-key-box"><code id="newKeyValue">${esc(data.key)}</code><button class="btn btn-primary" id="copyNewKey">Copiar chave</button></div></div>
        <div class="modal-foot"><button class="btn btn-soft" data-close>Fechar</button></div>`);
      $$("[data-close]").forEach(x=>x.onclick=()=>{closeModal();renderIntegracoes()});
      $("#copyNewKey").onclick=()=>gfCopy(data.key);
    }catch(e){showToast(e.message,"error");this.disabled=false;this.textContent="Gerar chave"}
  };
}

async function openIntegrationPreview(jobId){
  try{
    const job=await integrationApi({action:"admin:get-job",token:state.adminToken,jobId});
    const rows=job.preview||[],headers=[...new Set(rows.flatMap(r=>Object.keys(r)))].slice(0,14);
    modal(`<div class="modal-head"><h3>Prévia • ${esc(job.id)}</h3><button class="icon-btn" data-close>✕</button></div>
      <div class="modal-body">
        <div class="integration-summary"><span><b>${esc(job.recordCount)}</b> registros</span><span><b>${esc(job.entity)}</b> tipo</span><span><b>${esc(job.environment)}</b> ambiente</span></div>
        ${job.warnings?.length?`<div class="notice warn">${job.warnings.slice(0,8).map(esc).join("<br>")}</div>`:""}
        <div class="table-wrap preview-table"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>
          ${rows.map(row=>`<tr>${headers.map(h=>`<td>${esc(row[h]??"")}</td>`).join("")}</tr>`).join("")}
        </tbody></table></div>
      </div><div class="modal-foot"><button class="btn btn-soft" data-close>Fechar</button>${job.status!=="COMPLETED"?`<button class="btn btn-primary" id="commitFromPreview">Processar importação</button>`:""}</div>`);
    $$("[data-close]").forEach(x=>x.onclick=closeModal);
    const btn=$("#commitFromPreview");if(btn)btn.onclick=()=>commitIntegrationJob(job.id,btn);
  }catch(e){showToast(e.message,"error")}
}

async function commitIntegrationJob(jobId,button){
  if(!confirm("Processar esta importação no banco da Gestão Futuro?"))return;
  const b=button,old=b?.textContent||"Processar";
  if(b){b.disabled=true;b.textContent="Processando…"}
  try{
    let done=false,last=null,guard=0;
    while(!done&&guard<60){
      last=await integrationApi({action:"admin:commit-job",token:state.adminToken,jobId});
      done=!!last.done;guard++;
      if(b)b.textContent="Processando "+(last.processed||0)+"/"+(last.total||0);
    }
    if(!done)throw new Error("A importação ficou parcialmente processada. Clique novamente para continuar.");
    closeModal();
    showToast("Importação concluída: "+(last?.result?.criados||0)+" criado(s), "+(last?.result?.atualizados||0)+" atualizado(s).","ok");
    clearApiCache();state.catalogProducts=null;
    await renderIntegracoes();
  }catch(e){
    const msg=String(e.message||e);
    if(/importarLoteIntegracao|Ação não reconhecida/i.test(msg))showToast("O ApiPwa.gs precisa ser atualizado para ativar a gravação das integrações.","error");
    else showToast(msg,"error");
    if(b){b.disabled=false;b.textContent=old}
  }
}
