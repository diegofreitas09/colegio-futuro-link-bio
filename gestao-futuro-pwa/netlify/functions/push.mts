import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import webpush from "web-push";

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwzZJUloa6YdIfJZdCmYw5ch_GkjuS20gUa5zyhulMiAiQj9pH9B3BOE7UU5jZvb_svig/exec";
const STORE_NAME = "gestao-futuro-push";
const STORE_KEY = "director-subscriptions";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

async function readSubs() {
  const store = getStore(STORE_NAME);
  const rows = await store.get(STORE_KEY, { type: "json" }) as any[] | null;
  return Array.isArray(rows) ? rows : [];
}

async function writeSubs(rows: any[]) {
  const store = getStore(STORE_NAME);
  await store.setJSON(STORE_KEY, rows.slice(-8));
}

async function verifyAdmin(token: string) {
  const gatewayKey = Netlify.env.get("FUTURO_PWA_GATEWAY_KEY");
  if (!gatewayKey || !token) return false;
  try {
    const r = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "dashboardGestao", token, gatewayKey, modo: "PRODUCAO" }),
      redirect: "follow"
    });
    const out = await r.json() as any;
    return !!(r.ok && out?.ok);
  } catch {
    return false;
  }
}

async function sendToAll(payload: Record<string, unknown>) {
  const publicKey = Netlify.env.get("FUTURO_VAPID_PUBLIC_KEY") || "";
  const privateKey = Netlify.env.get("FUTURO_VAPID_PRIVATE_KEY") || "";
  if (!publicKey || !privateKey) return { sent: 0, total: 0 };
  webpush.setVapidDetails("https://gestao-futuro-pwa.netlify.app", publicKey, privateKey);
  const subs = await readSubs();
  const keep:any[] = [];
  let sent = 0;
  for (const row of subs) {
    try {
      await webpush.sendNotification(row.subscription, JSON.stringify(payload));
      sent++;
      keep.push(row);
    } catch (e:any) {
      const code = Number(e?.statusCode || 0);
      if (code !== 404 && code !== 410) keep.push(row);
    }
  }
  if (keep.length !== subs.length) await writeSubs(keep);
  return { sent, total: subs.length };
}

export default async (req: Request, _context: Context) => {
  const publicKey = Netlify.env.get("FUTURO_VAPID_PUBLIC_KEY") || "";
  if (req.method === "GET") return json({ ok: true, configured: !!publicKey, publicKey });

  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);

  let body:any = {};
  try { body = await req.json(); } catch { return json({ ok:false, error:"JSON inválido." },400); }
  const action = String(body.action || "");
  const token = String(body.token || "");
  if (!(await verifyAdmin(token))) return json({ ok:false, error:"Acesso da Gestão necessário." },401);

  if (action === "subscribe") {
    const sub = body.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return json({ ok:false, error:"Assinatura inválida." },400);
    const rows = await readSubs();
    const filtered = rows.filter((x:any)=>x?.subscription?.endpoint !== sub.endpoint);
    filtered.push({ subscription: sub, createdAt: new Date().toISOString(), label: String(body.label || "Direção") });
    await writeSubs(filtered);
    const test = await sendToAll({
      title: "Gestão Futuro",
      body: "Notificações do diretor ativadas com sucesso.",
      icon: "/assets/app-icon-192.png",
      badge: "/assets/app-icon-192.png",
      url: "/"
    });
    return json({ ok:true, subscribed:true, test });
  }

  if (action === "unsubscribe") {
    const endpoint = String(body.endpoint || "");
    const rows = await readSubs();
    await writeSubs(rows.filter((x:any)=>x?.subscription?.endpoint !== endpoint));
    return json({ ok:true });
  }

  if (action === "test") {
    const result = await sendToAll({
      title: "🔔 Teste de notificação",
      body: "Gestão Futuro pronta para avisar novas matrículas e descontos.",
      icon: "/assets/app-icon-192.png",
      badge: "/assets/app-icon-192.png",
      url: "/"
    });
    return json({ ok:true, ...result });
  }

  return json({ ok:false, error:"Ação não reconhecida." },400);
};

export const config: Config = { path: "/api/push" };
