alter table public.chat_messages
  add column if not exists reply_to_id uuid null
  references public.chat_messages(id) on delete set null;
