
const REPORT_API="/api/reports";

function gfReportDate(v){
  if(!v)return null;
  if(v instanceof Date)return v;
  const s=String(v).trim();
  let m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if(m)return new Date(Number(m[3]),Number(m[2])-1,Number(m[1]),Number(m[4]||0),Number(m[5]||0));
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m)return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
  const d=new Date(s);return isNaN(d.getTime())?null:d;
}
function gfReportIso(d){
  const x=d instanceof Date?d:new Date(d);
  const y=x.getFullYear(),m=String(x.getMonth()+1).padStart(2,"0"),day=String(x.getDate()).padStart(2,"0");
  return y+"-"+m+"-"+day;
}
function gfReportBr(v){
  const d=gfReportDate(v);return d?d.toLocaleDateString("pt-BR"):String(v||"");
}
function gfReportSeries(rows=[],field="SÉRIE"){
  return [...new Set(rows.map(x=>String(x?.[field]||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR",{numeric:true}));
}
function gfReportYears(rows=[],field="ANO_LETIVO"){
  return [...new Set(rows.map(x=>String(x?.[field]||"").trim()).filter(Boolean))].sort((a,b)=>Number(b)-Number(a));
}
function gfReportToken(){
  const role=activeInterfaceRole();
  return {role,token:role==="admin"?state.adminToken:state.staffToken};
}
async function gfDownloadReport(spec,button){
  const auth=gfReportToken();
  if(!auth.token)throw new Error("Sessão necessária para gerar o relatório.");
  const old=button?.innerHTML||button?.textContent||"";
  if(button){button.disabled=true;button.classList.add("is-saving");button.textContent="Gerando…";}
  try{
    const r=await fetch(REPORT_API,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...spec,role:auth.role,token:auth.token})});
    if(!r.ok){
      const e=await r.json().catch(()=>({error:"Não foi possível gerar o relatório."}));
      throw new Error(e.error||"Não foi possível gerar o relatório.");
    }
    const blob=await r.blob();
    const cd=r.headers.get("content-disposition")||"";
    const name=(cd.match(/filename="([^"]+)"/)||[])[1]||((spec.filename||"relatorio")+"."+(spec.format==="xlsx"?"xlsx":"pdf"));
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),1200);
    showToast("Relatório gerado e baixado ✓","ok");
  }finally{
    if(button){button.disabled=false;button.classList.remove("is-saving");button.innerHTML=old;}
  }
}
function gfReportFormatOptions(){
  return '<option value="pdf">PDF pronto para impressão</option><option value="xlsx">Excel (.xlsx)</option>';
}
function gfReportMeta(extra=[]){
  return [
    {label:"Ambiente",value:state.runMode==="TESTE"?"Teste / Simulação":"Produção"},
    ...extra
  ];
}
function gfReportFile(prefix,parts=[]){
  return [prefix,...parts.filter(Boolean)].join("-").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/-+/g,"-").toLowerCase();
}

