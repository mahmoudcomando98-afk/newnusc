-- إضافة نوع الحدث ورقم السكشن للجدول + index للأداء
alter table public.schedule_items
  add column if not exists section_number int null check (section_number is null or (section_number >= 1 and section_number <= 25)),
  add column if not exists event_type text null default 'lecture';

create index if not exists schedule_items_section_idx
  on public.schedule_items (subject_id, section_number);
