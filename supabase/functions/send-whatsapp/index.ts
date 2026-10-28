/**
 * Supabase Edge Function: send WhatsApp messages for a platform notification.
 *
 * Secrets (supabase secrets set):
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_WHATSAPP_FROM   e.g. whatsapp:+14155238886
 *
 * Optional:
 *   WHATSAPP_ENABLED=true
 *
 * Body JSON:
 *   { title: string, body: string, link?: string }
 *
 * Requires Authorization: Bearer <user JWT> and admin/moderator role.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  // Egypt local 01xxxxxxxxx → 201xxxxxxxxx
  if (d.length === 11 && d.startsWith("01")) d = "2" + d;
  if (d.length === 10 && d.startsWith("1")) d = "20" + d;
  if (d.length < 10 || d.length > 15) return null;
  return d;
}

async function sendTwilioWhatsApp(
  toE164: string,
  text: string,
  env: {
    sid: string;
    token: string;
    from: string;
  }
) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.sid}/Messages.json`;
  const body = new URLSearchParams({
    From: env.from,
    To: `whatsapp:+${toE164}`,
    Body: text,
  });
  const auth = btoa(`${env.sid}:${env.token}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.message || `Twilio error ${res.status}`);
  }
  return payload;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!supabaseUrl || !serviceKey) {
      return json(500, { error: "Server misconfigured" });
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(401, { error: "Unauthorized" });
    }

    const userClient = createClient(supabaseUrl, anonKey || serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) return json(401, { error: "Unauthorized" });

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const role = profile?.role || "";
    if (!["admin", "moderator"].includes(role)) {
      return json(403, { error: "Admin only" });
    }

    const enabled = (Deno.env.get("WHATSAPP_ENABLED") || "true").toLowerCase() !== "false";
    if (!enabled) return json(200, { ok: true, skipped: true, reason: "disabled" });

    const sid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
    const token = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
    const from = Deno.env.get("TWILIO_WHATSAPP_FROM") || "";
    if (!sid || !token || !from) {
      return json(503, {
        error: "WhatsApp not configured",
        hint: "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM",
      });
    }

    const input = await req.json().catch(() => ({}));
    const title = String(input.title || "").trim().slice(0, 120);
    const bodyText = String(input.body || "").trim().slice(0, 500);
    const link = String(input.link || "").trim().slice(0, 400);
    if (!title || !bodyText) return json(400, { error: "title and body required" });

    let message = `NUSC\n${title}\n${bodyText}`;
    if (link) message += `\n${link}`;
    if (message.length > 1500) message = message.slice(0, 1490) + "…";

    const { data: students, error: listErr } = await admin
      .from("profiles")
      .select("id, whatsapp_phone, whatsapp_opt_in, is_active")
      .eq("whatsapp_opt_in", true)
      .neq("role", "admin");

    if (listErr) return json(500, { error: listErr.message });

    const targets = (students || [])
      .filter((s) => s.is_active !== false)
      .map((s) => ({ id: s.id, phone: normalizePhone(s.whatsapp_phone) }))
      .filter((s) => !!s.phone) as { id: string; phone: string }[];

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    // Sequential to respect rate limits; small student lists are fine
    for (const t of targets) {
      try {
        await sendTwilioWhatsApp(t.phone, message, { sid, token, from });
        sent += 1;
      } catch (e) {
        failed += 1;
        if (errors.length < 5) errors.push(String((e as Error).message || e));
      }
    }

    return json(200, {
      ok: true,
      targets: targets.length,
      sent,
      failed,
      errors,
    });
  } catch (e) {
    return json(500, { error: String((e as Error).message || e) });
  }
});