function openCashReport(list=[]){
  const now=new Date(),first=new Date(now.getFullYear(),now.getMonth(),1);
  modal(`<div class="modal-head"><h3>Relatório do fluxo de caixa</h3><button class="icon-btn" data-close>✕</button></div>
  <div class="modal-body"><div class="report-intro"><b>📊 Fluxo de caixa</b><span>Escolha o período e baixe um relatório institucional em PDF ou Excel.</span></div>
  <form id="cashReportForm" class="form-grid">
    <div class="field"><label>Data inicial</label><input type="date" name="INI" value="${gfReportIso(first)}"></div>
    <div class="field"><label>Data final</label><input type="date" name="FIM" value="${gfReportIso(now)}"></div>
    <div class="field"><label>Tipo</label><select name="TIPO"><option value="">Entradas e saídas</option><option>Entrada</option><option>Saída</option></select></div>
    <div class="field"><label>Formato</label><select name="FORMAT">${gfReportFormatOptions()}</select></div>
  </form></div>
  <div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary report-download-btn" id="generateCashReport">📄 Gerar relatório</button></div>`);
  $$("[data-close]").forEach(x=>x.onclick=closeModal);
  $("#generateCashReport").onclick=async()=>{
    const f=$("#cashReportForm"),d=Object.fromEntries(new FormData(f).entries());
    const ini=new Date(d.INI+"T00:00:00"),fim=new Date(d.FIM+"T23:59:59");
    if(ini>fim){showToast("A data inicial não pode ser maior que a data final.","error");return}
    const filtered=list.filter(x=>{const dt=gfReportDate(x.DATA);return dt&&dt>=ini&&dt<=fim&&(!d.TIPO||String(x.TIPO)===d.TIPO)});
    const n=v=>Number(String(v??0).replace(",", "."))||0;
    const entradas=filtered.filter(x=>x.TIPO==="Entrada").reduce((s,x)=>s+n(x.VALOR),0);
    const saidas=filtered.filter(x=>x.TIPO==="Saída").reduce((s,x)=>s+n(x.VALOR),0);
    await gfDownloadReport({
      format:d.FORMAT,title:"Fluxo de Caixa",
      subtitle:`Período de ${gfReportBr(ini)} a ${gfReportBr(fim)}`,
      filename:gfReportFile("fluxo-caixa",[d.INI,d.FIM]),
      orientation:"landscape",
      meta:gfReportMeta([{label:"Período",value:`${gfReportBr(ini)} a ${gfReportBr(fim)}`},{label:"Tipo",value:d.TIPO||"Todos"}]),
      summary:[{label:"Entradas",value:money(entradas)},{label:"Saídas",value:money(saidas)},{label:"Saldo",value:money(entradas-saidas)},{label:"Movimentações",value:String(filtered.length)}],
      columns:[
        {key:"data",label:"Data",width:1.15},{key:"tipo",label:"Tipo",width:.9},{key:"categoria",label:"Categoria",width:1.4},
        {key:"descricao",label:"Descrição",width:2.3},{key:"forma",label:"Forma",width:1.25},{key:"valor",label:"Valor",width:1.1,align:"right"},{key:"responsavel",label:"Responsável",width:1.3}
      ],
      rows:filtered.map(x=>({data:x.DATA||"",tipo:x.TIPO||"",categoria:[x.CATEGORIA,x.SUBCATEGORIA].filter(Boolean).join(" / "),descricao:x["DESCRIÇÃO"]||"",forma:x.FORMA_PAGAMENTO||"",valor:money(x.VALOR),responsavel:x["RESPONSÁVEL"]||""}))
    },$("#generateCashReport"));
  };
}

