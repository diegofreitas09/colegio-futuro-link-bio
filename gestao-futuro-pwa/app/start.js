// Navegação
$$("#nav button").forEach(b=>b.onclick=()=>navigate(b.dataset.view));
$("#sessionBtn").onclick=()=>authModal(state.adminToken?"admin":"staff");

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
