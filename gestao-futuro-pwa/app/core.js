const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const API = "/api/gf";
const GF_WORKSPACE_KEY="gestao_futuro_workspace_v1";

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
  backendVersion: "",
  backendCaps: {},
  backendChecked: false,
  backendHealthPromise: null,
  lastBackendOkAt: Number(sessionStorage.getItem('gf_backend_ok_at')||0),
  navSeq: 0
};

const titles = {
  dashboard:"Dashboard", atendimento:"Atendimento de matrículas", panfletos:"Panfletos por série", alunos:"Alunos", responsaveis:"Responsáveis", matriculas:"Matrículas",
  documentos:"Documentos", documentacao:"Documentação da matrícula", produtos:"Valores e reajustes", autorizacoes:"Autorizações da Gestão", recebimentos:"Recebimentos", projecao:"Projeção de receita",
  caixa:"Fluxo de caixa", fechamento:"Fechamento financeiro", integracoes:"Central de integrações", acessos:"Acessos da escola", relatorios:"Central de relatórios"
};

const INTERFACE_VIEWS = Object.freeze({
  staff:["dashboard","atendimento","panfletos","alunos","responsaveis","matriculas","documentos","relatorios","acessos"],
  admin:["dashboard","panfletos","documentacao","produtos","autorizacoes","recebimentos","projecao","caixa","fechamento","relatorios","integracoes","acessos"],
  public:["dashboard"]
});
const roleForView = view => ["documentacao","produtos","autorizacoes","recebimentos","projecao","caixa","fechamento","integracoes"].includes(view) ? "admin" : ["atendimento","alunos","responsaveis","matriculas","documentos"].includes(view) ? "staff" : ["panfletos","acessos","relatorios"].includes(view) ? "shared" : "public";
const activeInterfaceRole = () => state.role==="admin" && state.adminToken ? "admin" : state.role==="staff" && state.staffToken ? "staff" : "public";
const allowedViewsFor = role => INTERFACE_VIEWS[role] || INTERFACE_VIEWS.public;
const tokenFor = role => role === "admin" ? state.adminToken : (state.role==="staff" ? state.staffToken : state.adminToken);
function isViewAllowed(view){return allowedViewsFor(activeInterfaceRole()).includes(view)}
function gfRememberWorkspace(view=state.view){
  try{
    if(view==="atendimento"&&typeof gfSaveAttendanceDraft==="function")gfSaveAttendanceDraft();
    localStorage.setItem(GF_WORKSPACE_KEY,JSON.stringify({view:view||"dashboard",scrollY:Number(window.scrollY||0),modo:currentRunMode(),savedAt:Date.now()}));
  }catch(e){}
}
function gfReadWorkspace(){
  try{
    const x=JSON.parse(localStorage.getItem(GF_WORKSPACE_KEY)||"null");
    if(!x||typeof x!=="object")return null;
    if(x.modo&&x.modo!==currentRunMode())return null;
    return x;
  }catch(e){return null}
}
function gfPrepareAttendanceResumeFromDraft(){
  if(typeof gfLoadAttendanceDraft!=="function")return false;
  const d=gfLoadAttendanceDraft();if(!d)return false;
  state.currentAttendanceId=d.ID_ATENDIMENTO||"";
  state.resumeAttendance=d;
  state.resumeItems=(d.ITENS||[]).map(function(id){return {ID_PRODUTO:id,SELECIONADO:"Sim"}});
  state.attendanceItems=new Set(d.ITENS||[]);
  state.attendanceStage=d.ETAPA||"Contato";
  return true;
}
async function gfRestoreWorkspace(){
  const w=gfReadWorkspace(),candidate=w&&w.view&&isViewAllowed(w.view)?w.view:"dashboard";
  if(candidate==="atendimento")gfPrepareAttendanceResumeFromDraft();
  await navigate(candidate);
  if(w&&Number.isFinite(Number(w.scrollY)))requestAnimationFrame(()=>window.scrollTo({top:Number(w.scrollY)||0,behavior:"auto"}));
}

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
function parseMoney(v) {
  if(typeof v==="number")return Number.isFinite(v)?v:0;
  let s=String(v??"").trim().replace(/\s/g,"").replace(/^R\$/i,"");
  if(!s)return 0;
  const comma=s.lastIndexOf(","),dot=s.lastIndexOf(".");
  if(comma>dot)s=s.replace(/\./g,"").replace(",",".");
  else if(dot>comma&&comma>=0)s=s.replace(/,/g,"");
  else if(comma>=0)s=s.replace(",",".");
  const n=Number(s.replace(/[^0-9.+-]/g,""));
  return Number.isFinite(n)?n:0;
}
function money(v) { return parseMoney(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
function val(obj, ...keys) { for (const k of keys) if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k]; return ""; }
function pill(text, cls="") { return `<span class="pill ${cls}">${esc(text || "—")}</span>`; }

function setNotice(message="", kind="") {
  const box = $("#notice");
  if(!box)return;
  box.replaceChildren();
  if(!message)return;
  const notice=document.createElement("div");
  notice.className="notice "+(kind||"");
  notice.textContent=String(message);
  box.appendChild(notice);
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
    const show=state.runMode==="TESTE" && activeInterfaceRole()==="admin" && !!state.adminToken;
    const canClear=show && state.backendCaps.clearTest===true;
    clear.classList.toggle("hidden",!show);
    clear.disabled=!canClear;
    clear.textContent=canClear?"🧹 Limpar teste":"🧹 Limpar teste • API pendente";
    clear.title=canClear?"Apagar somente registros de Teste/Simulação":"Publique a versão atualizada do Apps Script para habilitar a limpeza.";
  }
}
function setRunMode(mode){
  const previousMode=currentRunMode();
  state.runMode=mode==="TESTE"?"TESTE":"PRODUCAO";
  sessionStorage.setItem("gf_run_mode",state.runMode);
  if(state.runMode==="TESTE") ensureTestSession();
  else { state.testSession=""; sessionStorage.removeItem("gf_test_session"); }
  clearApiCache();
  state.bootstrapOffline=false;
  if(previousMode!==currentRunMode()){
    clearTimeout(state.attDraftTimer);
    state.currentAttendanceId="";state.resumeAttendance=null;state.resumeItems=[];
    state.attendanceItems=new Set();state.attendanceStage="Contato";
  }
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
  if(mode==="TESTE"){
    if(!state.backendChecked)await checkApi();
    const safe=state.backendCaps.testMode===true&&state.backendCaps.modeTagging===true;
    if(!safe){
      if(button){button.disabled=false;button.innerHTML=old}
      showToast("Teste/Simulação bloqueado até publicar a API atualizada do Apps Script.","error");
      return;
    }
  }
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
  if(state.backendCaps.clearTest!==true){
    showToast("A API do Apps Script ainda está desatualizada. Publique a versão atual para liberar a limpeza.","error");
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
  listarCaixa:15000,listarCategorias:120000,getFechamento:15000,listarDocumentosAluno:15000,listarChecklistDocumentos:60000,getAtendimento:10000
});
function apiCacheKey(action,payload,meta){
  const safe={...payload}; if(safe.password)safe.password="***";
  return action+"|"+meta.modo+"|"+JSON.stringify(safe);
}
function clearApiCache(){state.cacheGeneration=(state.cacheGeneration||0)+1;state.apiCache.clear();state.apiInflight.clear();state.bootstrap=null;state.catalogPromise=null;state.catalogProducts=null;state.catalogLoadedAt=0;state.flyerCache={}}
async function api(action, payload={}) {
  const writeActions=["salvarAluno","salvarResponsavel","criarMatriculaCompleta","atualizarDocumento","adicionarDocumentoAluno","uploadDocumentoAluno","registrarPagamento","salvarMovimentoCaixa","excluirMovimentoCaixa","salvarAtendimento","excluirAtendimento","solicitarDesconto","decidirSolicitacaoDesconto","salvarPanfletoSerie","salvarRegraDocumento","atualizarProduto","criarProdutoServico","aplicarReajusteIndividual","aplicarReajusteCatalogo","limparDadosTeste","limparAutorizacoesTeste"];
  const productionOnly=["salvarPanfletoSerie","salvarRegraDocumento","atualizarProduto","criarProdutoServico","aplicarReajusteIndividual","aplicarReajusteCatalogo"];
  if(writeActions.includes(action)&&!state.runMode){openModeGate();throw new Error("Escolha Produção ou Teste/Simulação antes de salvar.")}
  if(state.runMode==="TESTE"&&productionOnly.includes(action))throw new Error("Este comando altera configurações oficiais e só pode ser usado em Produção.");
  const meta={modo:currentRunMode(),sessaoTeste:state.runMode==="TESTE"?ensureTestSession():""};
  const ttl=API_CACHE_TTL[action]||0,key=ttl?apiCacheKey(action,payload,meta):"";
  if(ttl){
    const hit=state.apiCache.get(key);
    if(hit&&(Date.now()-hit.at)<ttl)return hit.data;
    if(state.apiInflight.has(key))return state.apiInflight.get(key);
  }
  const generation=state.cacheGeneration||0;
  const request=(async()=>{
    const ctrl=new AbortController(),timeoutMs=action==="uploadDocumentoAluno"?60000:25000,timer=setTimeout(()=>ctrl.abort(),timeoutMs);
    try{
      const r=await fetch(API,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,...meta,...payload}),signal:ctrl.signal});
      let out;try{out=await r.json()}catch{throw new Error("Resposta inválida do servidor.")}
      if(!r.ok||!out.ok){
        const msg=String(out.error||"Falha no servidor.");
        if(/^Ação não reconhecida:/i.test(msg))throw new Error("Este comando ainda não está disponível nesta versão do servidor.");
        const error=new Error(msg);error.status=r.status;error.serverRejected=r.status<500;throw error;
      }
      if(ttl&&generation===(state.cacheGeneration||0))state.apiCache.set(key,{at:Date.now(),data:out.data});
      if(writeActions.includes(action))clearApiCache();
      return out.data;
    }catch(e){
      if(e?.name==="AbortError")throw new Error("O servidor demorou demais para responder. A gravação pode ter ocorrido; consulte ou sincronize o registro antes de repetir.");
      throw e;
    }finally{clearTimeout(timer);if(ttl&&generation===(state.cacheGeneration||0))state.apiInflight.delete(key)}
  })();
  if(ttl)state.apiInflight.set(key,request);
  return request;
}

