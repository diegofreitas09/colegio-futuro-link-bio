import type { Config, Context } from "@netlify/functions";

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwzZJUloa6YdIfJZdCmYw5ch_GkjuS20gUa5zyhulMiAiQj9pH9B3BOE7UU5jZvb_svig/exec";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

export default async (req: Request, _context: Context) => {
  if (req.method === "GET") {
    try {
      const upstream = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "health" }),
        redirect: "follow"
      });
      const text = await upstream.text();
      let data: unknown;
      try { data = JSON.parse(text); } catch { data = { ok: false, error: "Resposta inválida do backend." }; }
      return json(data, upstream.ok ? 200 : 502);
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
    const upstream = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(upstreamBody),
      redirect: "follow"
    });

    const text = await upstream.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return json({ ok: false, error: "O Apps Script respondeu em formato inesperado." }, 502);
    }

    return json(data, upstream.ok ? 200 : 502);
  } catch (error) {
    return json({ ok: false, error: "Falha de comunicação com o Apps Script.", detail: String(error) }, 502);
  }
};

export const config: Config = { path: "/api/gf" };
