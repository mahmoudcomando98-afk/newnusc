-- WhatsApp notifications on/off switch — used by the standalone WhatsApp bot.
-- The bot reads this row on every poll cycle; when false/missing-false, it sends nothing.
-- Admin → الرئيسية page has a toggle that flips this row.

BEGIN;

INSERT INTO public.platform_settings (key, value, description)
VALUES (
  'whatsapp_notifications_enabled',
  'true'::jsonb,
  'هل إشعارات WhatsApp مفعلة للجروب؟ — يتحكم فيها بوت الإشعارات، مش بالتصميم'
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
