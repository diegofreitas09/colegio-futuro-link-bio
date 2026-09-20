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
  testSession: sessionStorage.getItem("gf_test_session") || "",
  apiCache: new Map(),
  apiInflight: new Map(),
  navSeq: 0
};

const titles = {
  dashboard:"Dashboard", atendimento:"Atendimento de matrículas", panfletos:"Panfletos por série", alunos:"Alunos", responsaveis:"Responsáveis", matriculas:"Matrículas",
  documentos:"Documentos", produtos:"Valores e reajustes", autorizacoes:"Autorizações da Gestão", recebimentos:"Recebimentos",
  caixa:"Fluxo de caixa", fechamento:"Fechamento financeiro", integracoes:"Central de integrações", acessos:"Acessos da escola"
};

const INTERFACE_VIEWS = Object.freeze({
  staff:["dashboard","atendimento","panfletos","alunos","responsaveis","matriculas","documentos","acessos"],
  admin:["dashboard","panfletos","produtos","autorizacoes","recebimentos","caixa","fechamento","integracoes","acessos"],
  public:["dashboard"]
});
const roleForView = view => ["produtos","autorizacoes","recebimentos","caixa","fechamento","integracoes"].includes(view) ? "admin" : ["atendimento","alunos","responsaveis","matriculas","documentos"].includes(view) ? "staff" : ["panfletos","acessos"].includes(view) ? "shared" : "public";
const activeInterfaceRole = () => state.role==="admin" && state.adminToken ? "admin" : state.role==="staff" && state.staffToken ? "staff" : "public";
const allowedViewsFor = role => INTERFACE_VIEWS[role] || INTERFACE_VIEWS.public;
const tokenFor = role => role === "admin" ? state.adminToken : (state.role==="staff" ? state.staffToken : state.adminToken);
function isViewAllowed(view){return allowedViewsFor(activeInterfaceRole()).includes(view)}
function applyRoleInterface(){
  const role=activeInterfaceRole(),allowed=new Set(allowedViewsFor(role));
  $$("#nav button").forEach(btn=>{
    const show=allowed.has(btn.dataset.view);
    btn.hidden=!show;
    btn.setAttribute("aria-hidden",show?"false":"true");
  });
  document.body.classList.remove("interface-staff","interface-admin","interface-public");
  document.body.classList.add("interface-"+role);
  const brandArea=$("#brandArea");
  if(brandArea)brandArea.textContent=role==="staff"?"Secretaria • Atendimento • Matrículas":role==="admin"?"Gestão • Financeiro • Autorizações":"Secretaria • Gestão • Financeiro";
  const badge=$("#interfaceBadge");
  if(badge){
    badge.textContent=role==="staff"?"Interface Secretaria":role==="admin"?"Interface Gestão":"Escolha seu acesso";
    badge.className="interface-badge "+role;
  }
  refreshModeButton();
}

