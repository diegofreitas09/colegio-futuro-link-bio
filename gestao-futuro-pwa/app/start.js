document.addEventListener("pointerdown",()=>{ if(typeof primeAppAlerts==="function") primeAppAlerts(); },{once:true,passive:true});
const brandLogo=$("#schoolLogo"); if(brandLogo&&window.FUTURO_BRAND?.logo) brandLogo.src=window.FUTURO_BRAND.logo;
// Navegação
$$("#nav button").forEach(b=>b.onclick=()=>navigate(b.dataset.view));
$("#sessionBtn").onclick=()=>authModal(state.adminToken?"admin":"staff");
$("#interfaceSwitchBtn").onclick=()=>{const target=$("#interfaceSwitchBtn").dataset.targetRole;if(target)switchInterfaceModal(target)};
$("#modeBtn").onclick=openModeModal;
refreshModeButton();

// PWA
window.addEventListener("beforeinstallprompt", e=>{e.preventDefault();state.deferredInstall=e;$("#installBtn").classList.remove("hidden");});
$("#installBtn").onclick=async()=>{if(!state.deferredInstall)return;state.deferredInstall.prompt();await state.deferredInstall.userChoice;state.deferredInstall=null;$("#installBtn").classList.add("hidden");};
if("serviceWorker" in navigator) navigator.serviceWorker.register("/service-worker.js").catch(console.warn);

applyRoleInterface();
refreshSessionButton();
navigate("dashboard");

// Evita várias chamadas concorrentes logo na abertura. Primeiro mostra a interface; depois aquece os dados.
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
setTimeout(()=>{ if((state.staffToken||state.adminToken)&&!state.runMode) openModeModal(); },900);
