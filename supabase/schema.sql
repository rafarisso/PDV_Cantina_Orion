-- Habilita extensoes
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Tipos
create type public.study_period as enum ('morning', 'afternoon');
create type public.student_status as enum ('active', 'inactive', 'blocked');
create type public.pricing_model as enum ('prepaid', 'postpaid');
create type public.alert_type as enum ('balance', 'limit', 'negative', 'block');
create type public.pix_status as enum ('created', 'pending', 'paid', 'failed', 'expired', 'refunded');
create type public.user_role as enum ('admin', 'operator', 'guardian');
create type public.ledger_kind as enum ('purchase', 'credit', 'debit', 'adjustment', 'payment');

-- Helpers de papeis
create or replace function public.has_role(role_name public.user_role)
returns boolean
language sql
stable
as $$
  select exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = role_name);
$$;

create table if not exists public.user_roles (
  user_id uuid references auth.users (id) on delete cascade,
  role public.user_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table if not exists public.guardians (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  full_name text not null,
  phone text not null,
  cpf text not null,
  address jsonb not null,
  cep text,
  street text,
  number text,
  complement text,
  neighborhood text,
  city text,
  state text,
  accepted_terms boolean not null default false,
  accepted_at timestamptz,
  accepted_ip inet,
  terms_version text not null,
  terms_accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.guardians add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.guardians add column if not exists cep text;
alter table public.guardians add column if not exists street text;
alter table public.guardians add column if not exists number text;
alter table public.guardians add column if not exists complement text;
alter table public.guardians add column if not exists neighborhood text;
alter table public.guardians add column if not exists city text;
alter table public.guardians add column if not exists state text;
alter table public.guardians add column if not exists accepted_terms boolean not null default false;
alter table public.guardians add column if not exists accepted_at timestamptz;
alter table public.guardians add column if not exists accepted_ip inet;
create unique index if not exists guardians_cpf_idx on public.guardians (cpf);

create table if not exists public.terms_acceptance (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references public.guardians (id) on delete cascade,
  version text not null,
  accepted_at timestamptz not null default now(),
  ip inet,
  user_agent text
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references public.guardians (id) on delete restrict,
  full_name text not null,
  grade text not null,
  period public.study_period not null,
  observations text,
  status public.student_status not null default 'active',
  pricing_model public.pricing_model not null default 'prepaid',
  created_at timestamptz not null default now()
);
create index if not exists students_guardian_idx on public.students (guardian_id);
alter table public.students drop column if exists credit_limit;
alter table public.students drop column if exists allow_negative_once_used;
alter table public.students drop column if exists blocked;
alter table public.students drop column if exists blocked_reason;
alter table public.students add column if not exists observations text;
alter table public.students add column if not exists photo_url text;

-- Papel do usuario autenticado (evita SELECT direto em user_roles)
create or replace function public.get_my_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.user_roles
  where user_id = auth.uid()
  order by case role when 'admin' then 1 when 'operator' then 2 else 3 end
  limit 1;
$$;
grant execute on function public.get_my_role() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := new.raw_app_meta_data->>'app_role';
  if v_role in ('admin', 'operator', 'guardian') then
    insert into public.user_roles (user_id, role)
    values (new.id, v_role::public.user_role)
    on conflict do nothing;
    return new;
  end if;

  v_role := new.raw_user_meta_data->>'app_role';
  if v_role = 'guardian' then
    insert into public.user_roles (user_id, role)
    values (new.id, v_role::public.user_role)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_user_role on auth.users;
create trigger trg_assign_user_role
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students (id) on delete cascade,
  balance numeric(12,2) not null default 0,
  credit_limit numeric(12,2) not null default 0,
  model public.pricing_model not null,
  allow_negative_once_used boolean not null default false,
  blocked boolean not null default false,
  blocked_reason text,
  alert_baseline numeric(12,2),
  last_alert_level numeric(4,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(10,2) not null check (price > 0),
  category text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete restrict,
  total numeric(12,2) not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists orders_student_idx on public.orders (student_id);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(10,2) not null
);

create table if not exists public.ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  kind public.ledger_kind not null,
  amount numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  description text,
  related_order_id uuid references public.orders (id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists ledger_wallet_idx on public.ledger (wallet_id);

create table if not exists public.pix_charges (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references public.guardians (id) on delete restrict,
  student_id uuid references public.students (id) on delete set null,
  ledger_id uuid references public.ledger (id) on delete set null,
  txid text not null unique,
  amount numeric(12,2) not null,
  status public.pix_status not null default 'created',
  br_code text,
  description text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  guardian_id uuid not null references public.guardians (id) on delete cascade,
  type public.alert_type not null,
  level numeric(4,2) not null,
  message text not null,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);
create index if not exists alerts_student_idx on public.alerts (student_id);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references public.guardians (id),
  student_id uuid references public.students (id),
  kind text not null,
  to_phone text not null,
  payload jsonb not null,
  status text not null default 'pending',
  attempt_count int not null default 0,
  last_error text,
  created_at timestamptz default now(),
  sent_at timestamptz
);
create index if not exists notification_outbox_status_created_idx on public.notification_outbox (status, created_at);

-- Policies and RLS
alter table public.user_roles enable row level security;
alter table public.guardians enable row level security;
alter table public.students enable row level security;
alter table public.wallets enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.ledger enable row level security;
alter table public.pix_charges enable row level security;
alter table public.alerts enable row level security;
alter table public.terms_acceptance enable row level security;
alter table public.notification_outbox enable row level security;

-- Remover permissão de insert direto pelo operador
drop policy if exists operator_orders_insert on public.orders;
drop policy if exists operator_order_items_insert on public.order_items;
drop policy if exists operator_ledger_insert on public.ledger;

-- Admin com acesso total
create policy admin_all_guardians on public.guardians for all using (has_role('admin')) with check (has_role('admin'));
create policy admin_all_students on public.students for all using (has_role('admin')) with check (has_role('admin'));
create policy admin_all_wallets on public.wallets for all using (has_role('admin')) with check (has_role('admin'));
create policy admin_all_products on public.products for all using (has_role('admin')) with check (has_role('admin'));
create policy admin_all_orders on public.orders for all using (has_role('admin')) with check (has_role('admin'));
create policy admin_all_order_items on public.order_items for all using (has_role('admin')) with check (has_role('admin'));
create policy admin_all_ledger on public.ledger for all using (has_role('admin')) with check (has_role('admin'));
create policy admin_all_pix on public.pix_charges for all using (has_role('admin')) with check (has_role('admin'));
create policy admin_all_alerts on public.alerts for all using (has_role('admin')) with check (has_role('admin'));
create policy admin_all_terms on public.terms_acceptance for all using (has_role('admin')) with check (has_role('admin'));
drop policy if exists admin_all_user_roles on public.user_roles;
create policy user_roles_self_select on public.user_roles for select using (user_id = auth.uid());
create policy admin_all_notification_outbox on public.notification_outbox for all using (has_role('admin')) with check (has_role('admin'));

-- Operador: apenas leitura de dados operacionais, sem CPF/endereco (consumir via view)
create policy operator_students_read on public.students for select using (has_role('operator'));
create policy operator_wallets_read on public.wallets for select using (has_role('operator'));
create policy operator_products_read on public.products for select using (has_role('operator'));

-- Responsavel: apenas seus dados
drop policy if exists guardian_self on public.guardians;
create policy guardian_self on public.guardians for select using (has_role('guardian') and user_id = auth.uid());
drop policy if exists guardian_self_insert on public.guardians;
create policy guardian_self_insert on public.guardians for insert with check (has_role('guardian') and user_id = auth.uid());
drop policy if exists guardian_self_update on public.guardians;
create policy guardian_self_update on public.guardians for update
using (has_role('guardian') and user_id = auth.uid())
with check (has_role('guardian') and user_id = auth.uid());

-- Responsavel: alunos e carteiras vinculados
create policy guardian_students_select on public.students for select using (
  has_role('guardian')
  and guardian_id in (select id from public.guardians where user_id = auth.uid())
);
create policy guardian_students_insert on public.students for insert with check (
  has_role('guardian')
  and guardian_id in (select id from public.guardians where user_id = auth.uid())
  and status = 'active'
  and pricing_model = 'prepaid'
);
create policy guardian_wallets_select on public.wallets for select using (
  has_role('guardian')
  and student_id in (
    select id from public.students where guardian_id in (select id from public.guardians where user_id = auth.uid())
  )
);
create policy guardian_orders_select on public.orders for select using (
  has_role('guardian')
  and student_id in (
    select id from public.students where guardian_id in (select id from public.guardians where user_id = auth.uid())
  )
);
create policy guardian_order_items_select on public.order_items for select using (
  has_role('guardian') and order_id in (
    select o.id from public.orders o
    join public.students s on s.id = o.student_id
    where s.guardian_id in (select id from public.guardians where user_id = auth.uid())
  )
);
create policy guardian_alerts_select on public.alerts for select using (
  has_role('guardian')
  and guardian_id in (select id from public.guardians where user_id = auth.uid())
);

-- View sem CPF para uso pelo operador
create or replace view public.guardians_public as
select id, full_name, phone, left(cpf, 3) || '***' || right(cpf, 2) as masked_cpf
from public.guardians;
grant select on public.guardians_public to authenticated;

-- Funcao para processar compra aplicando regra de saldo negativo unico
create or replace function public.process_purchase(p_student_id uuid, p_items jsonb)
returns uuid
language plpgsql
security definer
as $$
declare
  v_wallet public.wallets%rowtype;
  v_student public.students%rowtype;
  v_total numeric(12,2);
  v_order uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_available numeric(12,2);
  v_alert_base numeric(12,2);
  v_prev_alert numeric(4,2);
begin
  if not (has_role('admin') or has_role('operator')) then
    raise exception using message = 'Nao autorizado', errcode = 'P0001';
  end if;

  select * into v_student from public.students where id = p_student_id for update;
  if not found then raise exception using message = 'Aluno nao encontrado', errcode = 'P0002'; end if;
  if v_student.status <> 'active' then raise exception using message = 'Aluno inativo ou bloqueado', errcode = 'P0003'; end if;

  select * into v_wallet from public.wallets where student_id = p_student_id for update;
  if v_wallet.blocked then raise exception using message = 'Aluno bloqueado', errcode = 'P0004'; end if;

  select sum((item->>'quantity')::int * (item->>'unit_price')::numeric(10,2)) into v_total
  from jsonb_array_elements(p_items) item;
  if v_total is null or v_total <= 0 then
    raise exception using message = 'Itens invalidos', errcode = 'P0005';
  end if;

  if v_wallet.model = 'prepaid' then
    if v_wallet.balance >= v_total then
      v_wallet.balance := v_wallet.balance - v_total;
    elsif not v_wallet.allow_negative_once_used then
      v_wallet.balance := v_wallet.balance - v_total;
      v_wallet.allow_negative_once_used := true;
      v_wallet.blocked := true;
      v_wallet.blocked_reason := 'Saldo negativo. Bloqueio automatico.';
      if not exists (select 1 from public.alerts a where a.student_id = p_student_id and a.type = 'negative') then
        insert into public.alerts (student_id, guardian_id, type, level, message)
        values (p_student_id, v_student.guardian_id, 'negative', -1, 'Compra liberada com saldo negativo. Aluno bloqueado.');
      end if;
    else
      raise exception using message = 'Saldo insuficiente. Excecao ja utilizada.', errcode = 'P0006';
    end if;
  else
    if v_wallet.balance + v_total > v_wallet.credit_limit then
      v_wallet.blocked := true;
      v_wallet.blocked_reason := 'Limite excedido';
      raise exception using message = 'Limite excedido', errcode = 'P0007';
    else
      v_wallet.balance := v_wallet.balance + v_total;
    end if;
  end if;

  v_prev_alert := v_wallet.last_alert_level;
  v_alert_base := coalesce(v_wallet.alert_baseline, v_wallet.credit_limit, 0);

  update public.wallets
  set balance = v_wallet.balance,
      allow_negative_once_used = v_wallet.allow_negative_once_used,
      blocked = v_wallet.blocked,
      blocked_reason = v_wallet.blocked_reason,
      updated_at = v_now
  where id = v_wallet.id;

  insert into public.orders(id, student_id, total, created_by, created_at)
  values (v_order, p_student_id, v_total, auth.uid(), v_now);

  insert into public.order_items(order_id, product_id, quantity, unit_price)
  select v_order,
         (item->>'product_id')::uuid,
         (item->>'quantity')::int,
         (item->>'unit_price')::numeric(10,2)
  from jsonb_array_elements(p_items) item;

  insert into public.ledger(wallet_id, kind, amount, balance_after, description, related_order_id, created_by, created_at)
  values (v_wallet.id, 'purchase', case when v_wallet.model = 'prepaid' then -v_total else v_total end, v_wallet.balance,
          'Compra PDV', v_order, auth.uid(), v_now);

  -- Alertas 30/15/0
  v_available := case when v_wallet.model = 'prepaid' then v_wallet.balance else greatest(v_wallet.credit_limit - v_wallet.balance, 0) end;
  if v_alert_base > 0 then
    if v_available <= v_alert_base * 0.3 and (v_prev_alert is null or v_prev_alert > 0.3) then
      insert into public.alerts (student_id, guardian_id, type, level, message)
      values (p_student_id, v_student.guardian_id, case when v_wallet.model = 'prepaid' then 'balance' else 'limit' end, 0.3,
              'Aviso automatico: atingiu 30%');
      v_prev_alert := 0.3;
    end if;
    if v_available <= v_alert_base * 0.15 and (v_prev_alert is null or v_prev_alert > 0.15) then
      insert into public.alerts (student_id, guardian_id, type, level, message)
      values (p_student_id, v_student.guardian_id, case when v_wallet.model = 'prepaid' then 'balance' else 'limit' end, 0.15,
              'Aviso automatico: atingiu 15%');
      v_prev_alert := 0.15;
    end if;
  end if;
  if v_available <= 0 and (v_prev_alert is null or v_prev_alert > 0) then
    insert into public.alerts (student_id, guardian_id, type, level, message)
    values (p_student_id, v_student.guardian_id, case when v_wallet.model = 'prepaid' then 'balance' else 'limit' end, 0,
            'Aviso automatico: saldo/limite zerado');
    v_prev_alert := 0;
  end if;

  update public.wallets
  set last_alert_level = v_prev_alert,
      updated_at = v_now
  where id = v_wallet.id;

  return v_order;
end;
$$;
grant execute on function public.process_purchase(uuid, jsonb) to authenticated;

-- Trigger para garantir carteira para cada aluno
create or replace function public.create_wallet_for_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wallets (student_id, balance, credit_limit, model, allow_negative_once_used, blocked, alert_baseline)
  values (new.id, 0, 0, new.pricing_model, false, false, null)
  on conflict (student_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_create_wallet on public.students;
create trigger trg_create_wallet
after insert on public.students
for each row execute procedure public.create_wallet_for_student();

-- Helper para normalizar telefone (Brasil com DDI 55)
create or replace function public.normalize_phone(p_input text)
returns text
language plpgsql
as $$
declare
  v_digits text;
begin
  if p_input is null then
    return null;
  end if;
  v_digits := regexp_replace(p_input, '[^0-9]', '', 'g');
  if v_digits like '55%' then
    return v_digits;
  end if;
  if length(v_digits) >= 10 then
    return '55' || v_digits;
  end if;
  return v_digits;
end;
$$;

-- Scheduled summary (chamado via Netlify cron)
create or replace view public.weekly_consumption as
select s.id as student_id,
       s.guardian_id,
       s.full_name,
       sum(o.total) as total_spent,
       min(o.created_at) as first_purchase,
       max(o.created_at) as last_purchase
from public.orders o
join public.students s on s.id = o.student_id
where o.created_at >= now() - interval '7 days'
group by 1,2,3;
alter view public.weekly_consumption set (security_invoker = true);
grant select on public.weekly_consumption to authenticated;

-- Vincula responsavel existente ao usuario autenticado via CPF
create or replace function public.claim_guardian_by_cpf(p_cpf text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed_id uuid;
  v_meta_cpf text;
  v_clean_cpf text;
begin
  if auth.uid() is null then
    raise exception using message = 'Nao autenticado', errcode = 'P0001';
  end if;
  if not has_role('guardian') then
    raise exception using message = 'Nao autorizado', errcode = 'P0004';
  end if;
  v_clean_cpf := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  if v_clean_cpf = '' then
    raise exception using message = 'CPF obrigatorio', errcode = 'P0002';
  end if;
  v_meta_cpf := (auth.jwt() -> 'user_metadata' ->> 'cpf');
  if v_meta_cpf is not null and v_meta_cpf <> '' then
    if regexp_replace(v_meta_cpf, '\D', '', 'g') <> v_clean_cpf then
      raise exception using message = 'CPF divergente', errcode = 'P0003';
    end if;
  end if;

  update public.guardians
  set user_id = auth.uid(),
      updated_at = now()
  where user_id is null
    and cpf = v_clean_cpf
  returning id into v_claimed_id;

  return v_claimed_id;
end;
$$;
grant execute on function public.claim_guardian_by_cpf(text) to authenticated;

-- Cria ou atualiza cobranca Pix e aplica credito quando pago
create or replace function public.create_topup_charge(
  p_guardian_id uuid,
  p_student_id uuid default null,
  p_amount numeric,
  p_status public.pix_status default 'created'::public.pix_status,
  p_br_code text default null,
  p_txid text default null,
  p_description text default null,
  p_expires_at timestamptz default null
)
returns public.pix_charges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txid text;
  v_prev_status public.pix_status;
  v_charge public.pix_charges%rowtype;
  v_wallet public.wallets%rowtype;
  v_new_balance numeric(12,2);
  v_ledger_id uuid;
begin
  if p_guardian_id is null then
    raise exception using message = 'guardian_id obrigatorio', errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception using message = 'valor invalido', errcode = 'P0002';
  end if;
  if auth.uid() is not null then
    if has_role('guardian') then
      if not exists (select 1 from public.guardians where id = p_guardian_id and user_id = auth.uid()) then
        raise exception using message = 'Nao autorizado', errcode = 'P0003';
      end if;
    elsif not has_role('admin') then
      raise exception using message = 'Nao autorizado', errcode = 'P0003';
    end if;
  end if;

  v_txid := coalesce(p_txid, gen_random_uuid()::text);

  select status into v_prev_status
  from public.pix_charges
  where txid = v_txid;

  insert into public.pix_charges (guardian_id, student_id, txid, amount, status, br_code, description, expires_at)
  values (p_guardian_id, p_student_id, v_txid, p_amount, coalesce(p_status, 'created'::public.pix_status), p_br_code, p_description, p_expires_at)
  on conflict (txid) do update
    set status = excluded.status,
        amount = excluded.amount,
        br_code = coalesce(excluded.br_code, public.pix_charges.br_code),
        description = coalesce(excluded.description, public.pix_charges.description),
        expires_at = coalesce(excluded.expires_at, public.pix_charges.expires_at)
  returning * into v_charge;

  if v_charge.status = 'paid' and v_charge.student_id is not null and v_prev_status is distinct from 'paid' then
    select * into v_wallet from public.wallets where student_id = v_charge.student_id for update;
    if found then
      if v_wallet.model = 'prepaid' then
        v_new_balance := v_wallet.balance + p_amount;
        insert into public.ledger (wallet_id, kind, amount, balance_after, description, created_by)
        values (v_wallet.id, 'payment', p_amount, v_new_balance, coalesce(p_description, 'Credito Pix'), auth.uid())
        returning id into v_ledger_id;
      else
        v_new_balance := greatest(v_wallet.balance - p_amount, 0);
        insert into public.ledger (wallet_id, kind, amount, balance_after, description, created_by)
        values (v_wallet.id, 'payment', -p_amount, v_new_balance, coalesce(p_description, 'Pagamento Pix'), auth.uid())
        returning id into v_ledger_id;
      end if;

      update public.wallets
      set balance = v_new_balance,
          blocked = case
            when v_wallet.model = 'prepaid' then v_new_balance < 0
            else v_new_balance > v_wallet.credit_limit
          end,
          blocked_reason = case
            when v_wallet.model = 'prepaid' and v_new_balance < 0 then 'Saldo negativo'
            when v_wallet.model = 'postpaid' and v_new_balance > v_wallet.credit_limit then 'Limite excedido'
            else null
          end,
          updated_at = now()
      where id = v_wallet.id;

      if v_ledger_id is not null then
        update public.pix_charges
        set ledger_id = v_ledger_id
        where id = v_charge.id;
      end if;
    end if;
  end if;

  return v_charge;
end;
$$;
grant execute on function public.create_topup_charge(
  uuid, uuid, numeric, public.pix_status, text, text, text, timestamptz
) to authenticated;

-- Visao de vendas do dia (admin)
create or replace view public.admin_sales_today as
select sum(o.total) as total
from public.orders o
where o.created_at >= date_trunc('day', now());
alter view public.admin_sales_today set (security_invoker = true);
grant select on public.admin_sales_today to authenticated;

-- Visao de janela de 20min (admin)
create or replace view public.admin_sales_today_20min as
select date_trunc('minute', o.created_at)
         - make_interval(mins => (extract(minute from o.created_at)::int % 20)) as window_start,
       (date_trunc('minute', o.created_at)
         - make_interval(mins => (extract(minute from o.created_at)::int % 20))) + interval '20 minutes' as window_end,
       sum(o.total) as total
from public.orders o
where o.created_at >= date_trunc('day', now())
group by 1,2;
alter view public.admin_sales_today_20min set (security_invoker = true);
grant select on public.admin_sales_today_20min to authenticated;

-- Melhor cliente do dia (admin)
create or replace view public.admin_best_client_today as
select s.id as student_id,
       s.full_name,
       s.grade,
       s.period,
       sum(o.total) as total_spent
from public.orders o
join public.students s on s.id = o.student_id
where o.created_at >= date_trunc('day', now())
group by 1,2,3,4;
alter view public.admin_best_client_today set (security_invoker = true);
grant select on public.admin_best_client_today to authenticated;