function esc(v="") { return String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function money(v) { const n=Number(String(v ?? 0).replace(",",".")) || 0; return n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
function val(obj, ...keys) { for (const k of keys) if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k]; return ""; }
function pill(text, cls="") { return `<span class="pill ${cls}">${esc(text || "—")}</span>`; }

function setNotice(message="", kind="") {
  const box = $("#notice");
  box.innerHTML = message ? `<div class="notice ${kind}">${message}</div>` : "";
}
function showToast(message="",kind="ok"){
  let root=document.getElementById("toastRoot");
  if(!root){root=document.createElement("div");root.id="toastRoot";root.className="toast-root";document.body.appendChild(root)}
  const t=document.createElement("div");
  t.className="app-toast "+(kind||"ok");
  t.innerHTML=(kind==="ok"?"<span class='toast-icon'>✓</span>":kind==="error"?"<span class='toast-icon'>!</span>":"")+"<strong>"+esc(message)+"</strong>";
  root.appendChild(t);
  requestAnimationFrame(()=>t.classList.add("show"));
  setTimeout(()=>{t.classList.remove("show");setTimeout(()=>t.remove(),240)},3200);
}
function primeAppAlerts(){
  try{
    if(window.__gfAudioCtx)return window.__gfAudioCtx;
    const C=window.AudioContext||window.webkitAudioContext;
    if(!C)return null;
    window.__gfAudioCtx=new C();
    if(window.__gfAudioCtx.state==="suspended")window.__gfAudioCtx.resume().catch(()=>{});
    return window.__gfAudioCtx;
  }catch(e){return null}
}
function appAlert(kind="attention",message=""){
  const patterns={
    matricula:{vibrate:[140,70,140,70,260],tones:[[660,110],[880,130],[1100,170]]},
    desconto:{vibrate:[220,100,220,100,320],tones:[[880,130],[740,130],[880,190]]},
    attention:{vibrate:[180,80,220],tones:[[820,140],[980,180]]}
  };
  const p=patterns[kind]||patterns.attention;
  try{ if(navigator.vibrate) navigator.vibrate(p.vibrate); }catch(e){}
  try{
    const ctx=primeAppAlerts();
    if(ctx){
      if(ctx.state==="suspended")ctx.resume().catch(()=>{});
      const gain=ctx.createGain();gain.connect(ctx.destination);gain.gain.value=.075;
      let t=ctx.currentTime+.025;
      p.tones.forEach(([freq,dur])=>{
        const o=ctx.createOscillator();o.type="sine";o.frequency.value=freq;o.connect(gain);
        o.start(t);o.stop(t+dur/1000);t+=dur/1000+.045;
      });
    }
  }catch(e){}
  if(message) showToast(message,"ok");
}
function pushKeyBytes(base64String){
  const padding="=".repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,"+").replace(/_/g,"/");
  const raw=atob(base64),out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
  return out;
}
async function enableDirectorPush(){
  if(!state.adminToken) throw new Error("Entre na Gestão para ativar as notificações do diretor.");
  if(!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw new Error("Este aparelho/navegador não oferece suporte a notificações push.");
  const perm=await Notification.requestPermission();
  if(perm!=="granted") throw new Error("Permissão de notificações não autorizada no aparelho.");
  const cfgRes=await fetch("/api/push",{cache:"no-store"});
  const cfg=await cfgRes.json();
  if(!cfgRes.ok||!cfg?.publicKey)throw new Error(cfg?.error||"Configuração de push ainda não publicada.");
  const reg=await navigator.serviceWorker.ready;
  let sub=await reg.pushManager.getSubscription();
  if(!sub){
    sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:pushKeyBytes(cfg.publicKey)});
  }
  const r=await fetch("/api/push",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"subscribe",token:state.adminToken,subscription:sub.toJSON(),label:"Direção"})});
  const out=await r.json();
  if(!r.ok||!out?.ok)throw new Error(out?.error||"Não foi possível registrar este celular.");
  localStorage.setItem("gf_director_push","1");
  showToast("Celular do diretor ativado para novas matrículas e descontos ✓","ok");
  return true;
}
async function refreshDirectorPushButton(){
  const b=$("#directorPushBtn");if(!b)return;
  if(!("serviceWorker" in navigator)||!("PushManager" in window)){b.textContent="Push indisponível";b.disabled=true;return}
  try{
    const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();
    if(sub&&Notification.permission==="granted"){b.textContent="Notificações ativas ✓";b.className="btn btn-production";}
  }catch(e){}
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
  const clear=$("#clearTestBtn");
  if(clear){
    const canClear=state.runMode==="TESTE" && activeInterfaceRole()==="admin" && !!state.adminToken;
    clear.classList.toggle("hidden",!canClear);
    clear.disabled=!canClear;
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
function resetRunModeForEntry(){
  state.runMode="";
  state.testSession="";
  sessionStorage.removeItem("gf_run_mode");
  sessionStorage.removeItem("gf_test_session");
  refreshModeButton();
}
function notificationStateLabel(){
  if(!("Notification" in window))return {label:"Não disponível",cls:"off"};
  if(Notification.permission==="granted")return {label:"Ativas",cls:"ok"};
  if(Notification.permission==="denied")return {label:"Bloqueadas no navegador",cls:"off"};
  return {label:"Aguardando autorização",cls:"warn"};
}
async function ensureEntryNotifications(){
  if(!("Notification" in window))return {permission:"unsupported",push:false};
  let permission=Notification.permission;
  if(permission==="default"){
    try{permission=await Notification.requestPermission()}catch(e){}
  }
  let push=false;
  if(permission==="granted"){
    localStorage.setItem("gf_notifications_enabled","1");
    try{
      if(state.adminToken&&typeof enableDirectorPush==="function"){
        await enableDirectorPush();push=true;
      }
    }catch(e){}
  }
  return {permission,push};
}
function closeModeGate(){
  const root=$("#modeGateRoot");if(root)root.innerHTML="";
  document.body.classList.remove("mode-gated");
}
async function selectEntryMode(mode,button){
  const old=button?.innerHTML||"";
  if(button){button.disabled=true;button.innerHTML="<strong>Preparando…</strong><small>Ativando ambiente e notificações</small>"}
  setRunMode(mode);
  const notif=await ensureEntryNotifications();
  closeModeGate();
  if(notif.permission==="denied"){
    showToast("Modo escolhido. As notificações estão bloqueadas no navegador; você pode liberá-las nas permissões do site.","error");
  }else if(notif.permission==="granted"){
    showToast((mode==="TESTE"?"Simulação":"Produção")+" ativa • notificações liberadas ✓","ok");
  }else{
    showToast((mode==="TESTE"?"Simulação":"Produção")+" ativa ✓","ok");
  }
  await navigate("dashboard");
  if(button){button.disabled=false;button.innerHTML=old}
}
function openModeGate(){
  if(!(state.staffToken||state.adminToken))return;
  const root=$("#modeGateRoot");if(!root)return;
  const role=activeInterfaceRole();
  const notif=notificationStateLabel();
  document.body.classList.add("mode-gated");
  root.innerHTML=`
    <section class="mode-gate" aria-modal="true" role="dialog">
      <div class="mode-gate-bg"></div>
      <div class="mode-gate-card">
        <div class="mode-gate-brand">
          ${window.FUTURO_BRAND?.logo?`<img src="${window.FUTURO_BRAND.logo}" alt="Colégio Futuro">`:""}
          <div><span>GESTÃO FUTURO</span><b>${role==="admin"?"Interface Gestão":"Interface Secretaria"}</b></div>
        </div>
        <div class="mode-gate-copy">
          <span class="mode-gate-kicker">ANTES DE CONTINUAR</span>
          <h1>Como você vai usar a plataforma agora?</h1>
          <p>Escolha uma opção para liberar o sistema. Enquanto você não escolher, nenhum menu ou comando ficará disponível.</p>
        </div>
        <div class="mode-gate-options">
          <button class="mode-gate-option production" id="gateProduction">
            <span class="mode-gate-icon">✓</span>
            <div><strong>Produção</strong><small>Dados oficiais: alunos, matrículas, atendimentos, financeiro e autorizações entram no fluxo real.</small></div>
            <i>Entrar</i>
          </button>
          <button class="mode-gate-option test" id="gateTest">
            <span class="mode-gate-icon">🧪</span>
            <div><strong>Teste / Simulação</strong><small>Use para treinamento e conferência. Os registros ficam separados e não afetam os dados oficiais.</small></div>
            <i>Simular</i>
          </button>
        </div>
        <div class="mode-gate-notification">
          <div><span class="notify-dot ${notif.cls}"></span><div><b>Notificações</b><small id="gateNotifyText">${notif.label}. Ao escolher o ambiente, vamos solicitar/liberar as notificações neste aparelho.</small></div></div>
          <span class="mode-gate-device">${/Mobi|Android/i.test(navigator.userAgent)?"Celular":"Desktop"}</span>
        </div>
        <div class="mode-gate-foot"><span>Escolha obrigatória para proteger os dados oficiais.</span><button class="link-btn" id="gateLogout">Sair do acesso</button></div>
      </div>
    </section>`;
  $("#gateProduction").onclick=function(){selectEntryMode("PRODUCAO",this)};
  $("#gateTest").onclick=function(){selectEntryMode("TESTE",this)};
  $("#gateLogout").onclick=logoutAll;
}
async function clearAllTestData(){
  if(activeInterfaceRole()!=="admin"||!state.adminToken){
    showToast("A limpeza de testes é exclusiva da Gestão.","error");
    return;
  }
  if(state.runMode!=="TESTE"){
    showToast("Ative Teste / Simulação antes de usar a limpeza.","error");
    return;
  }
  const ok=confirm("Limpar TODOS os registros de Teste/Simulação?\n\nA Produção será preservada. Esta ação não pode ser desfeita.");
  if(!ok)return;
  const btn=$("#clearTestBtn"),old=btn?.textContent||"🧹 Limpar teste";
  if(btn){btn.disabled=true;btn.textContent="Limpando…";}
  try{
    const res=await api("limparDadosTeste",{token:state.adminToken});
    clearLocalTestData();
    clearApiCache();
    state.bootstrap=null;
    state.testSession="TST-"+Date.now()+"-"+Math.random().toString(36).slice(2,7).toUpperCase();
    sessionStorage.setItem("gf_test_session",state.testSession);
    sessionStorage.setItem("gf_pending_approvals","0");
    const badge=$("#approvalBadge");if(badge){badge.textContent="0";badge.classList.add("hidden")}
    showToast("Teste limpo: "+Number(res?.total||0)+" registro(s) removido(s) ✓","ok");
    await navigate(state.view||"dashboard");
  }catch(e){
    const msg=String(e?.message||"Não foi possível limpar o teste.");
    if(/ainda não está disponível|Ação não reconhecida|não reconhecida/i.test(msg)){
      showToast("O botão voltou, mas a limpeza total ainda precisa ser publicada no servidor do Apps Script.","error");
    }else{
      showToast(msg,"error");
    }
  }finally{
    if(btn){btn.disabled=false;btn.textContent=old;}
    refreshModeButton();
  }
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
function openModeModal(){ openModeGate(); }
const clearTestTop=$("#clearTestBtn"); if(clearTestTop) clearTestTop.onclick=clearAllTestData;

const API_CACHE_TTL = Object.freeze({
  dashboardPublico:15000,dashboardGestao:15000,bootstrapSecretaria:30000,
  listarProdutosPublicos:300000,listarProdutosGestao:60000,listarAtendimentos:12000,
  getPanfletoSerie:60000,listarSolicitacoesDesconto:8000,listarRecebimentos:15000,
  listarCaixa:15000,listarCategorias:120000,getFechamento:15000,listarDocumentosAluno:15000,getAtendimento:10000
});
function apiCacheKey(action,payload,meta){
  const safe={...payload}; if(safe.password)safe.password="***";
  return action+"|"+meta.modo+"|"+JSON.stringify(safe);
}
function clearApiCache(){state.apiCache.clear();state.bootstrap=null}
async function api(action, payload={}) {
  const writeActions=["salvarAluno","salvarResponsavel","criarMatriculaCompleta","atualizarDocumento","registrarPagamento","salvarMovimentoCaixa","salvarAtendimento","solicitarDesconto","decidirSolicitacaoDesconto","salvarPanfletoSerie","atualizarProduto","criarProdutoServico","aplicarReajusteIndividual","aplicarReajusteCatalogo","limparDadosTeste","limparAutorizacoesTeste"];
  if(writeActions.includes(action)&&!state.runMode){openModeGate();throw new Error("Escolha Produção ou Teste/Simulação antes de salvar.")}
  const meta={modo:currentRunMode(),sessaoTeste:state.runMode==="TESTE"?ensureTestSession():""};
  const ttl=API_CACHE_TTL[action]||0,key=ttl?apiCacheKey(action,payload,meta):"";
  if(ttl){
    const hit=state.apiCache.get(key);
    if(hit&&(Date.now()-hit.at)<ttl)return hit.data;
    if(state.apiInflight.has(key))return state.apiInflight.get(key);
  }
  const request=(async()=>{
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),25000);
    try{
      const r=await fetch(API,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,...meta,...payload}),signal:ctrl.signal});
      let out;try{out=await r.json()}catch{throw new Error("Resposta inválida do servidor.")}
      if(!r.ok||!out.ok){
        const msg=String(out.error||"Falha no servidor.");
        if(/^Ação não reconhecida:/i.test(msg))throw new Error("Este comando ainda não está disponível nesta versão do servidor.");
        throw new Error(msg);
      }
      if(ttl)state.apiCache.set(key,{at:Date.now(),data:out.data});
      if(writeActions.includes(action))clearApiCache();
      return out.data;
    }catch(e){
      if(e?.name==="AbortError")throw new Error("O servidor demorou demais para responder. Tente novamente.");
      throw e;
    }finally{clearTimeout(timer);if(ttl)state.apiInflight.delete(key)}
  })();
  if(ttl)state.apiInflight.set(key,request);
  return request;
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
function refreshInterfaceSwitch(){
  const b=$("#interfaceSwitchBtn"); if(!b) return;
  const role=activeInterfaceRole();
  if(role==="staff"||role==="admin"){
    b.classList.remove("hidden"); b.textContent="⌂ Início"; b.dataset.targetRole="home"; b.title="Voltar à tela principal";
  }else{
    b.classList.add("hidden"); b.dataset.targetRole="";
  }
}
function refreshSessionButton() {
  $("#sessionBtn").textContent=sessionLabel();
  refreshInterfaceSwitch();
}

