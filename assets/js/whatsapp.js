/**
 * Client helper: ask Edge Function to broadcast WhatsApp for a notification.
 */
import { supabase } from './supabase.js';

export async function sendWhatsAppBroadcast({ title, body, link }) {
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ok: false, error: 'لازم تكون مسجّل كأدمن.' };
  }

  const { data, error } = await supabase.functions.invoke('send-whatsapp', {
    body: { title, body, link: link || '' }
  });

  if (error) {
    return {
      ok: false,
      error: error.message || 'تعذر إرسال واتساب. راجع إعدادات Twilio على Supabase.'
    };
  }

  if (data?.error) {
    return { ok: false, error: data.error, hint: data.hint, data };
  }

  return { ok: true, data };
}
