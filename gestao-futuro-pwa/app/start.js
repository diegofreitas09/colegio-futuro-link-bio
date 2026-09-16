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
