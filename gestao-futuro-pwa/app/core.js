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
  flyerCache: {}
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

async function api(action, payload={}) {
  const r = await fetch(API, {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({action,...payload})});
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

async function renderDashboard(){
  $("#view").innerHTML=`<div class="cards grid">${["Alunos ativos","Matrículas ativas","Documentos pendentes","Status"].map(x=>`<div class="card metric"><div class="label">${x}</div><div class="value">…</div><div class="hint">atualizando</div></div>`).join("")}</div>`;
  let publicData={};
  try{ publicData=await api("dashboardPublico"); }catch(e){ setNotice(`Conexão da PWA pendente: ${esc(e.message)}`,"error"); }
  const vals=[publicData?.["Alunos ativos"]??0, publicData?.["Matrículas ativas"]??0, publicData?.["Documentos pendentes"]??0, "Online"];
  $$(".metric .value").forEach((el,i)=>el.textContent=vals[i]);
  $$(".metric .hint").forEach((el,i)=>el.textContent=i===3?"Apps Script + Google Sheets":"visão operacional");

  if(state.adminToken){
    try{
      const d=await api("dashboardGestao",{token:state.adminToken});
      const cards=Object.entries(d).slice(0,8).map(([k,v])=>`<div class="card metric"><div class="label">${esc(k)}</div><div class="value" style="font-size:22px">${esc(v)}</div><div class="hint">Gestão</div></div>`).join("");
      $("#view").insertAdjacentHTML("beforeend",`<div class="section-head"><h2>Indicadores financeiros</h2></div><div class="cards grid">${cards}</div>`);
    }catch{}
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