async function checkApi(options={}) {
  if(state.backendHealthPromise)return state.backendHealthPromise;
  const dot=$("#apiDot"), statusText=$("#apiStatus"), attempts=Math.max(1,Number(options.attempts||2));
  state.backendHealthPromise=(async()=>{
    for(let attempt=1;attempt<=attempts;attempt++){
      if(statusText&&attempt>1)statusText.textContent="reconectando ao backend…";
      try{
        const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
        let r;
        try{r=await fetch(API,{cache:"no-store",signal:ctrl.signal})}finally{clearTimeout(timer)}
        let data;try{data=await r.json()}catch{throw new Error("Resposta inválida do gateway.")}
        if(r.ok&&data&&data.ok){
          state.backendVersion=String(data.version||"");
          state.backendCaps=data.capabilities&&typeof data.capabilities==="object"?data.capabilities:{};
          state.backendChecked=true;state.lastBackendOkAt=Date.now();
          sessionStorage.setItem("gf_backend_ok_at",String(state.lastBackendOkAt));
          if(dot)dot.className="status-dot online";
          const safeTest=state.backendCaps.testMode===true&&state.backendCaps.modeTagging===true;
          if(statusText)statusText.textContent=safeTest?"backend conectado • API "+state.backendVersion:"backend conectado • atualização pendente";
          refreshModeButton();return data;
        }
      }catch(e){}
      if(attempt<attempts)await new Promise(resolve=>setTimeout(resolve,1200));
    }
    state.backendChecked=true;state.backendCaps={};
    const recentlyOk=state.lastBackendOkAt&&Date.now()-state.lastBackendOkAt<120000;
    if(dot)dot.className="status-dot offline";
    if(statusText)statusText.textContent=recentlyOk?"backend instável • tentando reconectar":"backend indisponível • clique para tentar novamente";
    refreshModeButton();return null;
  })();
  try{return await state.backendHealthPromise}finally{state.backendHealthPromise=null}
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
      if(typeof gfRestoreWorkspace==="function")await gfRestoreWorkspace();else await navigate("dashboard");
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
      state.bootstrap=null;setRunMode("PRODUCAO");applyRoleInterface();refreshSessionButton(); closeModal(); if(typeof hideHomeScreen==="function")hideHomeScreen(); ensureEntryNotifications().catch(()=>{}); if(typeof gfRestoreWorkspace==="function")await gfRestoreWorkspace();else await navigate("dashboard"); if(typeof resetHomeIdle==="function")resetHomeIdle();
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
      state.bootstrap=null;setRunMode("PRODUCAO");applyRoleInterface();refreshSessionButton(); closeModal(); if(typeof hideHomeScreen==="function")hideHomeScreen(); if(typeof pollApprovals==="function") pollApprovals(); ensureEntryNotifications().catch(()=>{}); if(typeof gfRestoreWorkspace==="function")await gfRestoreWorkspace();else await navigate("dashboard"); if(typeof resetHomeIdle==="function")resetHomeIdle();
    }catch(e){ alert(e.message); btn.disabled=false; btn.textContent="Entrar na Gestão"; }
  };
  const lo=$("#logoutBtn"); if(lo) lo.onclick=logoutAll;
  setTimeout(()=>$(targetRole==="admin"?"#adminPass":"#staffPass")?.focus(),50);
}