function modal(html) { $("#modalRoot").innerHTML=`<div class="modal-backdrop"><div class="modal">${html}</div></div>`; }
function closeModal() { $("#modalRoot").innerHTML=""; }
function switchInterfaceModal(targetRole){
  const toAdmin=targetRole==="admin";
  const isPublic=activeInterfaceRole()==="public";
  const title=isPublic?(toAdmin?"Acessar Gestão":"Acessar Secretaria"):(toAdmin?"Trocar para Gestão":"Trocar para Secretaria");
  const subtitle=toAdmin
    ?"Informe a senha da Gestão para abrir a área administrativa e financeira."
    :"Informe a senha da Secretaria para abrir a área operacional.";
  modal(`
    <div class="modal-head"><h3>${title}</h3><button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body">
      <div class="switch-login-card ${toAdmin?"admin":"staff"}">
        <div class="switch-login-icon">${toAdmin?"🔐":"🗂️"}</div>
        <div><b>${toAdmin?"Interface Gestão":"Interface Secretaria"}</b><p class="muted">${subtitle}</p></div>
      </div>
      <div class="field"><label>${toAdmin?"Senha da Gestão":"Senha da Secretaria"}</label><input id="switchRolePass" type="password" autocomplete="current-password" placeholder="••••••••"></div>
      <div class="notice warn">A troca só acontece depois da senha ser validada. Se a senha estiver incorreta, você permanece na interface atual.</div>
    </div>
    <div class="modal-foot"><button class="btn btn-soft" data-close>Cancelar</button><button class="btn ${toAdmin?"btn-gold":"btn-primary"}" id="confirmRoleSwitch">${title}</button></div>`);
  $$("[data-close]").forEach(x=>x.onclick=closeModal);
  $("#confirmRoleSwitch").onclick=async function(){
    const password=$("#switchRolePass").value;
    if(!password){$("#switchRolePass").focus();return}
    const btn=this,old=btn.textContent;btn.disabled=true;btn.textContent="Validando…";
    try{
      const action=toAdmin?"loginGestao":"loginSecretaria";
      const res=await api(action,{password});
      if(!res?.ok)throw new Error(res?.message||"Senha inválida.");
      const oldStaff=state.staffToken,oldAdmin=state.adminToken;
      if(toAdmin){
        state.adminToken=res.token;state.staffToken="";state.role="admin";
        sessionStorage.setItem("gf_admin_token",res.token);sessionStorage.removeItem("gf_staff_token");sessionStorage.setItem("gf_role","admin");
        if(oldStaff){try{await api("logout",{token:oldStaff})}catch{}}
      }else{
        state.staffToken=res.token;state.adminToken="";state.role="staff";
        sessionStorage.setItem("gf_staff_token",res.token);sessionStorage.removeItem("gf_admin_token");sessionStorage.setItem("gf_role","staff");
        if(oldAdmin){try{await api("logout",{token:oldAdmin})}catch{}}
      }
      clearApiCache();state.bootstrap=null;setRunMode("PRODUCAO");
      applyRoleInterface();refreshSessionButton();closeModal();
      if(typeof hideHomeScreen==="function")hideHomeScreen();
      showToast((isPublic?"Acesso liberado: ":"Interface alterada para ")+(toAdmin?"Gestão":"Secretaria")+" ✓","ok");
      if(toAdmin&&typeof pollApprovals==="function")pollApprovals();
      ensureEntryNotifications().catch(()=>{});
      await navigate("dashboard");
      if(typeof resetHomeIdle==="function")resetHomeIdle();
    }catch(e){
      showToast(e.message||"Senha inválida.","error");
      btn.disabled=false;btn.textContent=old;$("#switchRolePass").focus();
    }
  };
  $("#switchRolePass").addEventListener("keydown",e=>{if(e.key==="Enter")$("#confirmRoleSwitch").click()});
  setTimeout(()=>$("#switchRolePass")?.focus(),50);
}

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
      if(state.adminToken){try{await api("logout",{token:state.adminToken})}catch{}}
      state.adminToken="";sessionStorage.removeItem("gf_admin_token");
      state.staffToken=res.token; state.role="staff";
      sessionStorage.setItem("gf_staff_token",res.token); sessionStorage.setItem("gf_role","staff");
      state.bootstrap=null;setRunMode("PRODUCAO");applyRoleInterface();refreshSessionButton(); closeModal(); if(typeof hideHomeScreen==="function")hideHomeScreen(); ensureEntryNotifications().catch(()=>{}); await navigate("dashboard"); if(typeof resetHomeIdle==="function")resetHomeIdle();
    }catch(e){ alert(e.message); btn.disabled=false; btn.textContent="Entrar na Secretaria"; }
  };
  $("#adminLogin").onclick=async()=>{
    const password=$("#adminPass").value;
    if(!password) return;
    const btn=$("#adminLogin"); btn.disabled=true; btn.textContent="Entrando…";
    try{
      const res=await api("loginGestao",{password});
      if(!res?.ok) throw new Error(res?.message||"Senha inválida.");
      if(state.staffToken){try{await api("logout",{token:state.staffToken})}catch{}}
      state.staffToken="";sessionStorage.removeItem("gf_staff_token");
      state.adminToken=res.token; state.role="admin";
      sessionStorage.setItem("gf_admin_token",res.token); sessionStorage.setItem("gf_role","admin");
      state.bootstrap=null;setRunMode("PRODUCAO");applyRoleInterface();refreshSessionButton(); closeModal(); if(typeof hideHomeScreen==="function")hideHomeScreen(); if(typeof pollApprovals==="function") pollApprovals(); ensureEntryNotifications().catch(()=>{}); await navigate("dashboard"); if(typeof resetHomeIdle==="function")resetHomeIdle();
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
  resetRunModeForEntry();closeModeGate();applyRoleInterface();refreshSessionButton();closeModal();navigate("dashboard");if(typeof showHomeScreen==="function")showHomeScreen("logout");
}

async function requireRole(view){
  const active=activeInterfaceRole(),required=roleForView(view);
  if(!isViewAllowed(view)){
    showToast(active==="staff"?"Este comando pertence à interface da Gestão.":"Este comando pertence à interface da Secretaria.","error");
    return false;
  }
  if(required==="public") return true;
  if(required==="shared"){
    if(active==="staff"&&state.staffToken)return true;
    if(active==="admin"&&state.adminToken)return true;
    authModal("staff");return false;
  }
  if(required==="staff" && active==="staff" && state.staffToken) return true;
  if(required==="admin" && active==="admin" && state.adminToken) return true;
  authModal(required);
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
  applyRoleInterface();
  if(!isViewAllowed(view)) view="dashboard";
  const seq=++state.navSeq;
  state.view=view;
  $$("#nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  $("#pageTitle").textContent=titles[view]||"Gestão Futuro";
  setNotice("");
  const target=$("#view");
  if(target)target.innerHTML="<div class='fast-loading'><span></span><b>Abrindo…</b></div>";
  await new Promise(requestAnimationFrame);
  if(!(await requireRole(view))) return;
  if(seq!==state.navSeq)return;
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
    if(view==="integracoes") await renderIntegracoes();
    if(view==="acessos") await renderAcessos();
  }catch(e){
    if(/Sessão.*expirada|Sessão.*inválida/i.test(e.message)){ await logoutAll(); authModal(roleForView(view)); }
    $("#view").innerHTML=`<div class="card"><div class="empty">${esc(e.message)}</div></div>`;
  }
}

function renderAcessos(){
  const acessos=[
    {
      nome:"Agenda On-line • Computex",
      descricao:"Acesso ao sistema escolar Computex utilizado pela escola.",
      url:"https://escola.computex.com.br/escola329/index2.php",
      icon:"https://www.google.com/s2/favicons?domain=escola.computex.com.br&sz=128",
      fallback:"C",
      destaque:true
    },
    {
      nome:"Site oficial do Colégio Futuro",
      descricao:"Portal institucional da escola, informações, projetos e contatos.",
      url:"https://colegiofuturoce.com.br",
      icon:"/assets/app-icon-192.png",
      fallback:"F"
    },
    {
      nome:"Gestão Futuro",
      descricao:"Plataforma interna de Secretaria, Gestão, Financeiro e Matrículas.",
      url:"https://gestao.colegiofuturoce.com.br",
      icon:"/assets/app-icon-192.png",
      fallback:"G"
    }
  ];
  $("#view").innerHTML=`
    <section class="school-access-hero">
      <div>
        <span>ATALHOS INSTITUCIONAIS</span>
        <h2>Acessos da escola</h2>
        <p>Um único lugar para abrir os sistemas e portais usados pela Secretaria e pela Gestão.</p>
      </div>
      <div class="school-access-count">${acessos.length}<small>acessos</small></div>
    </section>
    <div class="school-access-grid">
      ${acessos.map(a=>`
        <a class="school-access-card ${a.destaque?"featured":""}" href="${a.url}" target="_blank" rel="noopener noreferrer">
          <div class="school-access-icon">
            <img src="${a.icon}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
            <b style="display:none">${a.fallback}</b>
          </div>
          <div class="school-access-copy">
            <strong>${a.nome}</strong>
            <span>${a.descricao}</span>
            <small>${new URL(a.url).hostname}</small>
          </div>
          <i>↗</i>
        </a>`).join("")}
    </div>
    <div class="school-access-note">
      <b>Central única de acessos</b>
      <span>Os próximos sistemas da escola podem ser adicionados aqui, mantendo Secretaria e Gestão com a mesma lista oficial.</span>
    </div>`;
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
  const roleNow=activeInterfaceRole();
  const heroLabel=roleNow==="admin"?"Gestão • Financeiro • Autorizações":roleNow==="staff"?"Secretaria • Atendimento • Matrículas":"Gestão escolar integrada";
  $("#view").innerHTML=`<section class="dashboard-brand-hero">
    <div class="dashboard-brand-visual">
      <img class="dashboard-hero-logo" src="${window.FUTURO_BRAND?.icon||"/assets/app-icon-512.png"}" alt="Colégio Futuro">
      <div class="dashboard-hero-copy"><small>COLÉGIO FUTURO</small><strong>Gestão Futuro</strong><p>Secretaria • Atendimento • Matrículas • Gestão • Financeiro</p></div>
    </div>
    <div class="dashboard-brand-caption"><span>${heroLabel}</span></div>
  </section>
  <div class="cards grid">${["Alunos ativos","Matrículas ativas","Documentos pendentes","Status"].map(x=>`<div class="card metric"><div class="label">${x}</div><div class="value">…</div><div class="hint">atualizando</div></div>`).join("")}</div>`;
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
      $("#view").insertAdjacentHTML("beforeend",`<div class="card director-push-card"><div><b>📲 Avisos no celular do diretor</b><span>Receba notificações mesmo com a PWA fechada quando houver matrícula realizada ou solicitação de desconto.</span></div><button class="btn btn-gold" id="directorPushBtn">Ativar notificações</button></div>`);
      $("#directorPushBtn").onclick=async function(){var b=this,old=b.textContent;b.disabled=true;b.textContent="Ativando…";try{await enableDirectorPush();b.textContent="Notificações ativas ✓";b.className="btn btn-production"}catch(e){showToast(e.message,"error");b.disabled=false;b.textContent=old}};
      refreshDirectorPushButton();

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
  const role=activeInterfaceRole();
  const shortcutHtml=role==="admin"
    ? `<div class="section-head"><h2>Gestão e financeiro</h2><span class="muted">Área restrita à direção/gestão.</span></div><div class="grid role-shortcuts">
        <button class="card btn-soft" data-go="autorizacoes"><strong>Autorizações</strong><br><span class="muted">Pedidos de desconto aguardando decisão</span></button>
        <button class="card btn-soft" data-go="produtos"><strong>Valores e reajustes</strong><br><span class="muted">Editar catálogo, serviços e reajustes</span></button>
        <button class="card btn-soft" data-go="recebimentos"><strong>Recebimentos</strong><br><span class="muted">Receitas e pagamentos registrados</span></button>
        <button class="card btn-soft" data-go="caixa"><strong>Fluxo de caixa</strong><br><span class="muted">Entradas, saídas e movimentações</span></button>
        <button class="card btn-soft" data-go="fechamento"><strong>Fechamento</strong><br><span class="muted">Visão financeira consolidada</span></button>
        <button class="card btn-soft" data-go="integracoes"><strong>Integrações</strong><br><span class="muted">API, CSV, Excel e conexão com outras plataformas</span></button>
        <button class="card btn-soft" data-go="panfletos"><strong>Panfletos por série</strong><br><span class="muted">Editar conteúdo oficial para famílias</span></button>
      </div>`
    : role==="staff"
    ? `<div class="section-head"><h2>Secretaria e atendimento</h2><span class="muted">Sem acesso a valores administrativos, caixa ou fechamento.</span></div><div class="grid role-shortcuts">
        <button class="card btn-soft" data-go="atendimento"><strong>Atendimento de matrículas</strong><br><span class="muted">Proposta, negociação e encaminhamento</span></button>
        <button class="card btn-soft" data-go="alunos"><strong>Alunos</strong><br><span class="muted">Cadastro e consulta escolar</span></button>
        <button class="card btn-soft" data-go="responsaveis"><strong>Responsáveis</strong><br><span class="muted">Cadastro e vínculos familiares</span></button>
        <button class="card btn-soft" data-go="matriculas"><strong>Matrículas</strong><br><span class="muted">Contrato, plano e checklist</span></button>
        <button class="card btn-soft" data-go="documentos"><strong>Documentos</strong><br><span class="muted">Pendências e conferência</span></button>
        <button class="card btn-soft" data-go="panfletos"><strong>Panfletos por série</strong><br><span class="muted">Somente consulta e geração para a família</span></button>
      </div>`
    : `<div class="card access-choice"><div><h2>Escolha a sua área</h2><p class="muted">A Secretaria e a Gestão agora trabalham em interfaces separadas.</p></div><button class="btn btn-primary" id="openAccess">Acessar plataforma</button></div>`;
  $("#view").insertAdjacentHTML("beforeend",shortcutHtml);
  if(role==="public"){const b=$("#openAccess");if(b)b.onclick=()=>authModal("staff")}
  $$('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
}

