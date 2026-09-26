import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import webpush from "web-push";

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwzZJUloa6YdIfJZdCmYw5ch_GkjuS20gUa5zyhulMiAiQj9pH9B3BOE7UU5jZvb_svig/exec";
const UPSTREAM_TIMEOUT_MS = 12000;
async function upstreamFetch(body: Record<string, unknown>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch(APPS_SCRIPT_URL, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(body), redirect:"follow", signal:controller.signal });
    return { response, durationMs: Date.now()-started };
  } finally { clearTimeout(timer); }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
async function notifyDirector(payload: Record<string, unknown>) {
  const publicKey = Netlify.env.get("FUTURO_VAPID_PUBLIC_KEY") || "";
  const privateKey = Netlify.env.get("FUTURO_VAPID_PRIVATE_KEY") || "";
  if (!publicKey || !privateKey) return;
  try {
    webpush.setVapidDetails("https://gestao.colegiofuturoce.com.br", publicKey, privateKey);
    const store = getStore("gestao-futuro-push");
    const subs = await store.get("director-subscriptions", { type: "json" }) as any[] | null;
    const rows = Array.isArray(subs) ? subs : [];
    const keep:any[] = [];
    for (const row of rows) {
      try {
        await webpush.sendNotification(row.subscription, JSON.stringify(payload));
        keep.push(row);
      } catch (e:any) {
        const code = Number(e?.statusCode || 0);
        if (code !== 404 && code !== 410) keep.push(row);
      }
    }
    if (keep.length !== rows.length) await store.setJSON("director-subscriptions", keep);
  } catch {}
}

function enrollmentPush(body: Record<string, unknown>) {
  const data = (body.data || {}) as Record<string, unknown>;
  const mode = String(body.modo || "PRODUCAO");
  const aluno = String(data.NOME_ALUNO || data.ID_ALUNO || "Aluno");
  const serie = String(data.SERIE || data["SÉRIE"] || "");
  const ano = String(data.ANO_LETIVO || "");
  return {
    title: mode === "TESTE" ? "🧪 Matrícula de teste realizada" : "🎓 Nova matrícula realizada",
    body: [aluno, serie, ano].filter(Boolean).join(" • "),
    icon: "/assets/app-icon-192.png",
    badge: "/assets/app-icon-192.png",
    url: "/"
  };
}

function discountPush(body: Record<string, unknown>) {
  const data = (body.data || {}) as Record<string, unknown>;
  const mode = String(body.modo || "PRODUCAO");
  const serie = String(data.SERIE || "");
  const valor = Number(data.VALOR_SOLICITADO || 0);
  return {
    title: mode === "TESTE" ? "🧪 Desconto de teste solicitado" : "💰 Nova solicitação de desconto",
    body: [serie, valor ? "R$ " + valor.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}) : ""].filter(Boolean).join(" • "),
    icon: "/assets/app-icon-192.png",
    badge: "/assets/app-icon-192.png",
    url: "/"
  };
}

export default async (req: Request, _context: Context) => {
  if (req.method === "GET") {
    try {
      const { response: upstream, durationMs } = await upstreamFetch({ action: "health" });
      const text = await upstream.text();
      let data: unknown;
      try { data = JSON.parse(text); } catch { data = { ok: false, error: "Resposta inválida do backend." }; }
      return json({ ...(data as any), _gateway: { durationMs } }, upstream.ok ? 200 : 502);
    } catch (error) {
      return json({ ok: false, error: "Backend indisponível.", detail: String(error) }, 502);
    }
  }

  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);

  const gatewayKey = Netlify.env.get("FUTURO_PWA_GATEWAY_KEY");
  if (!gatewayKey) {
    return json({ ok: false, error: "Configuração pendente: FUTURO_PWA_GATEWAY_KEY." }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "JSON inválido." }, 400);
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (!action) return json({ ok: false, error: "Ação não informada." }, 400);

  const upstreamBody = { ...body, gatewayKey };

  try {
    const { response: upstream, durationMs } = await upstreamFetch(upstreamBody);
    const text = await upstream.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return json({ ok: false, error: "O Apps Script respondeu em formato inesperado." }, 502);
    }

    if (upstream.ok && (data as any)?.ok) {
      if (action === "criarMatriculaCompleta") await notifyDirector(enrollmentPush(body));
      if (action === "solicitarDesconto") await notifyDirector(discountPush(body));
    }

    return json({ ...(data as any), _gateway: { action, durationMs } }, upstream.ok ? 200 : 502);
  } catch (error) {
    return json({ ok: false, error: "Falha de comunicação com o Apps Script.", detail: String(error) }, 502);
  }
};

export const config: Config = { path: "/api/gf" };
