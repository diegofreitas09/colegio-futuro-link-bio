document.addEventListener("pointerdown",()=>{ if(typeof primeAppAlerts==="function") primeAppAlerts(); },{once:true,passive:true});
const brandLogo=$("#schoolLogo"); if(brandLogo&&window.FUTURO_BRAND?.logo) brandLogo.src=window.FUTURO_BRAND.logo;
// Navegação
$$("#nav button").forEach(b=>b.onclick=()=>navigate(b.dataset.view));
$("#sessionBtn").onclick=()=>authModal(state.adminToken?"admin":"staff");
$("#modeBtn").onclick=openModeModal;
refreshModeButton();

// PWA
window.addEventListener("beforeinstallprompt", e=>{e.preventDefault();state.deferredInstall=e;$("#installBtn").classList.remove("hidden");});
$("#installBtn").onclick=async()=>{if(!state.deferredInstall)return;state.deferredInstall.prompt();await state.deferredInstall.userChoice;state.deferredInstall=null;$("#installBtn").classList.add("hidden");};
if("serviceWorker" in navigator) navigator.serviceWorker.register("/service-worker.js").catch(console.warn);

refreshSessionButton();
checkApi();
navigate("dashboard");

// Alertas da Direção: consulta leve a cada 60 segundos quando a sessão de Gestão está ativa.
setInterval(()=>{ if(typeof pollApprovals==="function") pollApprovals(); },60000);
setTimeout(()=>{ if(typeof pollApprovals==="function") pollApprovals(); },2500);

// Pré-carrega o catálogo em segundo plano para reduzir o atraso ao abrir Atendimento/Panfletos.
setTimeout(()=>{ if(typeof loadCatalogProducts==="function") loadCatalogProducts().catch(()=>{}); },700);

// Limpeza única dos rascunhos locais antigos usados durante a implantação.
try{
  if(!localStorage.getItem("gf_test_reset_20260917")){
    localStorage.removeItem("gestao_futuro_atendimentos_locais_v1");
    localStorage.removeItem("gestao_futuro_atendimento_rascunho_v1");
    localStorage.setItem("gf_test_reset_20260917","1");
  }
}catch(e){}
setTimeout(()=>{ if((state.staffToken||state.adminToken)&&!state.runMode) openModeModal(); },900);
