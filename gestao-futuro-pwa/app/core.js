const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const API = "/api/gf";

const state = {
  view: "dashboard",
  staffToken: sessionStorage.getItem("gf_staff_token") || "",
  adminToken: sessionStorage.getItem("gf_admin_token") || "",
  role: sessionStorage.getItem("gf_role") || "",
  bootstrap: null,
  deferredInstall: null,
  studentsFilter: "",
  catalogProducts: null,
  catalogPromise: null,
  flyerCache: {},
  runMode: sessionStorage.getItem("gf_run_mode") || "",
  testSession: sessionStorage.getItem("gf_test_session") || ""
};

const titles = {
  dashboard:"Dashboard", atendimento:"Atendimento de matrículas", panfletos:"Panfletos por série", alunos:"Alunos", responsaveis:"Responsáveis", matriculas:"Matrículas",
  documentos:"Documentos", produtos:"Valores e reajustes", autorizacoes:"Autorizações da Gestão", recebimentos:"Recebimentos",
  caixa:"Fluxo de caixa", fechamento:"Fechamento financeiro"
};

const roleForView = view => ["produtos","autorizacoes","recebimentos","caixa","fechamento"].includes(view) ? "admin" : ["atendimento","panfletos","alunos","responsaveis","matriculas","documentos"].includes(view) ? "staff" : "public";
const tokenFor = role => role === "admin" ? state.adminToken : (state.staffToken || state.adminToken);