function openStudentReport(alunos=[],kind="cadastro"){
  const series=gfReportSeries(alunos);
  modal(`<div class="modal-head"><h3>Relatório de alunos</h3><button class="icon-btn" data-close>✕</button></div>
  <div class="modal-body"><div class="report-intro"><b>👩‍🎓 Alunos por série</b><span>Gere relação cadastral ou lista de assinatura, por série ou geral.</span></div>
  <form id="studentReportForm" class="form-grid">
    <div class="field"><label>Série</label><select name="SERIE"><option value="">Todas as séries</option>${series.map(s=>`<option>${esc(s)}</option>`).join("")}</select></div>
    <div class="field"><label>Modelo</label><select name="MODELO"><option value="cadastro" ${kind==="cadastro"?"selected":""}>Relação de alunos</option><option value="assinatura" ${kind==="assinatura"?"selected":""}>Lista de assinatura</option></select></div>
    <div class="field"><label>Status</label><select name="STATUS"><option value="">Todos</option><option value="Ativo" selected>Ativos</option><option value="Inativo">Inativos</option></select></div>
    <div class="field"><label>Formato</label><select name="FORMAT">${gfReportFormatOptions()}</select></div>
  </form></div>
  <div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary report-download-btn" id="generateStudentReport">📄 Gerar relatório</button></div>`);
  $$("[data-close]").forEach(x=>x.onclick=closeModal);
  $("#generateStudentReport").onclick=async()=>{
    const d=Object.fromEntries(new FormData($("#studentReportForm")).entries());
    const list=alunos.filter(a=>(!d.SERIE||String(a["SÉRIE"]||"")===d.SERIE)&&(!d.STATUS||String(a.STATUS||"")===d.STATUS)).sort((a,b)=>String(a.NOME_COMPLETO||"").localeCompare(String(b.NOME_COMPLETO||""),"pt-BR"));
    const signature=d.MODELO==="assinatura";
    const cols=signature?[
      {key:"n",label:"Nº",width:.45,align:"center"},{key:"aluno",label:"Aluno",width:2.6},{key:"serie",label:"Série / Turma",width:1.25},{key:"assinatura",label:"Assinatura",width:3.1}
    ]:[
      {key:"n",label:"Nº",width:.45,align:"center"},{key:"aluno",label:"Aluno",width:2.5},{key:"serie",label:"Série",width:1.05},{key:"turma",label:"Turma",width:.8},{key:"turno",label:"Turno",width:.9},{key:"cpf",label:"CPF",width:1.35},{key:"status",label:"Status",width:.85}
    ];
    const rows=list.map((a,i)=>signature?{n:String(i+1),aluno:a.NOME_COMPLETO||"",serie:[a["SÉRIE"],a.TURMA].filter(Boolean).join(" / "),assinatura:""}:{n:String(i+1),aluno:a.NOME_COMPLETO||"",serie:a["SÉRIE"]||"",turma:a.TURMA||"",turno:a.TURNO||"",cpf:a.CPF||"",status:a.STATUS||""});
    await gfDownloadReport({
      format:d.FORMAT,title:signature?"Lista de Assinatura de Alunos":"Relação de Alunos",
      subtitle:d.SERIE?`Série: ${d.SERIE}`:"Todas as séries",
      filename:gfReportFile(signature?"assinatura-alunos":"alunos",[d.SERIE||"geral"]),
      orientation:signature?"portrait":"landscape",signature,
      meta:gfReportMeta([{label:"Série",value:d.SERIE||"Todas"},{label:"Status",value:d.STATUS||"Todos"}]),
      summary:[{label:"Total de alunos",value:String(list.length)}],columns:cols,rows
    },$("#generateStudentReport"));
  };
}

