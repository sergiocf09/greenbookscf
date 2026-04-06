
-- Crear tablas primero sin políticas
create table public.money_rankings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.money_ranking_members (
  id uuid primary key default gen_random_uuid(),
  ranking_id uuid not null references public.money_rankings(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid not null references public.profiles(id),
  joined_at timestamptz not null default now(),
  unique(ranking_id, profile_id)
);

-- Habilitar RLS
alter table public.money_rankings enable row level security;
alter table public.money_ranking_members enable row level security;

-- Políticas money_rankings
create policy "Ver rankings propios o donde soy miembro"
  on public.money_rankings for select
  using (
    creator_id = get_my_profile_id()
    or id in (
      select ranking_id from public.money_ranking_members
      where profile_id = get_my_profile_id()
    )
  );

create policy "Crear ranking autenticado"
  on public.money_rankings for insert
  with check (creator_id = get_my_profile_id());

create policy "Actualizar ranking propio"
  on public.money_rankings for update
  using (creator_id = get_my_profile_id());

create policy "Eliminar ranking propio"
  on public.money_rankings for delete
  using (creator_id = get_my_profile_id());

-- Políticas money_ranking_members
create policy "Ver miembros de mis rankings"
  on public.money_ranking_members for select
  using (
    ranking_id in (
      select id from public.money_rankings
      where creator_id = get_my_profile_id()
    )
    or ranking_id in (
      select ranking_id from public.money_ranking_members
      where profile_id = get_my_profile_id()
    )
  );

create policy "Creador agrega miembros"
  on public.money_ranking_members for insert
  with check (
    ranking_id in (
      select id from public.money_rankings
      where creator_id = get_my_profile_id()
    )
  );

create policy "Salir o ser removido"
  on public.money_ranking_members for delete
  using (
    profile_id = get_my_profile_id()
    or ranking_id in (
      select id from public.money_rankings
      where creator_id = get_my_profile_id()
    )
  );

-- Función get_money_ranking_balances
create or replace function public.get_money_ranking_balances(
  p_ranking_id uuid,
  p_period text default 'all'
)
returns table(
  profile_id uuid,
  display_name text,
  initials text,
  avatar_color text,
  net_balance numeric,
  rounds_played bigint
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_date_filter timestamptz;
begin
  if p_period = 'year' then
    v_date_filter := date_trunc('year', now());
  elsif p_period = '90d' then
    v_date_filter := now() - interval '90 days';
  else
    v_date_filter := '1970-01-01'::timestamptz;
  end if;

  return query
  with members as (
    select mrm.profile_id
    from public.money_ranking_members mrm
    where mrm.ranking_id = p_ranking_id
  ),
  qualifying_rounds as (
    select lt.round_id
    from public.ledger_transactions lt
    where lt.from_profile_id in (select profile_id from members)
      and lt.to_profile_id in (select profile_id from members)
      and lt.created_at >= v_date_filter
    group by lt.round_id
    having count(distinct lt.from_profile_id) + count(distinct lt.to_profile_id) >= 2
  ),
  valid_transactions as (
    select lt.from_profile_id, lt.to_profile_id, lt.amount, lt.round_id
    from public.ledger_transactions lt
    where lt.round_id in (select round_id from qualifying_rounds)
      and lt.from_profile_id in (select profile_id from members)
      and lt.to_profile_id in (select profile_id from members)
  ),
  member_balances as (
    select
      t.profile_id,
      coalesce(sum(t.cobrado), 0) - coalesce(sum(t.pagado), 0) as net_balance,
      count(distinct t.round_id) as rounds_played
    from (
      select to_profile_id as profile_id, amount as cobrado, 0::numeric as pagado, round_id
      from valid_transactions
      union all
      select from_profile_id as profile_id, 0::numeric as cobrado, amount as pagado, round_id
      from valid_transactions
    ) t
    group by t.profile_id
  )
  select
    m.profile_id,
    p.display_name,
    p.initials,
    p.avatar_color,
    coalesce(mb.net_balance, 0) as net_balance,
    coalesce(mb.rounds_played, 0) as rounds_played
  from members m
  join public.profiles p on p.id = m.profile_id
  left join member_balances mb on mb.profile_id = m.profile_id
  order by coalesce(mb.net_balance, 0) desc;
end;
$$;

-- Función get_money_ranking_bilateral
create or replace function public.get_money_ranking_bilateral(
  p_ranking_id uuid,
  p_profile_id uuid,
  p_period text default 'all'
)
returns table(
  rival_profile_id uuid,
  display_name text,
  initials text,
  avatar_color text,
  net_balance numeric,
  rounds_together bigint
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_date_filter timestamptz;
begin
  if p_period = 'year' then
    v_date_filter := date_trunc('year', now());
  elsif p_period = '90d' then
    v_date_filter := now() - interval '90 days';
  else
    v_date_filter := '1970-01-01'::timestamptz;
  end if;

  return query
  with members as (
    select mrm.profile_id
    from public.money_ranking_members mrm
    where mrm.ranking_id = p_ranking_id
  ),
  qualifying_rounds as (
    select lt.round_id
    from public.ledger_transactions lt
    where lt.from_profile_id in (select profile_id from members)
      and lt.to_profile_id in (select profile_id from members)
      and lt.created_at >= v_date_filter
    group by lt.round_id
    having count(distinct lt.from_profile_id) + count(distinct lt.to_profile_id) >= 2
  ),
  bilateral as (
    select
      case when lt.from_profile_id = p_profile_id then lt.to_profile_id else lt.from_profile_id end as rival_id,
      case when lt.to_profile_id = p_profile_id then lt.amount else -lt.amount end as net,
      lt.round_id
    from public.ledger_transactions lt
    where lt.round_id in (select round_id from qualifying_rounds)
      and (lt.from_profile_id = p_profile_id or lt.to_profile_id = p_profile_id)
      and lt.from_profile_id in (select profile_id from members)
      and lt.to_profile_id in (select profile_id from members)
  )
  select
    b.rival_id as rival_profile_id,
    p.display_name,
    p.initials,
    p.avatar_color,
    sum(b.net) as net_balance,
    count(distinct b.round_id) as rounds_together
  from bilateral b
  join public.profiles p on p.id = b.rival_id
  group by b.rival_id, p.display_name, p.initials, p.avatar_color
  order by sum(b.net) desc;
end;
$$;