async function logoutAll(){
  try{ if(state.adminToken) await api("logout",{token:state.adminToken}); }catch{}
  try{ if(state.staffToken && state.staffToken!==state.adminToken) await api("logout",{token:state.staffToken}); }catch{}
  state.staffToken=""; state.adminToken=""; state.role=""; clearApiCache();
  localStorage.removeItem(GF_BOOTSTRAP_LOCAL_KEY);
  state.currentAttendanceId="";state.resumeAttendance=null;state.resumeItems=[];state.attendanceItems=new Set();
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

async function loadCatalogProducts(force=false){
  const maxAge=30000,now=Date.now();
  if(!force&&state.catalogProducts&&(now-Number(state.catalogLoadedAt||0))<maxAge)return state.catalogProducts;
  if(state.catalogPromise)return state.catalogPromise;
  if(force){state.apiCache.delete(apiCacheKey("listarProdutosPublicos",{}, {modo:currentRunMode()}));}
  const generation=state.cacheGeneration||0;
  state.catalogPromise=api("listarProdutosPublicos").then(function(rows){
    const list=Array.isArray(rows)?rows:[];
    if(generation===(state.cacheGeneration||0)){
      state.catalogProducts=list;state.catalogLoadedAt=Date.now();
      if(state.bootstrap&&typeof state.bootstrap==="object")state.bootstrap.produtos=list;
    }
    return list
  }).finally(function(){if(generation===(state.cacheGeneration||0))state.catalogPromise=null});
  return state.catalogPromise;
}

function gfIsCampaignProduct(p){
  if(!p)return false;
  var cat=String(p.CATEGORIA||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  var sub=String(p.SUBCATEGORIA||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  return cat==="campanha"&&(sub.includes("1ª parcela")||sub.includes("1a parcela")||sub.includes("primeira parcela"));
}
function gfCampaignMeta(p){
  var raw={},txt=String(p&&p.OBSERVACAO_INTERNA||"").trim();
  if(txt){try{raw=JSON.parse(txt)||{}}catch(e){raw={}}}
  return {
    name:String(raw.name||p&&p.PRODUTO||"Campanha de matrícula"),
    discount:Math.max(0,Math.min(100,Number(p&&p.VALOR_BASE||raw.discount||0))),
    cardInstallments:Math.max(1,Math.trunc(Number(p&&p.QTD_PARCELAS||raw.cardInstallments||1))),
    paymentMethod:String(raw.paymentMethod||"Cartão"),
    start:String(raw.start||""),
    end:String(raw.end||""),
    studentType:String(raw.studentType||"Todos"),
    showFlyer:raw.showFlyer!==false,
    autoApply:raw.autoApply!==false,
    noInterest:raw.noInterest!==false,
    finalValue:Number(raw.finalValue||0),
    note:String(raw.note||p&&p["OBSERVAÇÃO"]||p&&p["DESCRIÇÃO"]||"")
  };
}
function gfCampaignDateActive(meta,when){
  meta=meta||{};var d=when instanceof Date?when:new Date(),key=[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
  if(meta.start&&key<meta.start)return false;
  if(meta.end&&key>meta.end)return false;
  return true;
}
function gfCampaignFor(products,year,serie,studentType,allowScheduled){
  var st=String(studentType||"Todos").toLowerCase();
  return (products||[]).filter(function(p){
    if(!gfIsCampaignProduct(p)||String(p.ATIVO||"Sim")==="Não"||Number(p.ANO_LETIVO)!==Number(year))return false;
    if(String(p.PUBLICADO_ATENDIMENTO||"Sim")==="Não")return false;
    if(serie&&typeof gfApplies==="function"&&!gfApplies(p,serie))return false;
    var m=gfCampaignMeta(p),mt=String(m.studentType||"Todos").toLowerCase();
    if(mt!=="todos"&&st!=="todos"&&mt!==st)return false;
    return allowScheduled===true||gfCampaignDateActive(m);
  }).sort(function(a,b){return Number(a.ORDEM_EXIBICAO||0)-Number(b.ORDEM_EXIBICAO||0)})[0]||null;
}
function gfCampaignBaseProduct(products,year,serie){
  return (products||[]).find(function(p){
    return Number(p&&p.ANO_LETIVO)===Number(year)&&String(p&&p.ATIVO||"Sim")!=="Não"&&
      String(p&&p.CATEGORIA||"")==="Mensalidade"&&Number(p&&p.QTD_PARCELAS||0)===12&&
      (!serie||typeof gfApplies!=="function"||gfApplies(p,serie));
  })||null;
}
function gfMoneyFloor2(v){
  return Math.floor((Number(v||0)+1e-9)*100)/100;
}
function gfAnnualTuitionProduct(products,year,serie){
  return (products||[]).find(function(p){
    if(Number(p&&p.ANO_LETIVO)!==Number(year)||String(p&&p.ATIVO||"Sim")==="Não"||String(p&&p.CATEGORIA||"")!=="Mensalidade")return false;
    var txt=String((p&&p.SUBCATEGORIA)||"")+" "+String((p&&p.PRODUTO)||"");
    txt=txt.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    if(txt.indexOf("anuidade")<0)return false;
    return !serie||typeof gfApplies!=="function"||gfApplies(p,serie);
  })||null;
}
function gfTuitionModelFromAnnual(annualMain,annualPost){
  var annual=Number(annualMain||0),post=Number(annualPost||0);
  return {
    annual:annual,annualPost:post,
    plan12:gfMoneyFloor2(annual/13),
    plan12Post:gfMoneyFloor2(post/13),
    plan11:gfMoneyFloor2(annual/12),
    plan11Post:gfMoneyFloor2(post/12),
    firstBase:gfMoneyFloor2(post/13)
  };
}
function gfTuitionModel(products,year,serie){
  var annual=gfAnnualTuitionProduct(products,year,serie);
  if(!annual)return null;
  var model=gfTuitionModelFromAnnual(Number(annual.VALOR_BASE||0),Number(annual["VALOR_PÓS_VENCIMENTO"]||0));
  model.annualProduct=annual;
  return model;
}
function gfCampaignBaseAmount(products,year,serie){
  var model=gfTuitionModel(products,year,serie);
  if(model&&model.firstBase>0)return model.firstBase;
  var p=gfCampaignBaseProduct(products,year,serie);
  return Number(p&&p["VALOR_PÓS_VENCIMENTO"]||p&&p.VALOR_PARCELA||p&&p.VALOR_BASE||0);
}
function gfCampaignResult(firstBase,campaign){
  var base=Number(firstBase||0),meta=gfCampaignMeta(campaign);
  var raw=base*(1-Number(meta.discount||0)/100);
  var final=Math.floor((raw+1e-9)*100)/100;
  return {base:base,discount:meta.discount,final:final,meta:meta,campaign:campaign||null};
}
function gfCampaignConditionText(campaign){
  if(!campaign)return "";
  var m=gfCampaignMeta(campaign),parts=[];
  if(m.discount)parts.push(m.discount.toLocaleString("pt-BR",{maximumFractionDigits:2})+"% de desconto na 1ª parcela");
  if(m.cardInstallments>1)parts.push("até "+m.cardInstallments+"x no "+m.paymentMethod.toLowerCase()+(m.noInterest?" sem juros":""));
  else if(m.paymentMethod)parts.push(m.paymentMethod);
  if(m.start||m.end)parts.push("validade "+(m.start?new Date(m.start+"T12:00:00").toLocaleDateString("pt-BR"):"início livre")+" a "+(m.end?new Date(m.end+"T12:00:00").toLocaleDateString("pt-BR"):"sem data final"));
  return parts.join(" • ");
}

function gfCatalogUpdatedAt(products){
  const times=(products||[]).map(function(p){const d=new Date(p&&p.ATUALIZADO_EM||0).getTime();return Number.isFinite(d)?d:0}).filter(Boolean);
  return times.length?new Date(Math.max.apply(null,times)):null;
}
function gfCatalogSourceLabel(products){
  const d=gfCatalogUpdatedAt(products);
  return d?"Gestão Futuro • atualizado "+d.toLocaleString("pt-BR"):"Gestão Futuro • catálogo oficial";
}
function gfApplyCatalogToBootstrap(bootstrap,products){
  const b=bootstrap&&typeof bootstrap==="object"?bootstrap:{};
  b.produtos=Array.isArray(products)?products:[];
  b.catalogoFonte="Gestão Futuro";
  b.catalogoSincronizadoEm=new Date().toISOString();
  return b;
}

const GF_BOOTSTRAP_LOCAL_KEY="gestao_futuro_bootstrap_local_v1";
function gfReadBootstrapLocal(){try{return JSON.parse(localStorage.getItem(GF_BOOTSTRAP_LOCAL_KEY)||"null")}catch(e){return null}}
function gfWriteBootstrapLocal(data){try{if(data)localStorage.setItem(GF_BOOTSTRAP_LOCAL_KEY,JSON.stringify({at:Date.now(),data:data}))}catch(e){}}
async function loadBootstrap(){
  if(state.bootstrap) return state.bootstrap;
  const token=tokenFor("staff");
  if(!token) throw new Error("Acesso da Secretaria necessário.");
  const cached=gfReadBootstrapLocal();
  const mode=currentRunMode(),generation=state.cacheGeneration||0;
  try{
    const loaded=await api("bootstrapSecretaria",{token});
    if(generation!==(state.cacheGeneration||0))throw new Error("O ambiente mudou durante a consulta. Abra a tela novamente.");
    state.bootstrap=loaded;
    state.bootstrapOffline=false;
    if(Array.isArray(loaded&&loaded.produtos)){
      state.catalogProducts=loaded.produtos;state.catalogLoadedAt=Date.now();
      gfApplyCatalogToBootstrap(state.bootstrap,loaded.produtos);
    }
    gfWriteBootstrapLocal({mode,bootstrap:state.bootstrap});
    return state.bootstrap;
  }catch(e){
    if(generation===(state.cacheGeneration||0)&&!e.serverRejected&&cached?.data?.mode===mode&&cached.data.bootstrap){
      state.bootstrap=cached.data.bootstrap;
      state.bootstrapOffline=true;
      setNotice("Servidor lento. Atendimento aberto com a última base salva neste dispositivo; novos dados ficarão pendentes de sincronização.","error");
      return state.bootstrap;
    }
    throw e;
  }
}

async function navigate(view){
  applyRoleInterface();
  if(!isViewAllowed(view)) view="dashboard";
  const seq=++state.navSeq;
  state.view=view;
  if(!document.body.classList.contains("home-active"))try{localStorage.setItem(GF_WORKSPACE_KEY,JSON.stringify({view:view,scrollY:0,modo:currentRunMode(),savedAt:Date.now()}))}catch(e){}
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
    if(view==="documentacao") await renderDocumentacaoGestao();
    if(view==="produtos") await renderProdutos();
    if(view==="autorizacoes") await renderAutorizacoes();
    if(view==="recebimentos") await renderRecebimentos();
    if(view==="projecao") await renderProjecaoReceita();
    if(view==="caixa") await renderCaixa();
    if(view==="fechamento") await renderFechamento();
    if(view==="integracoes") await renderIntegracoes();
    if(view==="acessos") await renderAcessos();
    if(view==="relatorios") await renderRelatorios();
  }catch(e){
    if(/Sessão.*expirada|Sessão.*inválida/i.test(e.message)){ await logoutAll(); authModal(roleForView(view)); }
    $("#view").innerHTML=`<div class="card"><div class="empty">${esc(e.message)}</div></div>`;
  }
}

function renderAcessos(){
  const acessos=[
    {
      nome:"Agenda On-line • Gestor Escolar",
      descricao:"Acesso ao Gestor Escolar e à agenda on-line utilizada pela escola.",
      url:"https://escola.computex.com.br/escola329/index2.php",
      icon:"/assets/gestor-escolar.svg?v=20260920-gestor-svg2",
      fallback:"G",
      destaque:true
    },
    {
      nome:"Site oficial do Colégio Futuro",
      descricao:"Portal institucional da escola, informações, projetos e contatos.",
      url:"https://colegiofuturoce.com.br",
      icon:"/assets/app-icon-futuro.svg",
      fallback:"F"
    },
    {
      nome:"Gestão Futuro",
      descricao:"Plataforma interna de Secretaria, Gestão, Financeiro e Matrículas.",
      url:"https://gestao.colegiofuturoce.com.br",
      icon:"/assets/app-icon-futuro.svg",
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

const GF_TUITION_HISTORY = Object.freeze({
  2024:{
    infantil:{label:"Educação Infantil",series:"Infantil 2 ao 5",annual:5053.68,annualPost:5459.16,first:390.00,plan12:388.64,plan12Post:422.43,plan11:423.97,plan11Post:460.83},
    iniciais:{label:"Ensino Fundamental I",series:"1º ao 5º Ano",annual:5194.80,annualPost:5611.68,first:399.60,plan12:399.60,plan12Post:434.34,plan11:435.92,plan11Post:473.82},
    finais:{label:"Ensino Fundamental II",series:"6º ao 9º Ano",annual:5335.92,annualPost:5764.32,first:409.20,plan12:410.56,plan12Post:446.26,plan11:447.88,plan11Post:486.82}
  },
  2025:{
    infantil:{label:"Educação Infantil",series:"Infantil 2 ao 5",annual:5456.76,annualPost:5894.64,first:420.00,plan12:419.73,plan12Post:456.22,plan11:457.88,plan11Post:497.69},
    iniciais:{label:"Ensino Fundamental I",series:"1º ao 5º Ano",annual:5598.72,annualPost:6049.08,first:420.00,plan12:431.56,plan12Post:469.09,plan11:470.79,plan11Post:511.73},
    finais:{label:"Ensino Fundamental II",series:"6º ao 9º Ano",annual:5740.80,annualPost:6203.52,first:420.00,plan12:443.40,plan12Post:481.96,plan11:483.70,plan11Post:525.77}
  }
});
function dashRound2(v){return Math.round((Number(v||0)+Number.EPSILON)*100)/100}
function dashTuitionFromCatalog(products,year){
  const specs=[
    {key:"infantil",label:"Educação Infantil",series:"Infantil 2 ao 5"},
    {key:"iniciais",label:"Ensino Fundamental I",series:"1º ao 5º Ano"},
    {key:"finais",label:"Ensino Fundamental II",series:"6º ao 9º Ano"}
  ];
  const rows=(products||[]).filter(p=>dashYear(p)===Number(year)&&p.ATIVO!=="Não"&&p.CATEGORIA==="Mensalidade");
  return specs.map(s=>{
    const bySeries=p=>dashNorm(p&&p["SEGMENTO_SÉRIE"])===dashNorm(s.series);
    const annual=rows.find(p=>bySeries(p)&&dashNorm(p.SUBCATEGORIA+" "+p.PRODUTO).includes("anuidade"));
    const first=rows.find(p=>bySeries(p)&&(dashNorm(p.SUBCATEGORIA).includes("1ª parcela")||dashNorm(p.SUBCATEGORIA).includes("1a parcela")||dashNorm(p.PRODUTO).includes("primeira parcela")||dashNorm(p.PRODUTO).includes("1ª parcela")));
    const p12=rows.find(p=>bySeries(p)&&Number(p.QTD_PARCELAS)===12&&!dashNorm(p.SUBCATEGORIA).includes("1ª parcela"));
    const p11=rows.find(p=>bySeries(p)&&Number(p.QTD_PARCELAS)===11);
    const anu=Number(annual?.VALOR_BASE||0),anuPost=Number(annual?.["VALOR_PÓS_VENCIMENTO"]||0),model=gfTuitionModelFromAnnual(anu,anuPost);
    return {...s,year:Number(year),annual:anu,annualPost:anuPost,first:model.firstBase,firstPost:model.firstBase,
      plan12:model.plan12,plan12Post:model.plan12Post,plan11:model.plan11,plan11Post:model.plan11Post,
      first12:model.firstBase,first12Post:model.firstBase,first11:model.firstBase,first11Post:model.firstBase,
      catalogComplete:!!(annual&&first&&p12&&p11)
    };
  });
}

const GF_FIRST_REFERENCE = Object.freeze({
  2024:{infantil:390,iniciais:399.60,finais:409.20},
  2025:{infantil:420,iniciais:420,finais:420}
});

function dashTuitionFromHistory(year){
  const base=GF_TUITION_HISTORY[Number(year)];
  if(!base)return [];
  return ["infantil","iniciais","finais"].map(key=>{
    const h=base[key]||{};
    return {key:key,label:h.label||key,series:h.series||"",year:Number(year),annual:Number(h.annual||0),annualPost:Number(h.annualPost||0),
      first:Number(h.first||GF_FIRST_REFERENCE[Number(year)]?.[key]||0),
      plan12:Number(h.plan12||0),plan12Post:Number(h.plan12Post||0),plan11:Number(h.plan11||0),plan11Post:Number(h.plan11Post||0),
      first12:Number(h.first||0),first12Post:Number(h.first||0),first11:Number(h.first||0),first11Post:Number(h.first||0)
    };
  });
}
function dashTuitionRowsForYear(products,year){
  const y=Number(year);
  if(GF_TUITION_HISTORY[y])return dashTuitionFromHistory(y);
  return dashTuitionFromCatalog(products,y);
}

function dashTuitionRowsWithMetrics(products,year){
  const y=Number(year),rows=dashTuitionRowsForYear(products,y);
  const previous=y>2024?Object.fromEntries(dashTuitionRowsForYear(products,y-1).map(x=>[x.key,x])):{};
  return rows.map(r=>{
    const p=previous[r.key]||{};
    const pct=(a,b)=>Number(b||0)?dashPct(Number(b||0),Number(a||0)):null;
    return {...r,
      pctAnnual:pct(r.annual,p.annual),
      pctAnnualPost:pct(r.annualPost,p.annualPost),
      pctFirst:pct(r.first||r.first12,p.first||p.first12),
      pct12:pct(r.plan12,p.plan12),
      pct12Post:pct(r.plan12Post,p.plan12Post),
      pct11:pct(r.plan11,p.plan11),
      pct11Post:pct(r.plan11Post,p.plan11Post)
    };
  });
}
function dashAdjustmentBadge(v){
  if(v===null||v===undefined||!Number.isFinite(Number(v)))return "";
  const n=Number(v),cls=n>0?"up":n<0?"down":"flat";
  return "<span class='adjustment-badge "+cls+"'>"+(n>0?"+":"")+n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+"%</span>";
}
function dashTuitionKpis(rows,year){
  const avg=arr=>{const v=arr.map(Number).filter(x=>Number.isFinite(x)&&x>0);return v.length?v.reduce((a,b)=>a+b,0)/v.length:0};
  const ticket12=avg(rows.map(r=>r.plan12)),annual=avg(rows.map(r=>r.annual)),first=avg(rows.map(r=>r.first||r.first12));
  const pcts=rows.map(r=>r.pctAnnual).filter(v=>v!==null&&v!==undefined&&Number.isFinite(Number(v)));
  const avgPct=pcts.length?pcts.reduce((a,b)=>a+Number(b),0)/pcts.length:null;
  return "<div class='tuition-kpis'>"+
    "<div><small>TICKET MÉDIO DE TABELA</small><b>"+money(ticket12)+"</b><span>plano de 12 parcelas</span></div>"+
    "<div><small>ANUIDADE MÉDIA</small><b>"+money(annual)+"</b><span>média dos segmentos</span></div>"+
    "<div><small>1ª PARCELA MÉDIA</small><b>"+money(first)+"</b><span>matrícula / entrada</span></div>"+
    "<div><small>REAJUSTE MÉDIO</small><b>"+(avgPct===null?"—":((avgPct>0?"+":"")+avgPct.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+"%"))+"</b><span>"+(Number(year)>2024?"comparado a "+(Number(year)-1):"ano base")+"</span></div>"+
  "</div>";
}

function dashTuitionHistoryRows(products){
  const y26=Object.fromEntries(dashTuitionFromCatalog(products,2026).map(x=>[x.key,x]));
  const y27=Object.fromEntries(dashTuitionFromCatalog(products,2027).map(x=>[x.key,x]));
  return ["infantil","iniciais","finais"].map(key=>{
    const h24=GF_TUITION_HISTORY[2024][key],h25=GF_TUITION_HISTORY[2025][key],h26=y26[key]||{},h27=y27[key]||{};
    return {key,label:h24.label,series:h24.series,v2024:Number(h24.annual||0),v2025:Number(h25.annual||0),v2026:Number(h26.annual||0),v2027:Number(h27.annual||0)};
  });
}
const GF_STI_HISTORY = Object.freeze({
  2024:{
    infantil:{key:"infantil",label:"Educação Infantil",series:"Infantil 2 ao 5",regular:388.64,regularPost:422.43,sti:477.79,total:866.52,totalPost:897.52},
    iniciais:{key:"iniciais",label:"Ensino Fundamental I",series:"1º ao 5º Ano",regular:399.60,regularPost:434.34,sti:477.79,total:877.39,totalPost:912.13}
  },
  2025:{
    infantil:{key:"infantil",label:"Educação Infantil",series:"Infantil 2 ao 5",regular:419.73,regularPost:456.22,sti:515,total:934.73,totalPost:971.22},
    iniciais:{key:"iniciais",label:"Ensino Fundamental I",series:"1º ao 5º Ano",regular:431.56,regularPost:469.09,sti:515,total:946.56,totalPost:984.09}
  }
});
function dashStiFromCatalog(products,year){
  const regular=Object.fromEntries(dashTuitionRowsForYear(products,year).map(x=>[x.key,x]));
  const specs=[
    {key:"infantil",label:"Educação Infantil",series:"Infantil 2 ao 5"},
    {key:"iniciais",label:"Ensino Fundamental I",series:"1º ao 5º Ano"}
  ];
  const rows=(products||[]).filter(p=>dashYear(p)===Number(year)&&p.ATIVO!=="Não"&&p.CATEGORIA==="Adicional"&&dashNorm(p.SUBCATEGORIA+" "+p.PRODUTO).includes("s.t.i"));
  return specs.map(s=>{
    const item=rows.find(p=>dashNorm(p["SEGMENTO_SÉRIE"])===dashNorm(s.series));
    const reg=regular[s.key]||{},sti=Number(item?.VALOR_PARCELA||item?.VALOR_BASE||0);
    let meta={};try{meta=JSON.parse(String(item?.OBSERVACAO_INTERNA||"{}"))||{}}catch(e){meta={}}
    const regularPlan=Number(meta.regularPlan||12),regularValue=regularPlan===11?Number(reg.plan11||0):Number(reg.plan12||0),regularPost=regularPlan===11?Number(reg.plan11Post||0):Number(reg.plan12Post||0);
    return {...s,year:Number(year),regularPlan:regularPlan,regular:regularValue,regularPost:regularPost,sti:sti,
      total:dashRound2(regularValue+sti),totalPost:dashRound2(regularPost+sti)};
  }).filter(x=>x.sti>0);
}
function dashStiRowsForYear(products,year){
  const y=Number(year),fallback=GF_STI_HISTORY[y]||{};
  if(y===2024||y===2025)return ["infantil","iniciais"].map(k=>({...fallback[k],year:y})).filter(x=>x&&x.sti);
  return dashStiFromCatalog(products,y);
}
function dashStiYearTable(products,year){
  const rows=dashStiRowsForYear(products,year);
  if(!rows.length)return "";
  return "<div class='tuition-year-caption sti-caption'><div><b>S.T.I. • SISTEMA DE TEMPO INTEGRAL • "+year+"</b><span>Adicional ao tempo regular • exibido separadamente</span></div><span class='tuition-source'>12 parcelas</span></div>"+
    "<div class='tuition-table-wrap'><table class='tuition-table sti-table'><thead><tr><th>SEGMENTO</th><th>REGULAR</th><th>INVESTIMENTO S.T.I.</th><th>VALOR FINAL</th><th>APÓS VENCIMENTO</th></tr></thead><tbody>"+
    rows.map(r=>"<tr><td><b>"+esc(r.label)+"</b><small>"+esc(r.series)+"</small></td><td>"+money(r.regular)+"</td><td>"+money(r.sti)+"</td><td><strong>"+money(r.total)+"</strong></td><td>"+money(r.totalPost)+"</td></tr>").join("")+
    "</tbody></table></div><div class='tuition-legend'><b>S.T.I.:</b> o valor final segue a referência regular definida na tabela oficial de cada segmento e soma o investimento mensal do S.T.I.</div>";
}
function dashStiCompareTable(products){
  const a=Object.fromEntries(dashStiFromCatalog(products,2026).map(x=>[x.key,x]));
  const b=Object.fromEntries(dashStiFromCatalog(products,2027).map(x=>[x.key,x]));
  return "<div class='tuition-year-caption sti-caption'><div><b>COMPARATIVO S.T.I. • 2026 × 2027</b><span>Investimento adicional e valor final mensal</span></div><span class='tuition-source'>Gestão Futuro</span></div>"+
    "<div class='tuition-table-wrap'><table class='tuition-table tuition-compare sti-table'><thead><tr><th>SEGMENTO</th><th>S.T.I. 2026</th><th>S.T.I. 2027</th><th>REAJUSTE</th><th>FINAL 2026</th><th>FINAL 2027</th></tr></thead><tbody>"+
    ["infantil","iniciais"].map(key=>{const x=a[key]||{},y=b[key]||{},pct=x.sti&&y.sti?dashPct(x.sti,y.sti):0;return "<tr><td><b>"+esc(y.label||x.label||key)+"</b><small>"+esc(y.series||x.series||"")+"</small></td><td>"+money(x.sti||0)+"</td><td>"+money(y.sti||0)+"</td><td><span class='variation "+(pct>0?"up":pct<0?"down":"")+"'>"+(pct>0?"+":"")+pct.toLocaleString("pt-BR",{maximumFractionDigits:2})+"%</span></td><td>"+money(x.total||0)+"</td><td>"+money(y.total||0)+"</td></tr>"}).join("")+
    "</tbody></table></div>";
}
function dashTuitionYearTable(rows,year,products){
  const valuePair=(a,b,pctA,pctB)=>{
    const main=Number(a||0),post=Number(b||0);
    if(!main&&!post)return "<span class='school-value-empty'>—</span>";
    return "<div class='school-value-stack'><strong>"+money(main)+"</strong><small>(até o vencimento)</small>"+dashAdjustmentBadge(pctA)+
      (post?"<strong>"+money(post)+"</strong><small>(após o vencimento)</small>"+dashAdjustmentBadge(pctB):"")+"</div>";
  };
  const body=(rows||[]).map(r=>{
    const firstOfficial=Number(r.first||r.first12||GF_FIRST_REFERENCE[Number(year)]?.[r.key]||0);
    const campaign=Number(year)>=2026?gfCampaignFor(products||[],year,r.series,"Todos",false):null;
    const campaignBase=gfCampaignBaseAmount(products||[],year,r.series)||Number(r.plan12Post||0)||firstOfficial;
    const firstResult=campaign?gfCampaignResult(campaignBase,campaign):{final:firstOfficial},first=Number(firstResult.final||firstOfficial||0);
    return "<tr><td><b>"+esc(r.label)+"</b><small>"+esc(r.series)+"</small></td>"+
      "<td>"+valuePair(r.annual,r.annualPost,r.pctAnnual,r.pctAnnualPost)+"</td>"+
      "<td><div class='school-first-payment'><strong>"+(first?money(first):"—")+"</strong><small>"+(campaign?"campanha vigente":(Number(year)<=2025?"referência histórica":"valor oficial da Gestão"))+"</small>"+dashAdjustmentBadge(r.pctFirst)+"</div></td>"+
      "<td>"+valuePair(r.plan12,r.plan12Post,r.pct12,r.pct12Post)+"</td>"+
      "<td>"+valuePair(r.plan11,r.plan11Post,r.pct11,r.pct11Post)+"</td></tr>";
  }).join("");
  return dashTuitionKpis(rows,year)+"<div class='school-table-title'>TABELA DE VALORES "+year+"</div>"+
    "<div class='tuition-table-wrap'><table class='tuition-table school-price-table'><thead><tr><th>SEGMENTO</th><th>ANUIDADE</th><th>1ª PARCELA</th><th>12 PARCELAS</th><th>11 PARCELAS</th></tr></thead><tbody>"+body+"</tbody></table></div>"+
    "<div class='school-important-note'><b>OBSERVAÇÃO IMPORTANTE</b><span>A primeira parcela será paga no ato da matrícula e as parcelas restantes no dia 5 de cada mês.</span></div>";
}

function dashCampaignPolicyHtml(products,year){
  if(Number(year)<=2025)return "";
  const campaigns=(products||[]).filter(p=>gfIsCampaignProduct(p)&&dashYear(p)===Number(year)&&String(p.ATIVO||"Sim")!=="Não");
  if(!campaigns.length)return "";
  const tuition=dashTuitionRowsForYear(products,year),firstMap=Object.fromEntries(tuition.map(r=>[dashNorm(r.series),gfCampaignBaseAmount(products,year,r.series)||Number(r.plan12Post||0)||Number(r.first||r.first12||0)]));
  const rows=campaigns.map(p=>{
    const m=gfCampaignMeta(p),base=firstMap[dashNorm(p["SEGMENTO_SÉRIE"]||"")]||0,r=gfCampaignResult(base,p);
    const validity=(m.start||m.end)?((m.start?new Date(m.start+"T12:00:00").toLocaleDateString("pt-BR"):"—")+" → "+(m.end?new Date(m.end+"T12:00:00").toLocaleDateString("pt-BR"):"sem término")):"Sem período definido";
    return "<tr><td><b>"+esc(p["SEGMENTO_SÉRIE"]||"")+"</b><small>"+esc(m.studentType||"Todos")+"</small></td><td><b>"+esc(m.name)+"</b></td><td>"+Number(m.discount||0).toLocaleString("pt-BR",{maximumFractionDigits:2})+"%</td><td>"+(base?money(base):"—")+"</td><td><b>"+(r.final?money(r.final):"—")+"</b></td><td>até "+Number(m.cardInstallments||1)+"x • "+esc(m.paymentMethod||"")+(m.noInterest?" • sem juros":"")+"</td><td>"+esc(validity)+"</td></tr>";
  }).join("");
  return "<div class='school-table-title campaign-policy-title'>CAMPANHA DA 1ª PARCELA • "+Number(year)+"</div>"+
    "<div class='tuition-table-wrap'><table class='tuition-table campaign-policy-table'><thead><tr><th>SEGMENTO</th><th>CAMPANHA</th><th>DESCONTO</th><th>1ª OFICIAL</th><th>1ª CAMPANHA</th><th>CONDIÇÃO</th><th>VALIDADE</th></tr></thead><tbody>"+rows+"</tbody></table></div>";
}

function dashTuitionCompareTable(y26,y27){
  const b26=Object.fromEntries(y26.map(x=>[x.key,x])),b27=Object.fromEntries(y27.map(x=>[x.key,x]));
  return "<div class='tuition-year-caption'><div><b>COMPARATIVO • 2026 × 2027</b><span>Anuidade e planos regulares por segmento</span></div><span class='tuition-source'>Gestão Futuro</span></div>"+
    "<div class='tuition-table-wrap'><table class='tuition-table tuition-compare'><thead><tr><th>SEGMENTO</th><th>2026<br><small>Anuidade</small></th><th>2027<br><small>Anuidade</small></th><th>REAJUSTE</th><th>+12<br><small>2026 → 2027</small></th><th>+11<br><small>2026 → 2027</small></th></tr></thead><tbody>"+
    ["infantil","iniciais","finais"].map(key=>{
      const a=b26[key]||{},b=b27[key]||{},pct=a.annual&&b.annual?dashPct(a.annual,b.annual):0;
      return "<tr><td><b>"+esc(b.label||a.label||key)+"</b><small>"+esc(b.series||a.series||"")+"</small></td><td>"+money(a.annual||0)+"</td><td>"+money(b.annual||0)+"</td><td><span class='variation "+(pct>0?"up":pct<0?"down":"")+"'>"+(pct>0?"+":"")+pct.toLocaleString("pt-BR",{maximumFractionDigits:2})+"%</span></td><td>"+money(a.plan12||0)+" <i>→</i> "+money(b.plan12||0)+"</td><td>"+money(a.plan11||0)+" <i>→</i> "+money(b.plan11||0)+"</td></tr>";
    }).join("")+"</tbody></table></div>";
}
function dashTuitionHistoryHtml(products){
  const rows=dashTuitionHistoryRows(products);
  const avg=(from,to)=>{const arr=rows.filter(r=>r[from]&&r[to]).map(r=>dashPct(r[from],r[to]));return arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0};
  const p2425=avg("v2024","v2025"),p2526=avg("v2025","v2026"),p2627=avg("v2026","v2027"),p2427=avg("v2024","v2027");
  return "<section class='card tuition-history'><div class='section-head compact'><div><h2>Panorama histórico • 2024 → 2027</h2><span class='muted'>Evolução da anuidade até o vencimento. 2024–2025: Guias oficiais; 2026–2027: catálogo Gestão Futuro, com 2026 conferido no Guia oficial.</span></div></div>"+
    "<div class='tuition-history-kpis'><div><small>2024 → 2025</small><b>+"+p2425.toLocaleString("pt-BR",{maximumFractionDigits:2})+"%</b><span>média dos segmentos</span></div><div><small>2025 → 2026</small><b>+"+p2526.toLocaleString("pt-BR",{maximumFractionDigits:2})+"%</b><span>média dos segmentos</span></div><div><small>2026 → 2027</small><b>+"+p2627.toLocaleString("pt-BR",{maximumFractionDigits:2})+"%</b><span>média dos segmentos</span></div><div class='cumulative'><small>2024 → 2027</small><b>+"+p2427.toLocaleString("pt-BR",{maximumFractionDigits:2})+"%</b><span>evolução acumulada média</span></div></div>"+
    "<div class='tuition-table-wrap'><table class='tuition-table tuition-history-table'><thead><tr><th>SEGMENTO</th><th>2024</th><th>2025</th><th>2026</th><th>2027</th><th>EVOLUÇÃO 24→27</th></tr></thead><tbody>"+
    rows.map(r=>{const total=r.v2024&&r.v2027?dashPct(r.v2024,r.v2027):0;return "<tr><td><b>"+esc(r.label)+"</b><small>"+esc(r.series)+"</small></td><td>"+money(r.v2024)+"</td><td>"+money(r.v2025)+"</td><td>"+money(r.v2026)+"</td><td>"+money(r.v2027)+"</td><td><span class='variation up'>+"+total.toLocaleString("pt-BR",{maximumFractionDigits:2})+"%</span></td></tr>"}).join("")+
    "</tbody></table></div><div class='tuition-insight'><b>Leitura para a Gestão</b><span>O painel separa a evolução histórica das anuidades da operação atual. Assim, a direção enxerga rapidamente a trajetória de preço e, ao mesmo tempo, mantém 2026 e 2027 alinhados ao catálogo oficial usado no Atendimento.</span></div></section>";
}
function dashTuitionAllYearsCompareTable(products){
  const rows=dashTuitionHistoryRows(products);
  return "<div class='school-table-title'>COMPARATIVO DE ANUIDADES • 2024 — 2027</div>"+
    "<div class='tuition-table-wrap'><table class='tuition-table tuition-history-table school-history-table'><thead><tr><th>SEGMENTO</th><th>2024</th><th>2025</th><th>2026</th><th>2027</th><th>EVOLUÇÃO 24→27</th></tr></thead><tbody>"+
    rows.map(r=>{const total=r.v2024&&r.v2027?dashPct(r.v2024,r.v2027):0;return "<tr><td><b>"+esc(r.label)+"</b><small>"+esc(r.series)+"</small></td><td>"+money(r.v2024)+"</td><td>"+money(r.v2025)+"</td><td>"+money(r.v2026)+"</td><td>"+money(r.v2027)+"</td><td><span class='variation up'>+"+total.toLocaleString("pt-BR",{maximumFractionDigits:2})+"%</span></td></tr>"}).join("")+
    "</tbody></table></div>";
}
function dashStiAllYearsCompareTable(products){
  const years=[2024,2025,2026,2027];
  return "<div class='school-table-title sti-all-title'>SISTEMA DE TEMPO INTEGRAL • 2024 — 2027</div>"+
    "<div class='tuition-table-wrap'><table class='tuition-table school-sti-history'><thead><tr><th>ANO</th><th>INFANTIL • S.T.I.</th><th>INFANTIL • FINAL</th><th>ANOS INICIAIS • S.T.I.</th><th>ANOS INICIAIS • FINAL</th></tr></thead><tbody>"+
    years.map(y=>{const m=Object.fromEntries(dashStiRowsForYear(products,y).map(x=>[x.key,x]));const a=m.infantil||{},b=m.iniciais||{};return "<tr><td><b>"+y+"</b></td><td>"+money(a.sti||0)+"</td><td>"+money(a.total||0)+"</td><td>"+money(b.sti||0)+"</td><td>"+money(b.total||0)+"</td></tr>"}).join("")+
    "</tbody></table></div>";
}
function dashAnnualComparisonChart(products){
  const rows=dashTuitionHistoryRows(products),years=[2024,2025,2026,2027];
  const values=[];rows.forEach(r=>years.forEach(y=>values.push(Number(r["v"+y]||0))));
  const max=Math.max(1,...values)*1.08;
  const groups=years.map(y=>{
    const bars=rows.map((r,i)=>{const v=Number(r["v"+y]||0),h=Math.max(2,(v/max)*100);return "<div class='annual-bar annual-series-"+i+"' style='height:"+h+"%' title='"+esc(r.label+" • "+y+" • "+money(v))+"'><span>"+v.toLocaleString("pt-BR",{maximumFractionDigits:0})+"</span></div>"}).join("");
    return "<div class='annual-year-group'><div class='annual-bars'>"+bars+"</div><b>"+y+"</b></div>";
  }).join("");
  return "<section class='school-chart-card annual-chart-card'><div class='school-chart-head'><div><small>GRÁFICO COMPARATIVO</small><h3>Evolução da Anuidade (até o vencimento) • 2024 — 2027</h3></div></div>"+
    "<div class='annual-chart-scroll'><div class='annual-chart-plot'>"+groups+"</div></div>"+
    "<div class='school-chart-legend'><span class='l0'>Educação Infantil</span><span class='l1'>Ensino Fundamental • Anos Iniciais</span><span class='l2'>Ensino Fundamental • Anos Finais</span></div></section>";
}
function dashStiChartSvg(products,key,label){
  const years=[2024,2025,2026,2027],data=years.map(y=>{const r=dashStiRowsForYear(products,y).find(x=>x.key===key)||{};return {year:y,sti:Number(r.sti||0),total:Number(r.total||0)}});
  const max=Math.max(1,...data.flatMap(x=>[x.sti,x.total]))*1.10,base=176,top=24,plotH=base-top,xs=[58,158,258,358];
  const bars=data.map((d,i)=>{const h=(d.sti/max)*plotH,y=base-h,x=xs[i]-18;return "<rect class='sti-svg-bar' x='"+x+"' y='"+y.toFixed(1)+"' width='36' height='"+h.toFixed(1)+"' rx='5'><title>"+esc(label+" • "+d.year+" • S.T.I. "+money(d.sti))+"</title></rect><text class='sti-svg-value bar-value' x='"+xs[i]+"' y='"+Math.max(14,y-5).toFixed(1)+"'>"+d.sti.toLocaleString("pt-BR",{maximumFractionDigits:0})+"</text>"}).join("");
  const points=data.map((d,i)=>{const y=base-(d.total/max)*plotH;return {x:xs[i],y:y,v:d.total,year:d.year}}),line=points.map(p=>p.x+","+p.y.toFixed(1)).join(" ");
  const dots=points.map(p=>"<circle class='sti-svg-dot' cx='"+p.x+"' cy='"+p.y.toFixed(1)+"' r='4'><title>"+esc(label+" • "+p.year+" • Valor final "+money(p.v))+"</title></circle><text class='sti-svg-value line-value' x='"+p.x+"' y='"+Math.max(13,p.y-8).toFixed(1)+"'>"+p.v.toLocaleString("pt-BR",{maximumFractionDigits:0})+"</text>").join("");
  const labels=data.map((d,i)=>"<text class='sti-svg-year' x='"+xs[i]+"' y='198'>"+d.year+"</text>").join("");
  return "<div class='sti-chart-panel'><h4>"+esc(label)+"</h4><svg viewBox='0 0 420 210' role='img' aria-label='Comparativo S.T.I. e valor final de "+esc(label)+" entre 2024 e 2027'><line class='sti-svg-axis' x1='28' y1='"+base+"' x2='394' y2='"+base+"'></line>"+bars+"<polyline class='sti-svg-line' points='"+line+"'></polyline>"+dots+labels+"</svg></div>";
}
function dashComparisonChartsHtml(products){
  return "<section class='school-comparison-section'><div class='school-comparison-banner'>GRÁFICOS DE COMPARAÇÃO</div>"+dashAnnualComparisonChart(products)+
    "<section class='school-chart-card'><div class='school-chart-head'><div><small>GRÁFICO COMPARATIVO</small><h3>Comparativo do S.T.I. e Valor Final (até o vencimento) • 2024 — 2027</h3></div></div><div class='sti-chart-grid'>"+
    dashStiChartSvg(products,"infantil","Educação Infantil")+dashStiChartSvg(products,"iniciais","Ensino Fundamental • Anos Iniciais")+"</div><div class='school-chart-legend sti-legend'><span class='sti-bar-key'>Investimento S.T.I. (12 parcelas)</span><span class='sti-line-key'>Valor final (até o vencimento)</span></div></section></section>";
}
function dashTuitionDownloadModal(products,currentView){
  const current=(["2024","2025","2026","2027","history"].includes(String(currentView))?String(currentView):"2027");
  const opts=[
    ["2024","Tabela de valores 2024"],["2025","Tabela de valores 2025"],["2026","Tabela de valores 2026"],["2027","Tabela de valores 2027"],
    ["history","Comparativo de anuidades 2024–2027"],["sti2024","S.T.I. 2024"],["sti2025","S.T.I. 2025"],["sti2026","S.T.I. 2026"],["sti2027","S.T.I. 2027"],["stihistory","Comparativo S.T.I. 2024–2027"]
  ];
  modal("<div class='modal-head'><h3>Baixar tabelas de valores</h3><button class='icon-btn' data-close>✕</button></div><div class='modal-body'><div class='report-intro'><b>⬇ Tabela de valores</b><span>Escolha o ano ou o comparativo completo e baixe em PDF ou Excel.</span></div><form id='tuitionDownloadForm' class='form-grid'><div class='field'><label>Conteúdo</label><select name='SCOPE'>"+
    opts.map(o=>"<option value='"+o[0]+"' "+(current===o[0]?"selected":"")+">"+o[1]+"</option>").join("")+
    "</select></div><div class='field'><label>Formato</label><select name='FORMAT'>"+gfReportFormatOptions()+"</select></div></form></div><div class='modal-foot'><button class='btn btn-soft' data-close>Cancelar</button><button class='btn btn-primary' id='generateTuitionDownload'>⬇ Baixar tabela</button></div>");
  $$("[data-close]").forEach(x=>x.onclick=closeModal);
  $("#generateTuitionDownload").onclick=async function(){
    const d=Object.fromEntries(new FormData($("#tuitionDownloadForm")).entries()),scope=d.SCOPE,fmt=d.FORMAT;
    let title="",subtitle="",rows=[],columns=[];
    if(["2024","2025","2026","2027"].includes(scope)){
      const year=Number(scope),arr=dashTuitionRowsForYear(products,year);
      title="Tabela de Valores "+year;subtitle="Colégio Futuro • padrão oficial da escola";
      columns=[
        {key:"segmento",label:"Segmento",width:2.1},{key:"anuidade",label:"Anuidade",width:1.4,align:"right"},{key:"anuidadePos",label:"Após vencimento",width:1.4,align:"right"},
        {key:"primeira",label:"1ª parcela",width:1.2,align:"right"},{key:"p12",label:"12 parcelas",width:1.2,align:"right"},{key:"p12pos",label:"12x após venc.",width:1.2,align:"right"},
        {key:"p11",label:"11 parcelas",width:1.2,align:"right"},{key:"p11pos",label:"11x após venc.",width:1.2,align:"right"}
      ];
      const price=v=>Number(v||0)>0?money(v):"—";
      rows=arr.map(r=>({segmento:r.label+" • "+r.series,anuidade:price(r.annual),anuidadePos:price(r.annualPost),primeira:price(r.first||GF_FIRST_REFERENCE[year]?.[r.key]||0),p12:price(r.plan12),p12pos:price(r.plan12Post),p11:price(r.plan11),p11pos:price(r.plan11Post)}));
    }else if(scope==="history"){
      const history=dashTuitionHistoryRows(products);
      title="Comparativo de Anuidades 2024–2027";subtitle="Colégio Futuro • valores até o vencimento";
      columns=[{key:"segmento",label:"Segmento",width:2.3},{key:"y24",label:"2024",width:1.2,align:"right"},{key:"y25",label:"2025",width:1.2,align:"right"},{key:"y26",label:"2026",width:1.2,align:"right"},{key:"y27",label:"2027",width:1.2,align:"right"},{key:"pct",label:"24→27",width:1}];
      rows=history.map(r=>({segmento:r.label+" • "+r.series,y24:money(r.v2024),y25:money(r.v2025),y26:money(r.v2026),y27:money(r.v2027),pct:dashPct(r.v2024,r.v2027).toLocaleString("pt-BR",{maximumFractionDigits:2})+"%"}));
    }else if(/^sti20\d{2}$/.test(scope)){
      const year=Number(scope.slice(3)),arr=dashStiRowsForYear(products,year);
      title="S.T.I. - Sistema de Tempo Integral "+year;subtitle="Colégio Futuro • adicional ao tempo regular";
      columns=[{key:"segmento",label:"Segmento",width:2.2},{key:"regular",label:"Regular",width:1.3,align:"right"},{key:"sti",label:"S.T.I.",width:1.3,align:"right"},{key:"final",label:"Valor final",width:1.4,align:"right"},{key:"apos",label:"Final após venc.",width:1.5,align:"right"}];
      rows=arr.map(r=>({segmento:r.label+" • "+r.series,regular:money(r.regular),sti:money(r.sti),final:money(r.total),apos:money(r.totalPost)}));
    }else{
      const years=[2024,2025,2026,2027];
      title="Comparativo S.T.I. 2024–2027";subtitle="Colégio Futuro • investimento adicional e valor final";
      columns=[{key:"ano",label:"Ano",width:.8},{key:"segmento",label:"Segmento",width:2.2},{key:"sti",label:"S.T.I.",width:1.3,align:"right"},{key:"final",label:"Valor final",width:1.4,align:"right"},{key:"apos",label:"Final após venc.",width:1.5,align:"right"}];
      rows=years.flatMap(y=>dashStiRowsForYear(products,y).map(r=>({ano:String(y),segmento:r.label+" • "+r.series,sti:money(r.sti),final:money(r.total),apos:money(r.totalPost)})));
    }
    await gfDownloadReport({format:fmt,title:title,subtitle:subtitle,filename:gfReportFile("tabela-valores",[scope]),orientation:"landscape",meta:gfReportMeta([{label:"Fonte",value:["2024","2025"].includes(scope)?"Guias oficiais do Colégio Futuro":"Gestão Futuro + histórico oficial"}]),columns:columns,rows:rows},$("#generateTuitionDownload"));
  };
}
function dashMountTuitionDashboard(products){
  const role=activeInterfaceRole(),roleLabel=role==="staff"?"SECRETARIA • SOMENTE LEITURA":"GESTÃO • FONTE OFICIAL";
  const selector="<div class='tuition-selector-bar'><div class='field'><label for='tuitionTableSelector'>Tabela em exibição</label><select id='tuitionTableSelector'><option value='2024'>Tabela 2024</option><option value='2025'>Tabela 2025</option><option value='2026'>Tabela 2026</option><option value='2027' selected>Tabela 2027</option><option value='history'>Comparativo 2024–2027</option></select></div><div class='tuition-selector-copy'><b id='tuitionSelectionTitle'>Tabela oficial 2027</b><span id='tuitionSelectionHint'>2024–2025 vêm do histórico oficial; 2026–2027 usam o catálogo publicado pela Gestão.</span></div></div>";
  $("#view").insertAdjacentHTML("beforeend","<section class='card tuition-dashboard school-dashboard'><div class='tuition-dashboard-head school-dashboard-head'><div><small>COLÉGIO FUTURO • "+roleLabel+"</small><h2>Tabela de Valores • Padrão da Escola</h2><p>Ano letivo 2024 • 2025 • 2026 • 2027</p><span class='catalog-sync-badge ok'>"+esc(gfCatalogSourceLabel(products))+" • Secretaria • Atendimento • Matrícula • Panfletos • Demonstrativos</span></div><button class='btn btn-primary' id='downloadTuitionTable'>⬇ Baixar tabela</button></div>"+selector+"<div id='tuitionDashboardBody'></div>"+dashComparisonChartsHtml(products)+"</section>");
  let current="2027";
  const draw=()=>{
    if(current==="history"){
      $("#tuitionDashboardBody").innerHTML=dashTuitionAllYearsCompareTable(products)+dashStiAllYearsCompareTable(products);
      $("#tuitionSelectionTitle").textContent="Comparativo completo 2024–2027";
      $("#tuitionSelectionHint").textContent="Anuidades e S.T.I. lado a lado para leitura de evolução e tomada de decisão.";
    }else{
      const year=Number(current),rows=dashTuitionRowsWithMetrics(products,year);
      $("#tuitionDashboardBody").innerHTML=dashTuitionYearTable(rows,year,products)+dashCampaignPolicyHtml(products,year)+dashStiYearTable(products,year);
      $("#tuitionSelectionTitle").textContent="Tabela oficial "+year;
      $("#tuitionSelectionHint").textContent=year<=2025?"Histórico oficial do Colégio Futuro.":"Valores conectados ao catálogo oficial da Gestão Futuro, com referência visual do padrão da escola.";
    }
    $("#tuitionTableSelector").value=current;
  };
  $("#tuitionTableSelector").onchange=function(){current=this.value;draw()};
  $("#downloadTuitionTable").onclick=()=>dashTuitionDownloadModal(products,current);
  draw();
}
async function renderDashboard(){
  const roleNow=activeInterfaceRole();
  const heroLabel=roleNow==="admin"?"Gestão • Financeiro • Autorizações":roleNow==="staff"?"Secretaria • Atendimento • Matrículas":"Gestão escolar integrada";
  $("#view").innerHTML=`<section class="dashboard-brand-hero">
    <div class="dashboard-brand-visual">
      <img class="dashboard-hero-logo" src="${window.FUTURO_BRAND?.logoWide||window.FUTURO_BRAND?.icon||"/assets/logo-futuro-white.svg"}" alt="Colégio Futuro">
      <div class="dashboard-hero-copy"><small>COLÉGIO FUTURO</small><strong>Gestão Futuro</strong><p>Secretaria • Atendimento • Matrículas • Gestão • Financeiro</p></div>
    </div>
    <div class="dashboard-brand-caption"><span>${heroLabel}</span></div>
  </section>
  <div class="cards grid">${["Alunos ativos","Matrículas ativas","Documentos pendentes","Status"].map(x=>`<div class="card metric"><div class="label">${x}</div><div class="value">…</div><div class="hint">atualizando</div></div>`).join("")}</div>`;
  const dashboardSeq=state.navSeq;
  let publicData={},dashboardOnline=true;
  try{ publicData=await api("dashboardPublico"); }catch(e){ dashboardOnline=false;setNotice(`Conexão da PWA pendente: ${esc(e.message)}`,"error"); }
  if(dashboardSeq!==state.navSeq)return;
  const vals=[publicData?.["Alunos ativos"]??0, publicData?.["Matrículas ativas"]??0, publicData?.["Documentos pendentes"]??0, dashboardOnline?"Online":"Indisponível"];
  $$(".metric .value").forEach((el,i)=>el.textContent=vals[i]);
  $$(".metric .hint").forEach((el,i)=>el.textContent=i===3?"Apps Script + Google Sheets":"visão operacional");

  if(state.adminToken){
    try{
      const [d,products]=await Promise.all([
        api("dashboardGestao",{token:state.adminToken}).catch(()=>({})),
        loadCatalogProducts(true).catch(()=>([]))
      ]);
      if(dashboardSeq!==state.navSeq)return;
      const cards=Object.entries(d).slice(0,8).map(([k,v])=>`<div class="card metric"><div class="label">${esc(k)}</div><div class="value" style="font-size:22px">${esc(v)}</div><div class="hint">Gestão</div></div>`).join("");
      if(cards)$("#view").insertAdjacentHTML("beforeend",`<div class="section-head"><h2>Indicadores financeiros</h2></div><div class="cards grid">${cards}</div>`);
      $("#view").insertAdjacentHTML("beforeend",`<div class="card director-push-card"><div><b>📲 Avisos no celular do diretor</b><span>Receba notificações mesmo com a PWA fechada quando houver matrícula realizada ou solicitação de desconto.</span></div><button class="btn btn-gold" id="directorPushBtn">Ativar notificações</button></div>`);
      $("#directorPushBtn").onclick=async function(){var b=this,old=b.textContent;b.disabled=true;b.textContent="Ativando…";try{await enableDirectorPush();b.textContent="Notificações ativas ✓";b.className="btn btn-production"}catch(e){showToast(e.message,"error");b.disabled=false;b.textContent=old}};
      refreshDirectorPushButton();

      dashMountTuitionDashboard(products);
    }catch(e){
      $("#view").insertAdjacentHTML("beforeend",`<div class="notice error">Não foi possível montar a tabela de anuidades: ${esc(e.message)}</div>`);
    }
  }
  if(state.staffToken&&!state.adminToken){
    try{
      const products=await loadCatalogProducts(true);
      if(dashboardSeq!==state.navSeq)return;
      dashMountTuitionDashboard(products);
    }catch(e){
      $("#view").insertAdjacentHTML("beforeend",`<div class="notice error">Não foi possível sincronizar a tabela oficial da Gestão: ${esc(e.message)}</div>`);
    }
  }
  const role=activeInterfaceRole();
  const shortcutHtml=role==="admin"
    ? `<div class="section-head"><h2>Gestão e financeiro</h2><span class="muted">Área restrita à direção/gestão.</span></div><div class="grid role-shortcuts">
        <button class="card btn-soft" data-go="autorizacoes"><strong>Autorizações</strong><br><span class="muted">Pedidos de desconto aguardando decisão</span></button>
        <button class="card btn-soft" data-go="documentacao"><strong>Documentação da matrícula</strong><br><span class="muted">Controlar exigências de novatos/veteranos, Secretaria e Panfletos</span></button>
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