function esc(v="") { return String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function money(v) { const n=Number(String(v ?? 0).replace(",",".")) || 0; return n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
function val(obj, ...keys) { for (const k of keys) if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k]; return ""; }
function pill(text, cls="") { return `<span class="pill ${cls}">${esc(text || "—")}</span>`; }

function setNotice(message="", kind="") {
  const box = $("#notice");
  box.innerHTML = message ? `<div class="notice ${kind}">${message}</div>` : "";
}

function currentRunMode(){ return state.runMode==="TESTE" ? "TESTE" : "PRODUCAO"; }
function ensureTestSession(){
  if(state.runMode!=="TESTE") return "";
  if(!state.testSession){
    state.testSession="TST-"+Date.now()+"-"+Math.random().toString(36).slice(2,7).toUpperCase();
    sessionStorage.setItem("gf_test_session",state.testSession);
  }
  return state.testSession;
}
function refreshModeButton(){
  const b=$("#modeBtn"); if(!b) return;
  if(state.runMode==="TESTE"){
    b.textContent="🧪 Teste / Simulação";
    b.className="btn btn-test";
    b.title="Registros desta sessão serão marcados como teste e poderão ser apagados.";
  }else if(state.runMode==="PRODUCAO"){
    b.textContent="✓ Produção";
    b.className="btn btn-production";
    b.title="Registros oficiais.";
  }else{
    b.textContent="Escolher modo";
    b.className="btn btn-soft";
  }
}
function setRunMode(mode){
  state.runMode=mode==="TESTE"?"TESTE":"PRODUCAO";
  sessionStorage.setItem("gf_run_mode",state.runMode);
  if(state.runMode==="TESTE") ensureTestSession();
  else { state.testSession=""; sessionStorage.removeItem("gf_test_session"); }
  state.bootstrap=null;
  refreshModeButton();
}
function clearLocalTestData(){
  try{
    const key="gestao_futuro_atendimentos_locais_v1";
    const rows=JSON.parse(localStorage.getItem(key)||"[]");
    localStorage.setItem(key,JSON.stringify(rows.filter(x=>(x?.atendimento?.MODO_REGISTRO||"")!=="TESTE")));
  }catch(e){}
  try{
    const d=JSON.parse(localStorage.getItem("gestao_futuro_atendimento_rascunho_v1")||"null");
    if(d?.MODO_REGISTRO==="TESTE") localStorage.removeItem("gestao_futuro_atendimento_rascunho_v1");
  }catch(e){}
}
function openModeModal(){
  modal(`
    <div class="modal-head"><h3>Como você quer usar a plataforma agora?</h3><button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body">
      <div class="mode-grid">
        <button class="mode-card production" id="chooseProduction">
          <span class="mode-icon">✓</span><strong>Produção</strong>
          <small>Alunos, atendimentos, matrículas e financeiro entram nos registros oficiais.</small>
        </button>
        <button class="mode-card test" id="chooseTest">
          <span class="mode-icon">🧪</span><strong>Teste / Simulação</strong>
          <small>Registros ficam identificados como teste, fora dos indicadores oficiais e podem ser apagados depois.</small>
        </button>
      </div>
      ${state.adminToken?`<div class="test-cleanup"><div><b>Ambiente de testes</b><span>Apaga somente registros marcados como TESTE. Catálogo oficial e dados de produção são preservados.</span></div><button class="btn btn-danger" id="clearTestData">Limpar todos os testes</button></div>`:""}
    </div>`);
  $("#chooseProduction").onclick=()=>{setRunMode("PRODUCAO");closeModal();navigate(state.view)};
  $("#chooseTest").onclick=()=>{setRunMode("TESTE");closeModal();navigate(state.view)};
  $("[data-close]").onclick=closeModal;
  const clear=$("#clearTestData");
  if(clear) clear.onclick=async()=>{
    if(!confirm("Apagar TODOS os registros marcados como TESTE/Simulação? Os dados oficiais de produção serão preservados.")) return;
    clear.disabled=true;clear.textContent="Limpando…";
    try{
      const res=await api("limparDadosTeste",{token:state.adminToken});
      clearLocalTestData();state.bootstrap=null;
      setNotice("Ambiente de testes limpo: "+esc(res?.total||0)+" registro(s) removido(s).","ok");
      closeModal();await navigate(state.view);
    }catch(e){alert(e.message);clear.disabled=false;clear.textContent="Limpar todos os testes"}
  };
}
async function api(action, payload={}) {
  const writeActions=["salvarAluno","salvarResponsavel","criarMatriculaCompleta","atualizarDocumento","registrarPagamento","salvarMovimentoCaixa","salvarAtendimento","solicitarDesconto","decidirSolicitacaoDesconto","salvarPanfletoSerie","atualizarProduto","criarProdutoServico","aplicarReajusteIndividual","aplicarReajusteCatalogo"];
  if(writeActions.includes(action)&&!state.runMode){ openModeModal(); throw new Error("Escolha Produção ou Teste/Simulação antes de salvar."); }
  const meta={modo:currentRunMode(),sessaoTeste:state.runMode==="TESTE"?ensureTestSession():""};
  const r = await fetch(API, {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({action,...meta,...payload})});
  let out;
  try { out = await r.json(); } catch { throw new Error("Resposta inválida do servidor."); }
  if (!r.ok || !out.ok) throw new Error(out.error || "Falha no servidor.");
  return out.data;
}

async function checkApi() {
  const dot=$("#apiDot"), text=$("#apiStatus");
  try {
    const r = await fetch(API, {cache:"no-store"});
    const data = await r.json();
    if (r.ok && data.ok) { dot.className="status-dot online"; text.textContent="backend conectado"; }
    else throw new Error();
  } catch {
    dot.className="status-dot offline"; text.textContent="backend indisponível";
  }
}

function sessionLabel() {
  if (state.adminToken) return "Gestão ativa";
  if (state.staffToken) return "Secretaria ativa";
  return "Acessar";
}
function refreshSessionButton() { $("#sessionBtn").textContent=sessionLabel(); }

function modal(html) { $("#modalRoot").innerHTML=`<div class="modal-backdrop"><div class="modal">${html}</div></div>`; }
function closeModal() { $("#modalRoot").innerHTML=""; }

function authModal(targetRole="staff") {
  modal(`
    <div class="modal-head"><h3>Acesso ao sistema</h3><button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body">
      <div class="login-grid">
        <div class="login-card">
          <h4>Secretaria</h4><p class="muted">Alunos, responsáveis, matrícula e documentos.</p>
          <div class="field"><label>Senha da equipe</label><input id="staffPass" type="password" autocomplete="current-password" placeholder="••••••••"></div>
          <button class="btn btn-primary" id="staffLogin" style="margin-top:12px;width:100%">Entrar na Secretaria</button>
        </div>
        <div class="login-card">
          <h4>Gestão</h4><p class="muted">Produtos, valores, recebimentos, caixa e fechamento.</p>
          <div class="field"><label>Senha da Gestão</label><input id="adminPass" type="password" autocomplete="current-password" placeholder="••••••••"></div>
          <button class="btn btn-gold" id="adminLogin" style="margin-top:12px;width:100%">Entrar na Gestão</button>
        </div>
      </div>
      ${(state.staffToken||state.adminToken)?`<div style="margin-top:16px"><button class="btn btn-danger" id="logoutBtn">Encerrar sessões</button></div>`:""}
    </div>`);

  $("[data-close]").onclick=closeModal;
  $("#staffLogin").onclick=async()=>{
    const password=$("#staffPass").value;
    if(!password) return;
    const btn=$("#staffLogin"); btn.disabled=true; btn.textContent="Entrando…";
    try{
      const res=await api("loginSecretaria",{password});
      if(!res?.ok) throw new Error(res?.message||"Senha inválida.");
      state.staffToken=res.token; state.role="staff";
      sessionStorage.setItem("gf_staff_token",res.token); sessionStorage.setItem("gf_role","staff");
      refreshSessionButton(); closeModal(); state.bootstrap=null; await navigate(state.view);
    }catch(e){ alert(e.message); btn.disabled=false; btn.textContent="Entrar na Secretaria"; }
  };
  $("#adminLogin").onclick=async()=>{
    const password=$("#adminPass").value;
    if(!password) return;
    const btn=$("#adminLogin"); btn.disabled=true; btn.textContent="Entrando…";
    try{
      const res=await api("loginGestao",{password});
      if(!res?.ok) throw new Error(res?.message||"Senha inválida.");
      state.adminToken=res.token; state.role="admin";
      sessionStorage.setItem("gf_admin_token",res.token); sessionStorage.setItem("gf_role","admin");
      refreshSessionButton(); closeModal(); state.bootstrap=null; if(typeof pollApprovals==="function") pollApprovals(); await navigate(state.view);
    }catch(e){ alert(e.message); btn.disabled=false; btn.textContent="Entrar na Gestão"; }
  };
  const lo=$("#logoutBtn"); if(lo) lo.onclick=logoutAll;
  setTimeout(()=>$(targetRole==="admin"?"#adminPass":"#staffPass")?.focus(),50);
}

async function logoutAll(){
  try{ if(state.adminToken) await api("logout",{token:state.adminToken}); }catch{}
  try{ if(state.staffToken && state.staffToken!==state.adminToken) await api("logout",{token:state.staffToken}); }catch{}
  state.staffToken=""; state.adminToken=""; state.role=""; state.bootstrap=null;
  sessionStorage.removeItem("gf_staff_token");sessionStorage.removeItem("gf_admin_token");sessionStorage.removeItem("gf_role");
  refreshSessionButton();closeModal();navigate("dashboard");
}

async function requireRole(view){
  const role=roleForView(view);
  if(role==="public") return true;
  if(role==="staff" && tokenFor("staff")) return true;
  if(role==="admin" && state.adminToken) return true;
  authModal(role);
  return false;
}

async function loadCatalogProducts(){
  if(state.catalogProducts) return state.catalogProducts;
  if(state.catalogPromise) return state.catalogPromise;
  state.catalogPromise=api("listarProdutosPublicos").then(function(rows){state.catalogProducts=rows||[];return state.catalogProducts}).finally(function(){state.catalogPromise=null});
  return state.catalogPromise;
}

async function loadBootstrap(){
  if(state.bootstrap) return state.bootstrap;
  const token=tokenFor("staff");
  if(!token) throw new Error("Acesso da Secretaria necessário.");
  state.bootstrap=await api("bootstrapSecretaria",{token});
  return state.bootstrap;
}

async function navigate(view){
  state.view=view;
  $$("#nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  $("#pageTitle").textContent=titles[view]||"Gestão Futuro";
  setNotice("");
  if(!(await requireRole(view))) return;
  try{
    if(view==="dashboard") await renderDashboard();
    if(view==="atendimento") await renderAtendimento();
    if(view==="panfletos") await renderPanfletos();
    if(view==="alunos") await renderAlunos();
    if(view==="responsaveis") await renderResponsaveis();
    if(view==="matriculas") await renderMatriculas();
    if(view==="documentos") await renderDocumentos();
    if(view==="produtos") await renderProdutos();
    if(view==="autorizacoes") await renderAutorizacoes();
    if(view==="recebimentos") await renderRecebimentos();
    if(view==="caixa") await renderCaixa();
    if(view==="fechamento") await renderFechamento();
  }catch(e){
    if(/Sessão.*expirada|Sessão.*inválida/i.test(e.message)){ await logoutAll(); authModal(roleForView(view)); }
    $("#view").innerHTML=`<div class="card"><div class="empty">${esc(e.message)}</div></div>`;
  }
}

function dashNorm(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
function dashYear(p){return Number(p&&p.ANO_LETIVO)||Number((String(p&&p.ID_PRODUTO||"")+" "+String(p&&p.PRODUTO||"")).match(/20\d{2}/)?.[0])||0}
function dashKey(p){
  var id=String(p&&p.ID_PRODUTO||"").replace(/20\d{2}/g,"ANO").replace(/-\d+$/,"");
  var name=dashNorm(p&&p.PRODUTO||"").replace(/20\d{2}/g,"ano");
  return [id,name,dashNorm(p&&p.CATEGORIA),dashNorm(p&&p["SEGMENTO_SÉRIE"]),Number(p&&p.QTD_PARCELAS||0)].join("|");
}
function dashPct(a,b){a=Number(a||0);b=Number(b||0);return a?((b-a)/a)*100:0}
function dashBarRows(rows,maxValue,formatter){
  return rows.map(function(r){
    var a=Math.max(0,Number(r.a||0)),b=Math.max(0,Number(r.b||0)),ma=maxValue||Math.max(a,b,1);
    return "<div class='compare-row'><div class='compare-label'><b>"+esc(r.label)+"</b><span>"+esc(r.sub||"")+"</span></div><div class='compare-bars'><div class='bar-line'><em>2026</em><i style='width:"+Math.max(2,(a/ma)*100)+"%'></i><strong>"+esc(formatter(a))+"</strong></div><div class='bar-line y2'><em>2027</em><i style='width:"+Math.max(2,(b/ma)*100)+"%'></i><strong>"+esc(formatter(b))+"</strong></div></div></div>";
  }).join("");
}
async function renderDashboard(){
  $("#view").innerHTML=`<div class="cards grid">${["Alunos ativos","Matrículas ativas","Documentos pendentes","Status"].map(x=>`<div class="card metric"><div class="label">${x}</div><div class="value">…</div><div class="hint">atualizando</div></div>`).join("")}</div>`;
  let publicData={};
  try{ publicData=await api("dashboardPublico"); }catch(e){ setNotice(`Conexão da PWA pendente: ${esc(e.message)}`,"error"); }
  const vals=[publicData?.["Alunos ativos"]??0, publicData?.["Matrículas ativas"]??0, publicData?.["Documentos pendentes"]??0, "Online"];
  $$(".metric .value").forEach((el,i)=>el.textContent=vals[i]);
  $$(".metric .hint").forEach((el,i)=>el.textContent=i===3?"Apps Script + Google Sheets":"visão operacional");

  if(state.adminToken){
    try{
      const [d,products]=await Promise.all([
        api("dashboardGestao",{token:state.adminToken}).catch(()=>({})),
        api("listarProdutosGestao",{token:state.adminToken}).catch(()=>([]))
      ]);
      const cards=Object.entries(d).slice(0,8).map(([k,v])=>`<div class="card metric"><div class="label">${esc(k)}</div><div class="value" style="font-size:22px">${esc(v)}</div><div class="hint">Gestão</div></div>`).join("");
      if(cards)$("#view").insertAdjacentHTML("beforeend",`<div class="section-head"><h2>Indicadores financeiros</h2></div><div class="cards grid">${cards}</div>`);

      const p26=products.filter(p=>dashYear(p)===2026&&p.ATIVO!=="Não"),p27=products.filter(p=>dashYear(p)===2027&&p.ATIVO!=="Não");
      const m26=new Map(p26.map(p=>[dashKey(p),p])),m27=new Map(p27.map(p=>[dashKey(p),p]));
      const keys=[...new Set([...m26.keys(),...m27.keys()])];
      const compare=keys.map(k=>{
        const a=m26.get(k),b=m27.get(k),v26=Number(a?.VALOR_BASE||0),v27=Number(b?.VALOR_BASE||0);
        return {key:k,a,b,label:b?.PRODUTO||a?.PRODUTO||"",cat:b?.CATEGORIA||a?.CATEGORIA||"Outros",serie:b?.["SEGMENTO_SÉRIE"]||a?.["SEGMENTO_SÉRIE"]||"",v26,v27,pct:v26&&v27?dashPct(v26,v27):null};
      }).sort((x,y)=>(x.cat.localeCompare(y.cat)||x.label.localeCompare(y.label)));
      const both=compare.filter(x=>x.v26&&x.v27),avg=both.length?both.reduce((s,x)=>s+x.pct,0)/both.length:0,new27=compare.filter(x=>!x.v26&&x.v27).length;
      const cats=[...new Set(compare.map(x=>x.cat))].sort();
      const countRows=cats.map(cat=>({label:cat,a:p26.filter(p=>(p.CATEGORIA||"Outros")===cat).length,b:p27.filter(p=>(p.CATEGORIA||"Outros")===cat).length}));
      const valueRows=cats.map(cat=>({label:cat,a:p26.filter(p=>(p.CATEGORIA||"Outros")===cat).reduce((s,p)=>s+Number(p.VALOR_BASE||0),0),b:p27.filter(p=>(p.CATEGORIA||"Outros")===cat).reduce((s,p)=>s+Number(p.VALOR_BASE||0),0)}));
      const pctRows=cats.map(cat=>{const arr=both.filter(x=>x.cat===cat);return {label:cat,a:0,b:arr.length?arr.reduce((s,x)=>s+x.pct,0)/arr.length:0,sub:arr.length+" item(ns) comparáveis"}});
      const maxCount=Math.max(1,...countRows.flatMap(r=>[r.a,r.b])),maxValue=Math.max(1,...valueRows.flatMap(r=>[r.a,r.b])),maxPct=Math.max(1,...pctRows.map(r=>Math.abs(r.b)));
      $("#view").insertAdjacentHTML("beforeend",
        `<div class="section-head"><div><h2>Comparativo do catálogo • 2026 × 2027</h2><span class="muted">Produtos e serviços oficiais, incluindo mensalidades, materiais, fardamento e adicionais.</span></div><button class="btn btn-soft" data-go="produtos">Abrir catálogo</button></div>
        <div class="cards grid comparison-kpis">
          <div class="card metric"><div class="label">Itens 2026</div><div class="value">${p26.length}</div><div class="hint">ativos no catálogo</div></div>
          <div class="card metric"><div class="label">Itens 2027</div><div class="value">${p27.length}</div><div class="hint">ativos no catálogo</div></div>
          <div class="card metric"><div class="label">Reajuste médio</div><div class="value">${avg.toLocaleString("pt-BR",{maximumFractionDigits:2})}%</div><div class="hint">${both.length} itens equivalentes</div></div>
          <div class="card metric"><div class="label">Novos em 2027</div><div class="value">${new27}</div><div class="hint">sem equivalente em 2026</div></div>
        </div>
        <div class="dashboard-chart-grid">
          <section class="card chart-card"><div class="chart-title"><h3>Quantidade por categoria</h3><span>2026 × 2027</span></div>${dashBarRows(countRows,maxCount,v=>String(Math.round(v)))}</section>
          <section class="card chart-card"><div class="chart-title"><h3>Soma dos valores cadastrados</h3><span>visão de catálogo, não receita</span></div>${dashBarRows(valueRows,maxValue,v=>money(v))}</section>
          <section class="card chart-card"><div class="chart-title"><h3>Reajuste médio por categoria</h3><span>itens equivalentes</span></div>${pctRows.map(r=>`<div class="pct-row"><div><b>${esc(r.label)}</b><small>${esc(r.sub)}</small></div><div class="pct-track"><i style="width:${Math.min(100,Math.abs(r.b)/maxPct*100)}%"></i></div><strong>${Number(r.b).toLocaleString("pt-BR",{maximumFractionDigits:2})}%</strong></div>`).join("")}</section>
        </div>
        <div class="section-head"><h2>Todos os produtos e serviços comparados</h2><span class="muted">${compare.length} linhas</span></div>
        <div class="table-wrap"><table class="comparison-table"><thead><tr><th>Categoria</th><th>Produto/serviço</th><th>Série</th><th>2026</th><th>2027</th><th>Variação</th></tr></thead><tbody>${compare.map(x=>`<tr><td>${esc(x.cat)}</td><td><strong>${esc(x.label)}</strong></td><td>${esc(x.serie)}</td><td class="money">${x.v26?money(x.v26):"—"}</td><td class="money">${x.v27?money(x.v27):"—"}</td><td>${x.pct==null?pill(x.v27?"Novo":"Sem 2027",x.v27?"ok":"warn"):`<span class="variation ${x.pct>0?"up":x.pct<0?"down":""}">${x.pct>0?"+":""}${x.pct.toLocaleString("pt-BR",{maximumFractionDigits:2})}%</span>`}</td></tr>`).join("")||`<tr><td colspan="6" class="empty">Sem dados comparativos.</td></tr>`}</tbody></table></div>`
      );
    }catch(e){
      $("#view").insertAdjacentHTML("beforeend",`<div class="notice error">Não foi possível montar o comparativo 2026 × 2027: ${esc(e.message)}</div>`);
    }
  }
  $("#view").insertAdjacentHTML("beforeend",`<div class="section-head"><h2>Atalhos</h2></div><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(210px,1fr))">
    <button class="card btn-soft" data-go="atendimento" style="text-align:left"><strong>Atendimento de matrículas</strong><br><span class="muted">Funil, proposta e pedido de desconto</span></button>
    <button class="card btn-soft" data-go="alunos" style="text-align:left"><strong>Cadastro de alunos</strong><br><span class="muted">Consulta e ficha escolar</span></button>
    <button class="card btn-soft" data-go="matriculas" style="text-align:left"><strong>Nova matrícula</strong><br><span class="muted">Contrato, plano e checklist</span></button>
    <button class="card btn-soft" data-go="produtos" style="text-align:left"><strong>Produtos e valores</strong><br><span class="muted">Acesso da Gestão</span></button>
    <button class="card btn-soft" data-go="caixa" style="text-align:left"><strong>Fluxo de caixa</strong><br><span class="muted">Entradas e saídas</span></button>
  </div>`);
  $$('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
}

