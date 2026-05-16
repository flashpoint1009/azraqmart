
-- ═══════════════════════════════════════════════════════════════════════
-- Warehouse Advanced (adapted to existing schema: stock_qty, existing stock_movements)
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.stocktakes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'draft' check (status in ('draft','in_progress','completed','cancelled')),
  notes text,
  total_items integer not null default 0,
  discrepancies integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.stocktake_items (
  id uuid primary key default gen_random_uuid(),
  stocktake_id uuid not null references public.stocktakes(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  system_quantity integer not null default 0,
  counted_quantity integer,
  discrepancy integer generated always as (coalesce(counted_quantity,0) - system_quantity) stored,
  notes text,
  counted_at timestamptz,
  counted_by uuid references public.profiles(id) on delete set null
);
create index if not exists idx_stocktake_items_stocktake on public.stocktake_items(stocktake_id);

create table if not exists public.stock_alerts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade unique,
  min_quantity integer not null default 5,
  is_active boolean not null default true,
  last_alerted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','approved','rejected','completed')),
  reason text not null,
  total_amount numeric(12,2) not null default 0,
  notes text,
  processed_by uuid references public.profiles(id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.customer_returns(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  condition text default 'good' check (condition in ('good','damaged','expired'))
);

create table if not exists public.bin_locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  zone text,
  capacity integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.product_locations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  bin_location_id uuid not null references public.bin_locations(id) on delete cascade,
  quantity integer not null default 0,
  is_primary boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(product_id, bin_location_id)
);

alter table public.stocktakes enable row level security;
alter table public.stocktake_items enable row level security;
alter table public.stock_alerts enable row level security;
alter table public.customer_returns enable row level security;
alter table public.customer_return_items enable row level security;
alter table public.bin_locations enable row level security;
alter table public.product_locations enable row level security;

create policy "Authenticated full access" on public.stocktakes for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.stocktake_items for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.stock_alerts for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.customer_returns for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.customer_return_items for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.bin_locations for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.product_locations for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- record_stock_movement adapted to existing stock_movements schema (qty, qty_before, qty_after)
create or replace function public.record_stock_movement(
  p_product_id uuid,
  p_movement_type text,
  p_quantity integer,
  p_reason text default null,
  p_reference_id uuid default null,
  p_reference_type text default null,
  p_actor_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before integer;
  v_after integer;
  v_id uuid;
begin
  select stock_qty into v_before from public.products where id = p_product_id for update;
  if v_before is null then raise exception 'Product not found'; end if;

  if p_movement_type in ('in','return') then
    v_after := v_before + p_quantity;
  elsif p_movement_type in ('out','damage') then
    v_after := greatest(0, v_before - p_quantity);
  else
    v_after := p_quantity;
  end if;

  update public.products set stock_qty = v_after, updated_at = now() where id = p_product_id;

  insert into public.stock_movements(product_id, movement_type, qty, qty_before, qty_after, reason, reference_type, reference_id, created_by)
  values (p_product_id, p_movement_type, p_quantity, v_before, v_after, p_reason, p_reference_type, p_reference_id, coalesce(p_actor_id, auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- Delivery GPS
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists public.driver_locations (
  driver_id uuid primary key references public.profiles(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy double precision,
  heading double precision,
  speed double precision,
  is_online boolean not null default true,
  last_updated_at timestamptz not null default now()
);

create table if not exists public.driver_location_history (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  speed double precision,
  recorded_at timestamptz not null default now()
);
create index if not exists idx_driver_location_history_driver on public.driver_location_history(driver_id, recorded_at desc);

alter table public.driver_locations enable row level security;
alter table public.driver_location_history enable row level security;
create policy "Authenticated full access" on public.driver_locations for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.driver_location_history for all using (auth.uid() is not null) with check (auth.uid() is not null);

alter publication supabase_realtime add table public.driver_locations;

-- ═══════════════════════════════════════════════════════════════════════
-- Developer SaaS Panel
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  changes jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_log_actor on public.audit_log(actor_id, created_at desc);
create index if not exists idx_audit_log_entity on public.audit_log(entity_type, entity_id, created_at desc);
create index if not exists idx_audit_log_action on public.audit_log(action, created_at desc);

create table if not exists public.app_labels (
  key text primary key,
  value text not null,
  default_value text not null,
  category text not null default 'general',
  description text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_typography (
  key text primary key,
  value text not null,
  category text not null default 'font',
  label text not null,
  css_variable text,
  updated_at timestamptz not null default now()
);

insert into public.app_typography (key, value, category, label, css_variable) values
  ('font_family_primary', 'Cairo, sans-serif', 'font', 'الخط الأساسي', '--font-primary'),
  ('font_family_display', 'Cairo, sans-serif', 'font', 'خط العناوين', '--font-display'),
  ('font_family_mono', 'IBM Plex Mono, monospace', 'font', 'خط الأكواد', '--font-mono'),
  ('font_size_xs', '0.75rem', 'size', 'حجم صغير جدًا', '--text-xs'),
  ('font_size_sm', '0.875rem', 'size', 'حجم صغير', '--text-sm'),
  ('font_size_base', '1rem', 'size', 'حجم عادي', '--text-base'),
  ('font_size_lg', '1.125rem', 'size', 'حجم كبير', '--text-lg'),
  ('font_size_xl', '1.25rem', 'size', 'حجم كبير جدًا', '--text-xl'),
  ('font_size_2xl', '1.5rem', 'size', 'حجم عنوان', '--text-2xl'),
  ('font_size_3xl', '1.875rem', 'size', 'حجم عنوان كبير', '--text-3xl'),
  ('font_weight_normal', '400', 'weight', 'وزن عادي', '--font-normal'),
  ('font_weight_medium', '500', 'weight', 'وزن متوسط', '--font-medium'),
  ('font_weight_bold', '700', 'weight', 'وزن ثقيل', '--font-bold'),
  ('font_weight_extrabold', '800', 'weight', 'وزن ثقيل جدًا', '--font-extrabold'),
  ('line_height_tight', '1.25', 'spacing', 'تباعد أسطر ضيق', '--leading-tight'),
  ('line_height_normal', '1.5', 'spacing', 'تباعد أسطر عادي', '--leading-normal'),
  ('line_height_relaxed', '1.75', 'spacing', 'تباعد أسطر مريح', '--leading-relaxed'),
  ('letter_spacing_tight', '-0.025em', 'spacing', 'تقارب حروف', '--tracking-tight'),
  ('letter_spacing_normal', '0em', 'spacing', 'مسافة حروف عادية', '--tracking-normal'),
  ('letter_spacing_wide', '0.025em', 'spacing', 'تباعد حروف', '--tracking-wide'),
  ('border_radius_sm', '0.5rem', 'spacing', 'استدارة صغيرة', '--radius-sm'),
  ('border_radius_md', '1rem', 'spacing', 'استدارة متوسطة', '--radius-md'),
  ('border_radius_lg', '1.5rem', 'spacing', 'استدارة كبيرة', '--radius-lg'),
  ('border_radius_full', '9999px', 'spacing', 'استدارة كاملة', '--radius-full')
on conflict (key) do nothing;

create table if not exists public.plan_config (
  id text primary key,
  name text not null,
  name_ar text not null,
  price_monthly numeric(10,2) default 0,
  price_yearly numeric(10,2) default 0,
  currency text default 'EGP',
  limits jsonb not null default '{}',
  features jsonb not null default '[]',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  badge_text text,
  updated_at timestamptz not null default now()
);

insert into public.plan_config (id, name, name_ar, price_monthly, price_yearly, limits, features, sort_order, badge_text) values
  ('free', 'Free', 'مجاني', 0, 0, '{"products": 50, "ordersPerMonth": 100, "branches": 1}', '["products", "orders", "branches"]', 1, null),
  ('pro', 'Pro', 'احترافي', 299, 2990, '{"products": 500, "ordersPerMonth": "unlimited", "branches": 3}', '["products", "orders", "branches", "sms", "analytics"]', 2, 'الأكثر شيوعًا'),
  ('enterprise', 'Enterprise', 'مؤسسات', 799, 7990, '{"products": "unlimited", "ordersPerMonth": "unlimited", "branches": "unlimited"}', '["products", "orders", "branches", "sms", "analytics", "custom_domain", "developer"]', 3, 'للشركات')
on conflict (id) do nothing;

create table if not exists public.app_custom_css (
  id text primary key default 'global',
  css_content text not null default '',
  is_active boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.app_custom_css (id, css_content, is_active)
values ('global', E'/* Custom CSS — add your overrides here */\n', false)
on conflict (id) do nothing;

create table if not exists public.app_snapshots (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  snapshot_data jsonb not null,
  version text not null default '1.0',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;
alter table public.app_labels enable row level security;
alter table public.app_typography enable row level security;
alter table public.plan_config enable row level security;
alter table public.app_custom_css enable row level security;
alter table public.app_snapshots enable row level security;

create policy "Authenticated full access" on public.audit_log for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.app_labels for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.app_typography for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.plan_config for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.app_custom_css for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.app_snapshots for all using (auth.uid() is not null) with check (auth.uid() is not null);

create or replace function public.log_audit(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_changes jsonb default null,
  p_metadata jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.audit_log(actor_id, action, entity_type, entity_id, changes, metadata)
  values (p_actor_id, p_action, p_entity_type, p_entity_id, p_changes, p_metadata)
  returning id into v_id;
  return v_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- Chat + Internal Messaging
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'open' check (status in ('open','assigned','resolved','closed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  subject text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_chat_conversations_customer on public.chat_conversations(customer_id, created_at desc);
create index if not exists idx_chat_conversations_status on public.chat_conversations(status, last_message_at desc);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  sender_type text not null default 'customer' check (sender_type in ('customer','admin','bot')),
  content text not null,
  is_read boolean not null default false,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_chat_messages_conversation on public.chat_messages(conversation_id, created_at);

create table if not exists public.chatbot_faqs (
  id uuid primary key default gen_random_uuid(),
  keywords text[] not null,
  question text not null,
  answer text not null,
  category text default 'general',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.chatbot_faqs (keywords, question, answer, category, sort_order) values
  ('{طلب,حالة,وين,فين,متابعة}', 'فين طلبي؟', 'يمكنك متابعة حالة طلبك من صفحة "طلباتي". لو الطلب جديد، هيتجهز خلال ساعات. لو عايز تفاصيل أكتر، اكتب "دعم" وهوصلك بفريق الدعم.', 'orders', 1),
  ('{توصيل,وقت,كام,ساعة}', 'التوصيل بياخد كام؟', 'التوصيل عادة بياخد من 2-6 ساعات حسب منطقتك. لو الطلب مستعجل، تواصل مع الدعم.', 'delivery', 2),
  ('{دفع,فلوس,كاش,فيزا}', 'طرق الدفع إيه؟', 'حاليًا الدفع عند الاستلام (كاش). قريبًا هنضيف طرق دفع إلكترونية.', 'payment', 3),
  ('{مرتجع,رجوع,استبدال,غلط}', 'عايز أرجع منتج', 'لو عايز ترجع منتج، كلم فريق الدعم وهما يساعدوك. اكتب "دعم" عشان أوصلك.', 'returns', 4),
  ('{سعر,أسعار,غالي,خصم,عرض}', 'في عروض أو خصومات؟', 'تابع صفحة العروض عندنا لأحدث الخصومات. لو تاجر جملة، ممكن تتواصل للأسعار الخاصة.', 'pricing', 5),
  ('{دعم,مساعدة,مشكلة,شكوى}', 'عايز أتكلم مع الدعم', 'تمام! بوصلك بفريق الدعم دلوقتي. لو مفيش حد متاح، هيرد عليك في أقرب وقت.', 'support', 6),
  ('{شكرا,ممتاز,حلو,تمام}', 'شكرًا', 'العفو! لو محتاج أي حاجة تانية، أنا هنا 🙂', 'general', 7)
on conflict do nothing;

create table if not exists public.internal_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_internal_messages_recipient on public.internal_messages(recipient_id, is_read, created_at desc);
create index if not exists idx_internal_messages_sender on public.internal_messages(sender_id, created_at desc);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chatbot_faqs enable row level security;
alter table public.internal_messages enable row level security;

create policy "Authenticated full access" on public.chat_conversations for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.chat_messages for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.chatbot_faqs for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated full access" on public.internal_messages for all using (auth.uid() is not null) with check (auth.uid() is not null);

alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.internal_messages;
