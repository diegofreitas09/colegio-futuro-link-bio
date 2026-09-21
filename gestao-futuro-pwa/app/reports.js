
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
  if(!auth.token){showToast("Sessão necessária para gerar o relatório.","error");throw new Error("Sessão necessária para gerar o relatório.");}
  const old=button?.innerHTML||button?.textContent||"";
  if(button){button.disabled=true;button.classList.add("is-saving");button.textContent="Gerando…";}
  try{
    const r=await fetch(REPORT_API,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...spec,role:auth.role,token:auth.token})});
    if(!r.ok){
      const e=await r.json().catch(()=>({error:"Não foi possível gerar o relatório."}));
      throw new Error(e.error||"Não foi possível gerar o relatório.");
    }
    const blob=await r.blob();
    if(!blob.size)throw new Error("O arquivo do relatório veio vazio.");
    const cd=r.headers.get("content-disposition")||"";
    const name=(cd.match(/filename="([^"]+)"/)||[])[1]||((spec.filename||"relatorio")+"."+(spec.format==="xlsx"?"xlsx":"pdf"));
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=name;a.style.display="none";document.body.appendChild(a);a.click();
    setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},1500);
    showToast("Relatório gerado e baixado ✓","ok");
  }catch(e){
    showToast(e.message||"Não foi possível gerar o relatório.","error");
    throw e;
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
  const explicit=(rs||[]).map(r=>({r,a:studentById[String(r.ID_ALUNO)]||{}}));
  const linked=new Set(explicit.map(x=>String(x.a.ID_ALUNO||x.r.ID_ALUNO||"")+"|"+String(x.r.NOME_COMPLETO||"").trim().toLowerCase()));
  const fallback=(alunos||[]).filter(a=>String(a["RESPONSÁVEL"]||"").trim()).map(a=>({r:{ID_ALUNO:a.ID_ALUNO,NOME_COMPLETO:a["RESPONSÁVEL"],PARENTESCO:"",TELEFONE:a.TELEFONE||"",EMAIL:""},a})).filter(x=>!linked.has(String(x.a.ID_ALUNO||"")+"|"+String(x.r.NOME_COMPLETO||"").trim().toLowerCase()));
  const source=[...explicit,...fallback];
  modal(`<div class="modal-head"><h3>Relatório de responsáveis</h3><button class="icon-btn" data-close>✕</button></div>
  <div class="modal-body"><div class="report-intro"><b>👨‍👩‍👧 Responsáveis por série</b><span>Relação completa ou lista de assinatura dos responsáveis.</span></div>
  <form id="respReportForm" class="form-grid">
    <div class="field"><label>Série</label><select name="SERIE"><option value="">Todas as séries</option>${series.map(s=>`<option>${esc(s)}</option>`).join("")}</select></div>
    <div class="field"><label>Modelo</label><select name="MODELO"><option value="cadastro" ${kind==="cadastro"?"selected":""}>Relação de responsáveis</option><option value="assinatura" ${kind==="assinatura"?"selected":""}>Lista de assinatura</option></select></div>
    <div class="field"><label>Formato</label><select name="FORMAT">${gfReportFormatOptions()}</select></div>
  </form></div>
  <div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary report-download-btn" id="generateRespReport">📄 Gerar relatório</button></div>`);
  $("[data-close]").forEach(x=>x.onclick=closeModal);
  $("#generateRespReport").onclick=async()=>{
    const d=Object.fromEntries(new FormData($("#respReportForm")).entries()),signature=d.MODELO==="assinatura";
    const list=source.filter(x=>!d.SERIE||String(x.a["SÉRIE"]||"")===d.SERIE).sort((x,y)=>String(x.a.NOME_COMPLETO||"").localeCompare(String(y.a.NOME_COMPLETO||""),"pt-BR")||String(x.r.NOME_COMPLETO||"").localeCompare(String(y.r.NOME_COMPLETO||""),"pt-BR"));
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


function openAttendanceReport(list=[]){
  const years=gfReportYears(list),series=[...new Set(list.map(x=>String(x.SERIE_PRETENDIDA||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR",{numeric:true}));
  modal(`<div class="modal-head"><h3>Relatório de atendimentos</h3><button class="icon-btn" data-close>✕</button></div>
  <div class="modal-body"><form id="attReportForm" class="form-grid">
    <div class="field"><label>Ano letivo</label><select name="ANO"><option value="">Todos</option>${years.map(y=>`<option>${esc(y)}</option>`).join("")}</select></div>
    <div class="field"><label>Série pretendida</label><select name="SERIE"><option value="">Todas</option>${series.map(x=>`<option>${esc(x)}</option>`).join("")}</select></div>
    <div class="field"><label>Status</label><select name="STATUS"><option value="">Todos</option><option>Em andamento</option><option>Concluído</option><option>Cancelado</option></select></div>
    <div class="field"><label>Formato</label><select name="FORMAT">${gfReportFormatOptions()}</select></div>
  </form></div><div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary report-download-btn" id="generateAttReport">📄 Gerar relatório</button></div>`);
  $$("[data-close]").forEach(x=>x.onclick=closeModal);
  $("#generateAttReport").onclick=async()=>{
    const d=Object.fromEntries(new FormData($("#attReportForm")).entries());
    const rows=list.filter(a=>(!d.ANO||String(a.ANO_LETIVO||"")===d.ANO)&&(!d.SERIE||String(a.SERIE_PRETENDIDA||"")===d.SERIE)&&(!d.STATUS||String(a.STATUS||"")===d.STATUS));
    const n=v=>Number(String(v??0).replace(",", "."))||0,total=rows.reduce((x,a)=>x+n(a.TOTAL_PROPOSTA),0);
    await gfDownloadReport({
      format:d.FORMAT,title:"Relatório de Atendimentos",subtitle:[d.ANO&&("Ano "+d.ANO),d.SERIE,d.STATUS].filter(Boolean).join(" • ")||"Visão geral",
      filename:gfReportFile("atendimentos",[d.ANO,d.SERIE,d.STATUS]),orientation:"landscape",
      meta:gfReportMeta([{label:"Ano",value:d.ANO||"Todos"},{label:"Série",value:d.SERIE||"Todas"},{label:"Status",value:d.STATUS||"Todos"}]),
      summary:[{label:"Atendimentos",value:String(rows.length)},{label:"Valor apresentado",value:money(total)}],
      columns:[{key:"aluno",label:"Aluno",width:1.8},{key:"resp",label:"Responsável",width:1.6},{key:"ano",label:"Ano",width:.55},{key:"serie",label:"Série",width:.9},{key:"etapa",label:"Etapa",width:.9},{key:"status",label:"Status",width:1},{key:"total",label:"Total",width:1.05,align:"right"}],
      rows:rows.map(a=>({aluno:a.NOME_ALUNO||a.ID_ALUNO||"",resp:a.RESPONSAVEL||"",ano:a.ANO_LETIVO||"",serie:a.SERIE_PRETENDIDA||"",etapa:a.ETAPA||"",status:a.STATUS||"",total:money(a.TOTAL_PROPOSTA)}))
    },$("#generateAttReport"));
  };
}

function openDocumentsReport(student={},docs=[]){
  modal(`<div class="modal-head"><h3>Relatório de documentos</h3><button class="icon-btn" data-close>✕</button></div>
  <div class="modal-body"><div class="report-intro"><b>${esc(student.NOME_COMPLETO||"Aluno")}</b><span>${esc(student["SÉRIE"]||"")} ${student.TURMA?"• "+esc(student.TURMA):""}</span></div>
  <div class="field"><label>Formato</label><select id="docsReportFormat">${gfReportFormatOptions()}</select></div></div>
  <div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary report-download-btn" id="generateDocsReport">📄 Gerar relatório</button></div>`);
  $$("[data-close]").forEach(x=>x.onclick=closeModal);
  $("#generateDocsReport").onclick=async()=>{
    const fmt=$("#docsReportFormat").value,delivered=docs.filter(d=>String(d.STATUS)==="Entregue").length;
    await gfDownloadReport({
      format:fmt,title:"Checklist de Documentos",subtitle:student.NOME_COMPLETO||"",
      filename:gfReportFile("documentos",[student.NOME_COMPLETO||student.ID_ALUNO]),orientation:"portrait",
      meta:gfReportMeta([{label:"Aluno",value:student.NOME_COMPLETO||""},{label:"Série",value:[student["SÉRIE"],student.TURMA].filter(Boolean).join(" / ")}]),
      summary:[{label:"Documentos",value:String(docs.length)},{label:"Entregues",value:String(delivered)},{label:"Pendentes",value:String(Math.max(0,docs.length-delivered))}],
      columns:[{key:"doc",label:"Documento",width:2.5},{key:"ob",label:"Obrigatório",width:1},{key:"status",label:"Status",width:1.1},{key:"entrega",label:"Data de entrega",width:1.25}],
      rows:docs.map(d=>({doc:d.DOCUMENTO||"",ob:d.OBRIGATORIO||"",status:d.STATUS||"Pendente",entrega:d.DATA_ENTREGA||""}))
    },$("#generateDocsReport"));
  };
}

function openClosingReport(f={}){
  const headers=f.headers||[],row=f.atual||[];
  const items=headers.map((h,i)=>({campo:h,valor:row[i]||"—"}));
  modal(`<div class="modal-head"><h3>Relatório de fechamento</h3><button class="icon-btn" data-close>✕</button></div><div class="modal-body"><div class="field"><label>Formato</label><select id="closeReportFormat">${gfReportFormatOptions()}</select></div></div><div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn btn-primary report-download-btn" id="generateCloseReport">📄 Gerar relatório</button></div>`);
  $$("[data-close]").forEach(x=>x.onclick=closeModal);
  $("#generateCloseReport").onclick=async()=>{
    await gfDownloadReport({
      format:$("#closeReportFormat").value,title:"Fechamento Financeiro",subtitle:state.runMode==="TESTE"?"Ambiente de Teste / Simulação":"Ambiente de Produção",
      filename:gfReportFile("fechamento",[new Date().toISOString().slice(0,10)]),orientation:"portrait",
      meta:gfReportMeta(),
      columns:[{key:"campo",label:"Indicador",width:2},{key:"valor",label:"Valor",width:2,align:"right"}],rows:items
    },$("#generateCloseReport"));
  };
}


function gfSeriesRank(v){
  const s=String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  const inf=s.match(/infantil\s*(\d+)/);if(inf)return Number(inf[1])-10;
  const ano=s.match(/^(\d+)[ºo]?\s*ano/);if(ano)return Number(ano[1]);
  const em=s.match(/^(\d+)[ªa]?\s*(?:serie\s+do\s+ensino\s+medio|em)/);if(em)return 20+Number(em[1]);
  if(/conclu/.test(s))return 99;
  return 80;
}
function gfSeriesStats(alunos=[],field="SÉRIE"){
  const map=new Map();
  (alunos||[]).forEach(a=>{const k=String(a?.[field]||"").trim();if(k)map.set(k,(map.get(k)||0)+1)});
  return [...map.entries()].map(([serie,total])=>({serie,total})).sort((a,b)=>gfSeriesRank(a.serie)-gfSeriesRank(b.serie)||a.serie.localeCompare(b.serie,"pt-BR",{numeric:true}));
}
function gfStudentChartDataUrl(current=[],next=[]){
  try{
    const all=[...new Set([...current.map(x=>x.serie),...next.map(x=>x.serie)])].sort((a,b)=>gfSeriesRank(a)-gfSeriesRank(b)||a.localeCompare(b,"pt-BR",{numeric:true}));
    const cur=Object.fromEntries(current.map(x=>[x.serie,x.total])),nxt=Object.fromEntries(next.map(x=>[x.serie,x.total]));
    const W=1400,H=Math.max(500,all.length*42+150),cv=document.createElement("canvas");cv.width=W;cv.height=H;
    const ctx=cv.getContext("2d");ctx.fillStyle="#ffffff";ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#123b76";ctx.font="bold 32px Arial";ctx.fillText("Alunos por série • 2026 x Progressão 2027",40,48);
    ctx.font="20px Arial";ctx.fillStyle="#63758d";ctx.fillText("Azul: série atual em 2026   •   Verde: progressão prevista para 2027",40,82);
    const left=260,right=80,top=120,rowH=38,max=Math.max(1,...all.map(x=>Math.max(cur[x]||0,nxt[x]||0)));
    all.forEach((serie,i)=>{
      const y=top+i*rowH,w=W-left-right;
      ctx.font="18px Arial";ctx.fillStyle="#26364d";ctx.textAlign="right";ctx.fillText(serie,left-18,y+18);
      ctx.fillStyle="#edf2f8";ctx.fillRect(left,y,w,24);
      const cw=w*(cur[serie]||0)/max,nw=w*(nxt[serie]||0)/max;
      ctx.fillStyle="#1d5fa9";ctx.fillRect(left,y,cw,10);
      ctx.fillStyle="#3b8b62";ctx.fillRect(left,y+13,nw,10);
      ctx.textAlign="left";ctx.font="bold 15px Arial";ctx.fillStyle="#123b76";ctx.fillText(String(cur[serie]||0),left+cw+8,y+9);
      ctx.fillStyle="#28734f";ctx.fillText(String(nxt[serie]||0),left+nw+8,y+23);
    });
    return cv.toDataURL("image/png",.92);
  }catch(e){return ""}
}
function gfStudentSeriesBars(stats,total,label){
  const max=Math.max(1,...stats.map(x=>x.total));
  return `<section class="student-chart-card"><div class="student-chart-head"><div><small>${esc(label)}</small><h3>Distribuição por série</h3></div><b>${total} alunos</b></div><div class="student-bar-chart">${stats.map(x=>`<div class="student-bar-row"><span>${esc(x.serie)}</span><div><i style="width:${Math.max(3,(x.total/max)*100)}%"></i></div><b>${x.total}</b><small>${total?((x.total/total)*100).toFixed(1).replace(".",","):"0"}%</small></div>`).join("")}</div></section>`;
}
async function renderStudentManagementAnalytics(alunos=[],mats=[]){
  const active=alunos.filter(a=>String(a.STATUS||"Ativo")!=="Inativo");
  const current=gfSeriesStats(active,"SÉRIE"),next=gfSeriesStats(active,"PROXIMA_SERIE_2027");
  const migrated=active.filter(a=>a.MATRICULA_ORIGEM).length,progress=active.filter(a=>a.PROXIMA_SERIE_2027).length;
  const largest=current.slice().sort((a,b)=>b.total-a.total)[0]||{serie:"—",total:0};
  $("#view").innerHTML=`
    <div class="section-head"><div><h2>Alunos • visão gerencial</h2><span class="muted">Distribuição por série, progressão e base completa da escola.</span></div><div class="toolbar"><button class="btn btn-soft" id="backReports">← Relatórios</button><button class="btn btn-report" id="exportStudentsXlsx">📊 Excel</button><button class="btn btn-primary" id="exportStudentsPdf">📄 PDF completo</button></div></div>
    <div class="student-analytics-kpis">
      <div><small>ALUNOS ATIVOS</small><strong>${active.length}</strong><span>base atual</span></div>
      <div><small>SÉRIES</small><strong>${current.length}</strong><span>com alunos</span></div>
      <div><small>MAIOR TURMA/SÉRIE</small><strong>${largest.total}</strong><span>${esc(largest.serie)}</span></div>
      <div><small>PROGRESSÃO 2027</small><strong>${progress}</strong><span>${progress===active.length?"100% mapeados":"a revisar"}</span></div>
    </div>
    <div class="student-analytics-grid">
      ${gfStudentSeriesBars(current,active.length,"ANO LETIVO 2026")}
      ${gfStudentSeriesBars(next,active.length,"PROGRESSÃO PREVISTA 2027")}
    </div>
    <section class="card student-series-table-card">
      <div class="section-head"><div><h3>Resumo por série</h3><span class="muted">Quantitativo atual e próxima etapa prevista.</span></div><div class="student-search-wrap"><input class="search" id="analyticsSearch" placeholder="Pesquisar aluno ou série…"></div></div>
      <div class="table-wrap"><table><thead><tr><th>Série 2026</th><th>Alunos</th><th>% da escola</th><th>Próxima série</th><th>Matrículas vinculadas</th></tr></thead><tbody>${current.map(x=>{
        const nextSeries=(active.find(a=>a["SÉRIE"]===x.serie)?.PROXIMA_SERIE_2027)||"—";
        const linked=mats.filter(m=>String(m["SÉRIE"]||"")===x.serie&&String(m.STATUS||"Ativa")!=="Cancelada").length;
        return `<tr><td><strong>${esc(x.serie)}</strong></td><td>${x.total}</td><td>${((x.total/active.length)*100).toFixed(1).replace(".",",")}%</td><td><span class="progression-chip">${esc(nextSeries)}</span></td><td>${linked}</td></tr>`;
      }).join("")}</tbody></table></div>
    </section>
    <section class="card student-full-list-card"><div class="section-head"><div><h3>Base completa de alunos</h3><span class="muted">Nome, matrícula, série atual, progressão e situação.</span></div><b id="analyticsCount">${active.length} registros</b></div><div id="analyticsStudents"></div></section>`;

  const drawList=()=>{
    const q=String($("#analyticsSearch")?.value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    const list=active.filter(a=>!q||[a.NOME_COMPLETO,a.MATRICULA_ORIGEM,a["SÉRIE"],a.PROXIMA_SERIE_2027].some(v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().includes(q)));
    $("#analyticsCount").textContent=list.length+" registros";
    $("#analyticsStudents").innerHTML=`<div class="table-wrap"><table><thead><tr><th>Matrícula</th><th>Aluno</th><th>Série 2026</th><th>Progressão 2027</th><th>Status</th></tr></thead><tbody>${list.map(a=>`<tr><td>${esc(a.MATRICULA_ORIGEM||"—")}</td><td><strong>${esc(a.NOME_COMPLETO||"")}</strong></td><td>${esc(a["SÉRIE"]||"")}</td><td><span class="progression-chip">${esc(a.PROXIMA_SERIE_2027||"—")}</span></td><td>${esc(a.STATUS||"")}</td></tr>`).join("")}</tbody></table></div>`;
  };
  $("#analyticsSearch").oninput=drawList;drawList();
  $("#backReports").onclick=()=>renderRelatorios();

  const exportReport=async(format,btn)=>{
    const chartDataUrl=gfStudentChartDataUrl(current,next);
    const seriesRows=current.map(x=>{
      const nextSeries=active.find(a=>a["SÉRIE"]===x.serie)?.PROXIMA_SERIE_2027||"—";
      const projected=next.find(n=>n.serie===nextSeries)?.total||0;
      return [x.serie,x.total,Number(((x.total/active.length)*100).toFixed(2)),nextSeries,projected];
    });
    await gfDownloadReport({
      format,title:"Relatório Gerencial de Alunos por Série",subtitle:"Ano letivo 2026 • progressão prevista para 2027",
      filename:"relatorio-gerencial-alunos-por-serie-2026",
      orientation:"landscape",chartDataUrl,chartTitle:"Distribuição de alunos por série • 2026 x 2027",
      meta:gfReportMeta([{label:"Base",value:"Alunos ativos"},{label:"Ano atual",value:"2026"},{label:"Progressão",value:"2027"}]),
      summary:[{label:"Alunos ativos",value:String(active.length)},{label:"Séries",value:String(current.length)},{label:"Maior série",value:largest.serie+" • "+largest.total},{label:"Com progressão",value:String(progress)}],
      columns:[
        {key:"matricula",label:"Matrícula",width:1},{key:"aluno",label:"Aluno",width:2.4},{key:"serie",label:"Série 2026",width:1},
        {key:"proxima",label:"Progressão 2027",width:1.2},{key:"tipo",label:"Tipo",width:.8},{key:"status",label:"Status",width:.8}
      ],
      rows:active.sort((a,b)=>gfSeriesRank(a["SÉRIE"])-gfSeriesRank(b["SÉRIE"])||String(a.NOME_COMPLETO||"").localeCompare(String(b.NOME_COMPLETO||""),"pt-BR")).map(a=>({matricula:a.MATRICULA_ORIGEM||"",aluno:a.NOME_COMPLETO||"",serie:a["SÉRIE"]||"",proxima:a.PROXIMA_SERIE_2027||"",tipo:a.TIPO_ALUNO||"",status:a.STATUS||""})),
      extraSheets:[
        {name:"Resumo por série",columns:["Série 2026","Alunos","% da escola","Próxima série 2027","Projetado 2027"],rows:seriesRows},
        {name:"Indicadores",columns:["Indicador","Valor"],rows:[["Alunos ativos",active.length],["Séries",current.length],["Migrados com matrícula original",migrated],["Com progressão 2027",progress],["Maior série",largest.serie],["Quantidade na maior série",largest.total]]}
      ]
    },btn);
  };
  $("#exportStudentsPdf").onclick=function(){exportReport("pdf",this)};
  $("#exportStudentsXlsx").onclick=function(){exportReport("xlsx",this)};
}

async function renderRelatorios(){
  const role=activeInterfaceRole();
  if(role==="staff"){
    const b=await loadBootstrap(),alunos=b.alunos||[],rs=b.responsaveis||[],mats=b.matriculas||[];let ats=[];try{ats=await api("listarAtendimentos",{token:tokenFor("staff")})||[]}catch(e){}
    $("#view").innerHTML=`<section class="report-hub-hero"><div><span>CENTRAL DE RELATÓRIOS</span><h2>Secretaria • Relatórios</h2><p>Relações, listas de assinatura e documentos organizados por série, prontos para PDF ou Excel.</p></div><b>PDF<br><small>+ Excel</small></b></section>
    <div class="report-hub-grid">
      <button class="report-hub-card" id="hubStudents"><i>👩‍🎓</i><strong>Alunos por série</strong><span>Relação cadastral em PDF ou Excel.</span></button>
      <button class="report-hub-card" id="hubStudentSign"><i>✍️</i><strong>Assinatura de alunos</strong><span>Lista por série com espaço para assinatura.</span></button>
      <button class="report-hub-card" id="hubParents"><i>👨‍👩‍👧</i><strong>Responsáveis por série</strong><span>Contatos e vínculo com o aluno.</span></button>
      <button class="report-hub-card" id="hubParentSign"><i>🖊️</i><strong>Assinatura de responsáveis</strong><span>Lista por série para reuniões e eventos.</span></button>
      <button class="report-hub-card" id="hubMats"><i>🗂️</i><strong>Matrículas</strong><span>Filtre por ano, série e status.</span></button>
      <button class="report-hub-card" id="hubAtt"><i>🤝</i><strong>Atendimentos</strong><span>Funil de atendimento por ano, série e status.</span></button>
    </div>`;
    $("#hubStudents").onclick=()=>openStudentReport(alunos,"cadastro");
    $("#hubStudentSign").onclick=()=>openStudentReport(alunos,"assinatura");
    $("#hubParents").onclick=()=>openResponsibleReport(rs,alunos,"cadastro");
    $("#hubParentSign").onclick=()=>openResponsibleReport(rs,alunos,"assinatura");
    $("#hubMats").onclick=()=>openMatriculaReport(mats,alunos);
    $("#hubAtt").onclick=()=>openAttendanceReport(ats);
    return;
  }
  const [cash,rec,b]=await Promise.all([api("listarCaixa",{token:state.adminToken}),api("listarRecebimentos",{token:state.adminToken}),loadBootstrap()]);const alunos=b.alunos||[],mats=b.matriculas||[];
  $("#view").innerHTML=`<section class="report-hub-hero"><div><span>CENTRAL DE RELATÓRIOS</span><h2>Gestão • Relatórios</h2><p>Relatórios financeiros profissionais, com período, totais e exportação institucional.</p></div><b>PDF<br><small>+ Excel</small></b></section>
  <div class="report-hub-grid">
    <button class="report-hub-card" id="hubCash"><i>💰</i><strong>Fluxo de caixa</strong><span>Escolha data inicial, final e tipo da movimentação.</span></button>
    <button class="report-hub-card" id="hubReceivables"><i>🧾</i><strong>Contas a receber</strong><span>Previsto, recebido, aberto e status.</span></button>
    <button class="report-hub-card" id="hubStudentAnalytics"><i>📊</i><strong>Alunos por série • Gestão</strong><span>Gráficos, quantitativos, progressão 2027 e base completa em PDF/Excel.</span></button>
  </div>`;
  $("#hubCash").onclick=()=>openCashReport(cash);
  $("#hubReceivables").onclick=()=>openReceivablesReport(rec);
  $("#hubStudentAnalytics").onclick=()=>renderStudentManagementAnalytics(alunos,mats);
}