function openResponsibleReport(rs=[],alunos=[],kind="cadastro"){
  const series=gfReportSeries(alunos),studentById=Object.fromEntries(alunos.map(a=>[String(a.ID_ALUNO),a]));
  modal(`<div class="modal-head"><h3>Relatório de responsáveis</h3><button class="icon-btn" data-close>✕</button></div>
  <div class="modal-body"><div class="report-intro"><b>👨‍👩‍👧 Responsáveis por série</b><span>Relação completa ou lista de assinatura dos responsáveis.</span></div>
  <form id="respReportForm" class="form-grid">
    <div class="field"><label>Série</label><select name="SERIE"><option value="">Todas as séries</option>${series.map(s=>`<option>${esc(s)}</option>`).join("")}</select></div>
    <div class="field"><label>Modelo</label><select name="MODELO"><option value="cadastro" ${kind==="cadastro"?"selected":""}>Relação de responsáveis</option><option value="assinatura" ${kind==="assinatura"?"selected":""}>Lista de assinatura</option></select></div>
    <div class="field"><label>Formato</label><select name="FORMAT">${gfReportFormatOptions()}</select></div>
  </form></div>
  <div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary report-download-btn" id="generateRespReport">📄 Gerar relatório</button></div>`);
  $$("[data-close]").forEach(x=>x.onclick=closeModal);
  $("#generateRespReport").onclick=async()=>{
    const d=Object.fromEntries(new FormData($("#respReportForm")).entries()),signature=d.MODELO==="assinatura";
    const list=rs.map(r=>({r,a:studentById[String(r.ID_ALUNO)]||{}})).filter(x=>!d.SERIE||String(x.a["SÉRIE"]||"")===d.SERIE).sort((x,y)=>String(x.a.NOME_COMPLETO||"").localeCompare(String(y.a.NOME_COMPLETO||""),"pt-BR")||String(x.r.NOME_COMPLETO||"").localeCompare(String(y.r.NOME_COMPLETO||""),"pt-BR"));
    const cols=signature?[
      {key:"n",label:"Nº",width:.4,align:"center"},{key:"responsavel",label:"Responsável",width:2.2},{key:"aluno",label:"Aluno",width:2.1},{key:"parentesco",label:"Parentesco",width:1.1},{key:"assinatura",label:"Assinatura",width:2.8}
    ]:[
      {key:"n",label:"Nº",width:.4,align:"center"},{key:"responsavel",label:"Responsável",width:2.0},{key:"aluno",label:"Aluno",width:1.9},{key:"serie",label:"Série",width:.9},{key:"parentesco",label:"Parentesco",width:1.0},{key:"telefone",label:"Telefone",width:1.15},{key:"email",label:"E-mail",width:1.8}
    ];
    const rows=list.map((x,i)=>signature?{n:String(i+1),responsavel:x.r.NOME_COMPLETO||"",aluno:x.a.NOME_COMPLETO||x.r.ID_ALUNO||"",parentesco:x.r.PARENTESCO||"",assinatura:""}:{n:String(i+1),responsavel:x.r.NOME_COMPLETO||"",aluno:x.a.NOME_COMPLETO||x.r.ID_ALUNO||"",serie:x.a["SÉRIE"]||"",parentesco:x.r.PARENTESCO||"",telefone:x.r.TELEFONE||"",email:x.r.EMAIL||""});
    await gfDownloadReport({
      format:d.FORMAT,title:signature?"Lista de Assinatura de Responsáveis":"Relação de Responsáveis",
      subtitle:d.SERIE?`Série: ${d.SERIE}`:"Todas as séries",
      filename:gfReportFile(signature?"assinatura-responsaveis":"responsaveis",[d.SERIE||"geral"]),
      orientation:signature?"portrait":"landscape",signature,
      meta:gfReportMeta([{label:"Série",value:d.SERIE||"Todas"}]),
      summary:[{label:"Total de responsáveis",value:String(list.length)}],columns:cols,rows
    },$("#generateRespReport"));
  };
}

