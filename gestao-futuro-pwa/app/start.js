const HOME_IDLE_MS = 5 * 60 * 1000;
let homeIdleTimer = null;

function showHomeScreen(reason="home"){
  const s=$("#appSplash");
  if(!s)return;
  s.classList.remove("done");
  s.classList.add("home-visible");
  document.body.classList.add("home-active");
  s.dataset.reason=reason;
  closeModeGate();
}

function hideHomeScreen(){
  const s=$("#appSplash");
  if(!s)return;
  s.classList.add("done");
  s.classList.remove("home-visible");
  document.body.classList.remove("home-active");
}

function resetHomeIdle(){
  clearTimeout(homeIdleTimer);
  if(document.body.classList.contains("home-active"))return;
  homeIdleTimer=setTimeout(()=>showHomeScreen("idle"),HOME_IDLE_MS);
}

async function enterHomeRole(role){
  const active=activeInterfaceRole();
  if((role==="staff"&&active==="staff"&&state.staffToken)||(role==="admin"&&active==="admin"&&state.adminToken)){
    setRunMode("PRODUCAO");
    hideHomeScreen();
    ensureEntryNotifications().catch(()=>{});
    await navigate("dashboard");
    resetHomeIdle();
    return;
  }
  switchInterfaceModal(role);
}

document.addEventListener("pointerdown",()=>{ 
  if(typeof primeAppAlerts==="function") primeAppAlerts();
  resetHomeIdle();
},{passive:true});
document.addEventListener("keydown",resetHomeIdle,{passive:true});
document.addEventListener("touchstart",resetHomeIdle,{passive:true});
document.addEventListener("mousemove",resetHomeIdle,{passive:true});

const brandLogo=$("#schoolLogo"); if(brandLogo&&window.FUTURO_BRAND?.logo) brandLogo.src=window.FUTURO_BRAND.logo;

// Tela principal
$("#homeStaffBtn").onclick=()=>enterHomeRole("staff");
$("#homeAdminBtn").onclick=()=>enterHomeRole("admin");

// Navegação interna
$$("#nav button").forEach(b=>b.onclick=()=>{navigate(b.dataset.view);resetHomeIdle();});
$("#sessionBtn").onclick=()=>showHomeScreen("manual");
$("#interfaceSwitchBtn").onclick=()=>showHomeScreen("manual");
$("#modeBtn").onclick=openModeModal;
refreshModeButton();

// PWA
window.addEventListener("beforeinstallprompt", e=>{
  e.preventDefault();
  state.deferredInstall=e;
  $("#installBtn").classList.remove("hidden");
  $("#homeInstallBtn").classList.remove("hidden");
});
async function promptInstall(){
  if(!state.deferredInstall)return;
  state.deferredInstall.prompt();
  await state.deferredInstall.userChoice;
  state.deferredInstall=null;
  $("#installBtn").classList.add("hidden");
  $("#homeInstallBtn").classList.add("hidden");
}
$("#installBtn").onclick=promptInstall;
$("#homeInstallBtn").onclick=promptInstall;
if("serviceWorker" in navigator) navigator.serviceWorker.register("/service-worker.js").catch(console.warn);

applyRoleInterface();
refreshSessionButton();
showHomeScreen("startup");
navigate("dashboard");

// Evita várias chamadas concorrentes logo na abertura.
const runIdle=cb=>("requestIdleCallback" in window?requestIdleCallback(cb,{timeout:2500}):setTimeout(cb,1200));
runIdle(()=>checkApi());

// Alertas da Direção: consulta leve e sem sobrepor requisições.
setInterval(()=>{ if(document.visibilityState==="visible"&&typeof pollApprovals==="function") pollApprovals(); },60000);
setTimeout(()=>{ if(document.visibilityState==="visible"&&typeof pollApprovals==="function") pollApprovals(); },5000);

// Catálogo pré-carregado somente quando o navegador estiver ocioso.
runIdle(()=>{ if(typeof loadCatalogProducts==="function") loadCatalogProducts().catch(()=>{}); });

// Limpeza única dos rascunhos locais antigos usados durante a implantação.
try{
  if(!localStorage.getItem("gf_test_reset_20260917")){
    localStorage.removeItem("gestao_futuro_atendimentos_locais_v1");
    localStorage.removeItem("gestao_futuro_atendimento_rascunho_v1");
    localStorage.setItem("gf_test_reset_20260917","1");
  }
}catch(e){}
