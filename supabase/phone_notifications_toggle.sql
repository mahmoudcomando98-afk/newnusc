-- Phone (Web Push) notifications on/off switch — used by the platform's push edge functions.
-- The send-push and send-reminder edge functions read this row before sending anything;
-- when false, no phone push goes out (WhatsApp side has its own toggle).
-- Admin → الرئيسية page has a toggle that flips this row.

BEGIN;

INSERT INTO public.platform_settings (key, value, description)
VALUES (
  'phone_notifications_enabled',
  'true'::jsonb,
  'هل إشعارات الهاتف/المتصفح مفعلة للطلاب؟ — يتحكم فيها الإدارة'
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