function openMatriculaReport(mats=[],alunos=[]){
  const series=[...new Set(mats.map(x=>String(x["SÉRIE"]||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR",{numeric:true}));
  const years=gfReportYears(mats),names=Object.fromEntries(alunos.map(a=>[String(a.ID_ALUNO),a.NOME_COMPLETO||""]));
  modal(`<div class="modal-head"><h3>Relatório de matrículas</h3><button class="icon-btn" data-close>✕</button></div>
  <div class="modal-body"><form id="matReportForm" class="form-grid">
    <div class="field"><label>Ano letivo</label><select name="ANO"><option value="">Todos</option>${years.map(y=>`<option>${esc(y)}</option>`).join("")}</select></div>
    <div class="field"><label>Série</label><select name="SERIE"><option value="">Todas</option>${series.map(s=>`<option>${esc(s)}</option>`).join("")}</select></div>
    <div class="field"><label>Status</label><select name="STATUS"><option value="">Todos</option><option>Ativa</option><option>Cancelada</option></select></div>
    <div class="field"><label>Formato</label><select name="FORMAT">${gfReportFormatOptions()}</select></div>
  </form></div><div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary report-download-btn" id="generateMatReport">📄 Gerar relatório</button></div>`);
  $$("[data-close]").forEach(x=>x.onclick=closeModal);
  $("#generateMatReport").onclick=async()=>{
    const d=Object.fromEntries(new FormData($("#matReportForm")).entries());
    const list=mats.filter(m=>(!d.ANO||String(m.ANO_LETIVO||"")===d.ANO)&&(!d.SERIE||String(m["SÉRIE"]||"")===d.SERIE)&&(!d.STATUS||String(m.STATUS||"")===d.STATUS));
    await gfDownloadReport({
      format:d.FORMAT,title:"Relatório de Matrículas",subtitle:[d.ANO&&("Ano "+d.ANO),d.SERIE].filter(Boolean).join(" • ")||"Visão geral",
      filename:gfReportFile("matriculas",[d.ANO,d.SERIE]),orientation:"landscape",
      meta:gfReportMeta([{label:"Ano",value:d.ANO||"Todos"},{label:"Série",value:d.SERIE||"Todas"},{label:"Status",value:d.STATUS||"Todos"}]),
      summary:[{label:"Matrículas",value:String(list.length)}],
      columns:[{key:"mat",label:"Matrícula",width:1.1},{key:"aluno",label:"Aluno",width:2.2},{key:"ano",label:"Ano",width:.65},{key:"serie",label:"Série",width:.9},{key:"plano",label:"Plano",width:.75},{key:"valor",label:"Valor contratado",width:1.3,align:"right"},{key:"docs",label:"Documentos",width:1.1},{key:"status",label:"Status",width:.9}],
      rows:list.map(m=>({mat:m["ID_MATRÍCULA"]||m.ID_MATRICULA||"",aluno:names[String(m.ID_ALUNO)]||m.ID_ALUNO||"",ano:m.ANO_LETIVO||"",serie:m["SÉRIE"]||"",plano:m.PLANO_PARCELAS?m.PLANO_PARCELAS+"x":"",valor:money(m.VALOR_ANUIDADE_CONTRATADO),docs:m.STATUS_DOCUMENTOS||"",status:m.STATUS||""}))
    },$("#generateMatReport"));
  };
}

function openReceivablesReport(list=[]){
  modal(`<div class="modal-head"><h3>Relatório de recebimentos</h3><button class="icon-btn" data-close>✕</button></div>
  <div class="modal-body"><form id="recReportForm" class="form-grid">
    <div class="field"><label>Status</label><select name="STATUS"><option value="">Todos</option><option>Pago</option><option>Pendente</option><option>Vencido</option></select></div>
    <div class="field"><label>Formato</label><select name="FORMAT">${gfReportFormatOptions()}</select></div>
  </form></div><div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary report-download-btn" id="generateRecReport">📄 Gerar relatório</button></div>`);
  $$("[data-close]").forEach(x=>x.onclick=closeModal);
  $("#generateRecReport").onclick=async()=>{
    const d=Object.fromEntries(new FormData($("#recReportForm")).entries()),statusOf=r=>String(r.STATUS_CALCULADO||r.STATUS||"");
    const rows=list.filter(r=>!d.STATUS||statusOf(r)===d.STATUS);
    const n=v=>Number(String(v??0).replace(",", "."))||0,prev=rows.reduce((s,r)=>s+n(r.VALOR_PREVISTO),0),got=rows.reduce((s,r)=>s+n(r.VALOR_RECEBIDO),0);
    await gfDownloadReport({
      format:d.FORMAT,title:"Contas a Receber",subtitle:d.STATUS?`Status: ${d.STATUS}`:"Todos os status",
      filename:gfReportFile("recebimentos",[d.STATUS||"todos"]),orientation:"landscape",
      meta:gfReportMeta([{label:"Status",value:d.STATUS||"Todos"}]),
      summary:[{label:"Previsto",value:money(prev)},{label:"Recebido",value:money(got)},{label:"Em aberto",value:money(prev-got)},{label:"Registros",value:String(rows.length)}],
      columns:[{key:"id",label:"Recebimento",width:1.1},{key:"aluno",label:"Aluno",width:1.35},{key:"parcela",label:"Parcela",width:.7},{key:"venc",label:"Vencimento",width:1},{key:"prev",label:"Previsto",width:1,align:"right"},{key:"got",label:"Recebido",width:1,align:"right"},{key:"status",label:"Status",width:1}],
      rows:rows.map(r=>({id:r.ID_RECEBIMENTO||"",aluno:r.ID_ALUNO||"",parcela:r.PARCELA||"",venc:r.VENCIMENTO||"",prev:money(r.VALOR_PREVISTO),got:money(r.VALOR_RECEBIDO),status:statusOf(r)}))
    },$("#generateRecReport"));
  };
}

async function renderRelatorios(){
  const role=activeInterfaceRole();
  if(role==="staff"){
    const b=await loadBootstrap(),alunos=b.alunos||[],rs=b.responsaveis||[],mats=b.matriculas||[];
    $("#view").innerHTML=`<section class="report-hub-hero"><div><span>CENTRAL DE RELATÓRIOS</span><h2>Secretaria • Relatórios</h2><p>Relações, listas de assinatura e documentos organizados por série, prontos para PDF ou Excel.</p></div><b>PDF<br><small>+ Excel</small></b></section>
    <div class="report-hub-grid">
      <button class="report-hub-card" id="hubStudents"><i>👩‍🎓</i><strong>Alunos por série</strong><span>Relação cadastral em PDF ou Excel.</span></button>
      <button class="report-hub-card" id="hubStudentSign"><i>✍️</i><strong>Assinatura de alunos</strong><span>Lista por série com espaço para assinatura.</span></button>
      <button class="report-hub-card" id="hubParents"><i>👨‍👩‍👧</i><strong>Responsáveis por série</strong><span>Contatos e vínculo com o aluno.</span></button>
      <button class="report-hub-card" id="hubParentSign"><i>🖊️</i><strong>Assinatura de responsáveis</strong><span>Lista por série para reuniões e eventos.</span></button>
      <button class="report-hub-card" id="hubMats"><i>🗂️</i><strong>Matrículas</strong><span>Filtre por ano, série e status.</span></button>
    </div>`;
    $("#hubStudents").onclick=()=>openStudentReport(alunos,"cadastro");
    $("#hubStudentSign").onclick=()=>openStudentReport(alunos,"assinatura");
    $("#hubParents").onclick=()=>openResponsibleReport(rs,alunos,"cadastro");
    $("#hubParentSign").onclick=()=>openResponsibleReport(rs,alunos,"assinatura");
    $("#hubMats").onclick=()=>openMatriculaReport(mats,alunos);
    return;
  }
  const [cash,rec]=await Promise.all([api("listarCaixa",{token:state.adminToken}),api("listarRecebimentos",{token:state.adminToken})]);
  $("#view").innerHTML=`<section class="report-hub-hero"><div><span>CENTRAL DE RELATÓRIOS</span><h2>Gestão • Relatórios</h2><p>Relatórios financeiros profissionais, com período, totais e exportação institucional.</p></div><b>PDF<br><small>+ Excel</small></b></section>
  <div class="report-hub-grid">
    <button class="report-hub-card" id="hubCash"><i>💰</i><strong>Fluxo de caixa</strong><span>Escolha data inicial, final e tipo da movimentação.</span></button>
    <button class="report-hub-card" id="hubReceivables"><i>🧾</i><strong>Contas a receber</strong><span>Previsto, recebido, aberto e status.</span></button>
  </div>`;
  $("#hubCash").onclick=()=>openCashReport(cash);
  $("#hubReceivables").onclick=()=>openReceivablesReport(rec);
}
