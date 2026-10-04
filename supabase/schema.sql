-- =====================================================================
-- 땡큐 베리 머치! — Supabase 스키마
-- Supabase SQL Editor에 전체를 붙여넣고 실행하거나 `supabase db push`로 적용하세요.
-- 여러 번 실행해도 안전하도록 if not exists / or replace 를 사용합니다.
-- =====================================================================

-- ---------- 확장 ----------
-- pg_cron은 Supabase 대시보드 > Database > Extensions 에서 켤 수도 있습니다.
do $$ begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron 확장을 만들지 못했습니다 (%). 대시보드에서 직접 켜주세요.', sqlerrm;
end $$;

-- ---------- 설정 ----------
create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);
insert into public.app_settings(key, value) values
  ('award_period', 'week'),   -- 'week' 또는 'month' (js/config.js 의 AWARD_PERIOD 와 맞추세요)
  ('award_top_n', '3')        -- 시상 인원 (js/config.js 의 AWARD_TOP_N 과 맞추세요)
on conflict (key) do nothing;

create table if not exists public.app_secrets (
  key   text primary key,
  value text not null
);
insert into public.app_secrets(key, value)
  values ('claim_salt', md5(random()::text || clock_timestamp()::text))
on conflict (key) do nothing;
insert into public.app_secrets(key, value)
  values ('pin_salt', md5(random()::text || clock_timestamp()::text))
on conflict (key) do nothing;

-- ---------- 테이블 ----------
create table if not exists public.nicknames (
  nickname         text primary key check (char_length(nickname) between 2 and 10),
  owner_token_hash text,
  created_at       timestamptz not null default now()
);
-- 닉네임 + 숫자 4자리 비밀번호 (본인 확인용)
alter table public.nicknames add column if not exists pin_hash        text;
alter table public.nicknames add column if not exists failed_attempts integer not null default 0;
alter table public.nicknames add column if not exists locked_until    timestamptz;

create table if not exists public.gratitudes (
  id               uuid primary key default gen_random_uuid(),
  nickname         text not null check (char_length(nickname) between 2 and 10),
  device_id        text not null,
  content          text not null check (char_length(content) between 1 and 300),
  emotion          text not null check (emotion in ('😊','🥰','😌','🙏','🥹','💪')),
  tags             text[] not null default '{}' check (cardinality(tags) between 1 and 4),
  age_group        text check (age_group is null or age_group in ('초등','중등','고등','청년','성인')),
  verse_id         text,
  verse_reason     text,
  needs_review     boolean not null default false,
  owner_token_hash text not null,
  strawberry_count integer not null default 0,
  report_count     integer not null default 0,
  is_hidden        boolean not null default false,
  created_at       timestamptz not null default now()
);
create index if not exists gratitudes_created_idx  on public.gratitudes (created_at desc);
create index if not exists gratitudes_nickname_idx on public.gratitudes (nickname);
create index if not exists gratitudes_device_idx   on public.gratitudes (device_id, created_at desc);
create index if not exists gratitudes_tags_idx     on public.gratitudes using gin (tags);

create table if not exists public.strawberries (
  gratitude_id uuid not null references public.gratitudes(id) on delete cascade,
  device_id    text not null,
  nickname     text not null,                      -- 딸기를 누른 시점의 닉네임
  created_at   timestamptz not null default now(),
  primary key (gratitude_id, device_id)
);
create index if not exists strawberries_created_idx on public.strawberries (created_at desc);
create index if not exists strawberries_device_idx  on public.strawberries (device_id);

-- 딸기 클릭 속도 제한용 로그 (취소 포함 모든 토글 기록)
create table if not exists public.strawberry_events (
  id         bigserial primary key,
  device_id  text not null,
  created_at timestamptz not null default now()
);
create index if not exists strawberry_events_idx on public.strawberry_events (device_id, created_at desc);

create table if not exists public.reports (
  gratitude_id uuid not null references public.gratitudes(id) on delete cascade,
  device_id    text not null,
  created_at   timestamptz not null default now(),
  primary key (gratitude_id, device_id)
);

create table if not exists public.awards (
  id               uuid primary key default gen_random_uuid(),
  period_type      text not null check (period_type in ('week','month')),
  period_start     timestamptz not null,
  period_end       timestamptz not null,
  rank             integer not null,
  nickname         text not null,
  strawberry_total integer not null,
  gratitude_count  integer not null default 0,
  claim_code_hash  text not null,
  delivered        boolean not null default false,
  delivered_at     timestamptz,
  created_at       timestamptz not null default now(),
  unique (period_type, period_start, nickname)
);

create table if not exists public.admins (
  email      text primary key,
  created_at timestamptz not null default now()
);

-- ---------- 공개용 뷰 (device_id, owner_token_hash, needs_review 제외) ----------
create or replace view public.gratitudes_public
with (security_invoker = true) as
  select id, nickname, content, emotion, tags, age_group, verse_id, verse_reason,
         strawberry_count, report_count, is_hidden, created_at
  from public.gratitudes
  where is_hidden = false;

-- ---------- 권한: 기본 권한 모두 회수 후 꼭 필요한 것만 부여 ----------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select (id, nickname, content, emotion, tags, age_group, verse_id, verse_reason,
              strawberry_count, report_count, is_hidden, created_at)
  on public.gratitudes to anon, authenticated;
-- 글 등록은 닉네임 비밀번호를 확인하는 create_gratitude() RPC 로만 가능 (직접 insert 권한 없음)
grant select on public.gratitudes_public to anon, authenticated;

-- ---------- RLS ----------
alter table public.app_settings      enable row level security;
alter table public.app_secrets       enable row level security;
alter table public.nicknames         enable row level security;
alter table public.gratitudes        enable row level security;
alter table public.strawberries      enable row level security;
alter table public.strawberry_events enable row level security;
alter table public.reports           enable row level security;
alter table public.awards            enable row level security;
alter table public.admins            enable row level security;

drop policy if exists gratitudes_public_select on public.gratitudes;
create policy gratitudes_public_select on public.gratitudes
  for select to anon, authenticated using (is_hidden = false);

drop policy if exists gratitudes_public_insert on public.gratitudes;
create policy gratitudes_public_insert on public.gratitudes
  for insert to anon, authenticated
  with check (is_hidden = false and strawberry_count = 0 and report_count = 0);
-- 그 외 테이블은 정책이 없으므로 anon/authenticated 는 직접 접근 불가 (RPC로만 접근)

-- ---------- 공통 헬퍼 ----------
create or replace function public.hash_token(p_token text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

create or replace function public.kst_now()
returns timestamp language sql stable as $$
  select (now() at time zone 'Asia/Seoul');
$$;

create or replace function public.get_setting(p_key text, p_default text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.app_settings where key = p_key), p_default);
$$;

-- 현재 시상 기간의 시작/끝 (한국 시간 기준, 끝은 exclusive)
create or replace function public.period_bounds(p_type text default null, p_ref timestamptz default now())
returns table (period_type text, start_ts timestamptz, end_ts timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_type  text := coalesce(p_type, public.get_setting('award_period', 'week'));
  v_local timestamp := (p_ref at time zone 'Asia/Seoul');
  v_start timestamp;
  v_end   timestamp;
begin
  if v_type = 'month' then
    v_start := date_trunc('month', v_local);
    v_end   := v_start + interval '1 month';
  else
    v_type  := 'week';
    v_start := date_trunc('week', v_local);   -- ISO 주: 월요일 0시
    v_end   := v_start + interval '1 week';
  end if;
  return query select v_type, (v_start at time zone 'Asia/Seoul'), (v_end at time zone 'Asia/Seoul');
end $$;

-- 글 등록 전 검사: 같은 기기 1분 제한, 카운터 초기화
create or replace function public.gratitudes_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.gratitudes
    where device_id = new.device_id and created_at > now() - interval '60 seconds'
  ) then
    raise exception 'RATE_LIMIT' using hint = '1분 뒤에 다시 등록할 수 있어요';
  end if;
  new.strawberry_count := 0;
  new.report_count := 0;
  new.is_hidden := false;
  new.created_at := now();
  new.content := btrim(new.content);
  return new;
end $$;
drop trigger if exists gratitudes_before_insert_trg on public.gratitudes;
create trigger gratitudes_before_insert_trg
  before insert on public.gratitudes
  for each row execute function public.gratitudes_before_insert();

-- ---------- 일반 사용자용 RPC ----------
create or replace function public.nickname_exists(p_nickname text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.nicknames where nickname = btrim(p_nickname));
$$;

create or replace function public.claim_nickname(p_nickname text, p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v_nick text := btrim(p_nickname);
begin
  if char_length(v_nick) < 2 or char_length(v_nick) > 10 then
    return json_build_object('ok', false, 'error', 'INVALID');
  end if;
  if exists (select 1 from public.nicknames where nickname = v_nick) then
    return json_build_object('ok', false, 'error', 'TAKEN');
  end if;
  insert into public.nicknames(nickname, owner_token_hash) values (v_nick, public.hash_token(p_token));
  return json_build_object('ok', true);
exception when unique_violation then
  return json_build_object('ok', false, 'error', 'TAKEN');
end $$;

create or replace function public.change_nickname(p_old text, p_new text, p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v_new text := btrim(p_new);
begin
  if char_length(v_new) < 2 or char_length(v_new) > 10 then
    return json_build_object('ok', false, 'error', 'INVALID');
  end if;
  if not exists (
    select 1 from public.nicknames
    where nickname = btrim(p_old) and owner_token_hash = public.hash_token(p_token)
  ) then
    return json_build_object('ok', false, 'error', 'NOT_OWNER');
  end if;
  if exists (select 1 from public.nicknames where nickname = v_new) then
    return json_build_object('ok', false, 'error', 'TAKEN');
  end if;
  -- 이전 닉네임은 다른 사람이 가져가지 못하도록 그대로 남겨둠
  insert into public.nicknames(nickname, owner_token_hash) values (v_new, public.hash_token(p_token));
  return json_build_object('ok', true);
exception when unique_violation then
  return json_build_object('ok', false, 'error', 'TAKEN');
end $$;

-- ---------- 닉네임 + 비밀번호 ----------
create or replace function public.pin_hash_for(p_nickname text, p_pin text)
returns text language sql stable security definer set search_path = public as $$
  select public.hash_token((select value from public.app_secrets where key = 'pin_salt') || ':' || btrim(p_nickname) || ':' || coalesce(p_pin, ''));
$$;

-- 비밀번호 확인 (5번 틀리면 10분 잠금). 예외를 던지지 않아야 실패 횟수가 저장됨
-- 결과: 'OK' | 'NO_NICK' | 'NO_PIN' | 'WRONG_PIN' | 'LOCKED'
create or replace function public.check_nickname_pin(p_nickname text, p_pin text)
returns text language plpgsql security definer set search_path = public as $$
declare n record;
begin
  select * into n from public.nicknames where nickname = btrim(p_nickname) for update;
  if not found then return 'NO_NICK'; end if;
  if n.pin_hash is null then return 'NO_PIN'; end if;
  if n.locked_until is not null and n.locked_until > now() then return 'LOCKED'; end if;
  if n.pin_hash = public.pin_hash_for(n.nickname, p_pin) then
    if n.failed_attempts <> 0 or n.locked_until is not null then
      update public.nicknames set failed_attempts = 0, locked_until = null where nickname = n.nickname;
    end if;
    return 'OK';
  end if;
  update public.nicknames
     set failed_attempts = case when n.failed_attempts + 1 >= 5 then 0 else n.failed_attempts + 1 end,
         locked_until    = case when n.failed_attempts + 1 >= 5 then now() + interval '10 minutes' else null end
   where nickname = n.nickname;
  return case when n.failed_attempts + 1 >= 5 then 'LOCKED' else 'WRONG_PIN' end;
end $$;

-- 입장: 없는 닉네임이면 새로 만들고, 있으면 비밀번호 확인
-- 비밀번호가 없던 예전 닉네임은 처음 만든 기기(p_token 일치)에서만 비밀번호를 정할 수 있음
create or replace function public.enter_nickname(p_nickname text, p_pin text, p_token text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_nick text := btrim(p_nickname);
  v_res  text;
begin
  if char_length(v_nick) < 2 or char_length(v_nick) > 10 then
    return json_build_object('ok', false, 'error', 'INVALID');
  end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    return json_build_object('ok', false, 'error', 'BAD_PIN');
  end if;
  v_res := public.check_nickname_pin(v_nick, p_pin);
  if v_res = 'OK' then return json_build_object('ok', true, 'status', 'login'); end if;
  if v_res = 'NO_NICK' then
    insert into public.nicknames(nickname, owner_token_hash, pin_hash)
      values (v_nick, public.hash_token(p_token), public.pin_hash_for(v_nick, p_pin));
    return json_build_object('ok', true, 'status', 'created');
  end if;
  if v_res = 'NO_PIN' then
    update public.nicknames set pin_hash = public.pin_hash_for(v_nick, p_pin)
     where nickname = v_nick and pin_hash is null
       and p_token is not null and owner_token_hash = public.hash_token(p_token);
    if found then return json_build_object('ok', true, 'status', 'pin_set'); end if;
    return json_build_object('ok', false, 'error', 'TAKEN');
  end if;
  return json_build_object('ok', false, 'error', v_res);
exception when unique_violation then
  return json_build_object('ok', false, 'error', 'TAKEN');
end $$;

-- 글 등록 (비밀번호 확인 후)
create or replace function public.create_gratitude(
  p_nickname text, p_pin text, p_device_id text, p_content text, p_emotion text, p_tags text[],
  p_age_group text, p_verse_id text, p_verse_reason text, p_needs_review boolean)
returns json language plpgsql security definer set search_path = public as $$
declare v_res text; v_id uuid; v_at timestamptz;
begin
  v_res := public.check_nickname_pin(p_nickname, p_pin);
  if v_res <> 'OK' then return json_build_object('ok', false, 'error', v_res); end if;
  insert into public.gratitudes(nickname, device_id, content, emotion, tags, age_group, verse_id, verse_reason,
                                needs_review, owner_token_hash)
    values (btrim(p_nickname), p_device_id, p_content, p_emotion, p_tags, p_age_group, p_verse_id, p_verse_reason,
            coalesce(p_needs_review, false), public.hash_token(gen_random_uuid()::text))
    returning id, created_at into v_id, v_at;
  return json_build_object('ok', true, 'id', v_id, 'created_at', v_at);
end $$;

-- 내 글 목록 (숨겨진 글은 개수만)
create or replace function public.get_my_gratitudes(p_nickname text, p_pin text)
returns json language plpgsql security definer set search_path = public as $$
declare v_res text;
begin
  v_res := public.check_nickname_pin(p_nickname, p_pin);
  if v_res <> 'OK' then return json_build_object('ok', false, 'error', v_res); end if;
  return json_build_object(
    'ok', true,
    'items', coalesce((
      select json_agg(row_to_json(x) order by x.created_at desc)
      from (select id, nickname, content, emotion, tags, age_group, verse_id, verse_reason,
                   strawberry_count, report_count, is_hidden, created_at
              from public.gratitudes where nickname = btrim(p_nickname) and is_hidden = false) x
    ), '[]'::json),
    'hidden_count', (select count(*) from public.gratitudes where nickname = btrim(p_nickname) and is_hidden = true)
  );
end $$;

-- 이번 기간 받은 딸기 + 직전 기간 수상 정보
create or replace function public.get_my_summary(p_nickname text, p_pin text)
returns json language plpgsql security definer set search_path = public as $$
declare v_res text; v_nick text := btrim(p_nickname); b record; a record; v_total integer;
begin
  v_res := public.check_nickname_pin(v_nick, p_pin);
  if v_res <> 'OK' then return json_build_object('ok', false, 'error', v_res); end if;
  select * into b from public.period_bounds();
  select count(*) into v_total
    from public.strawberries s join public.gratitudes g on g.id = s.gratitude_id
   where g.nickname = v_nick and g.is_hidden = false
     and s.created_at >= b.start_ts and s.created_at < b.end_ts;
  select * into a from public.awards aw
   where aw.period_type = b.period_type and aw.period_end = b.start_ts and aw.nickname = v_nick
   order by aw.rank asc limit 1;
  return json_build_object('ok', true, 'strawberries', coalesce(v_total, 0),
    'award', case when a.id is null then null else json_build_object(
      'id', a.id, 'rank', a.rank, 'period_type', a.period_type,
      'period_start', a.period_start, 'period_end', a.period_end,
      'strawberry_total', a.strawberry_total, 'nickname', a.nickname,
      'claim_code', public.award_claim_code(a.id), 'delivered', a.delivered) end);
end $$;

create or replace function public.delete_my_gratitude(p_gratitude_id uuid, p_nickname text, p_pin text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_deleted integer;
begin
  if public.check_nickname_pin(p_nickname, p_pin) <> 'OK' then return false; end if;
  delete from public.gratitudes where id = p_gratitude_id and nickname = btrim(p_nickname);
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end $$;

create or replace function public.toggle_strawberry(p_gratitude_id uuid, p_device_id text, p_nickname text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_owner text;
  v_owner_nick text;
  v_hidden boolean;
  v_given boolean;
  v_count integer;
begin
  select device_id, is_hidden, nickname into v_owner, v_hidden, v_owner_nick from public.gratitudes where id = p_gratitude_id;
  if v_owner is null then
    raise exception 'NOT_FOUND' using hint = '글을 찾을 수 없어요';
  end if;
  if v_hidden then
    raise exception 'HIDDEN' using hint = '숨겨진 글이에요';
  end if;
  if v_owner = p_device_id or v_owner_nick = btrim(coalesce(p_nickname, '')) then
    raise exception 'OWN_POST' using hint = '내 글에는 딸기를 줄 수 없어요';
  end if;
  if (select count(*) from public.strawberry_events
      where device_id = p_device_id and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'RATE_LIMIT' using hint = '딸기를 너무 빨리 누르고 있어요. 잠시 후 다시 시도해주세요';
  end if;
  insert into public.strawberry_events(device_id) values (p_device_id);

  if exists (select 1 from public.strawberries where gratitude_id = p_gratitude_id and device_id = p_device_id) then
    delete from public.strawberries where gratitude_id = p_gratitude_id and device_id = p_device_id;
    v_given := false;
  else
    insert into public.strawberries(gratitude_id, device_id, nickname)
      values (p_gratitude_id, p_device_id, left(coalesce(p_nickname, '익명'), 10));
    v_given := true;
  end if;

  update public.gratitudes
     set strawberry_count = (select count(*) from public.strawberries where gratitude_id = p_gratitude_id)
   where id = p_gratitude_id
   returning strawberry_count into v_count;

  return json_build_object('count', v_count, 'given', v_given);
end $$;

create or replace function public.get_strawberry_givers(p_gratitude_id uuid)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(nickname order by created_at asc), '[]'::json)
  from (
    select nickname, created_at from public.strawberries
    where gratitude_id = p_gratitude_id
    order by created_at desc limit 50
  ) s;
$$;

-- 이번 기간에 내 글들이 받은 딸기 수 (내 글 소유 토큰 목록으로 확인)
create or replace function public.get_my_strawberries(p_tokens text[])
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  v_hashes text[] := (select array_agg(public.hash_token(t)) from unnest(coalesce(p_tokens, '{}')) t);
  b record;
  v_total integer;
begin
  select * into b from public.period_bounds();
  select count(*) into v_total
  from public.strawberries s
  join public.gratitudes g on g.id = s.gratitude_id
  where g.owner_token_hash = any(v_hashes)
    and g.is_hidden = false
    and s.created_at >= b.start_ts and s.created_at < b.end_ts;
  return coalesce(v_total, 0);
end $$;

-- 수상 확인 코드: award id + 서버 비밀 salt 로 결정되는 6자리 숫자
create or replace function public.award_claim_code(p_award_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_salt text := (select value from public.app_secrets where key = 'claim_salt');
  v_hex  text := encode(sha256(convert_to(p_award_id::text || v_salt, 'UTF8')), 'hex');
  v_num  bigint := abs((('x' || substr(v_hex, 1, 8))::bit(32))::int::bigint);
begin
  return lpad((v_num % 1000000)::text, 6, '0');
end $$;

-- 가장 최근에 마감된 기간의 수상자 본인에게만 코드 반환
create or replace function public.get_my_award(p_tokens text[])
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_hashes text[] := (select array_agg(public.hash_token(t)) from unnest(coalesce(p_tokens, '{}')) t);
  b record;
  a record;
begin
  if v_hashes is null or cardinality(v_hashes) = 0 then return null; end if;
  select * into b from public.period_bounds();
  select * into a
  from public.awards aw
  where aw.period_type = b.period_type
    and aw.period_end = b.start_ts                         -- 직전 기간
    and aw.nickname in (select distinct nickname from public.gratitudes where owner_token_hash = any(v_hashes))
  order by aw.rank asc limit 1;
  if a.id is null then return null; end if;
  return json_build_object(
    'id', a.id, 'rank', a.rank, 'period_type', a.period_type,
    'period_start', a.period_start, 'period_end', a.period_end,
    'strawberry_total', a.strawberry_total, 'nickname', a.nickname,
    'claim_code', public.award_claim_code(a.id), 'delivered', a.delivered
  );
end $$;

create or replace function public.report_gratitude(p_gratitude_id uuid, p_device_id text)
returns json language plpgsql security definer set search_path = public as $$
declare v_count integer; v_hidden boolean;
begin
  if not exists (select 1 from public.gratitudes where id = p_gratitude_id) then
    raise exception 'NOT_FOUND';
  end if;
  insert into public.reports(gratitude_id, device_id) values (p_gratitude_id, p_device_id)
  on conflict do nothing;
  select count(*) into v_count from public.reports where gratitude_id = p_gratitude_id;
  update public.gratitudes
     set report_count = v_count,
         is_hidden = (is_hidden or v_count >= 3)
   where id = p_gratitude_id
   returning is_hidden into v_hidden;
  return json_build_object('report_count', v_count, 'hidden', v_hidden);
end $$;

create or replace function public.delete_gratitude(p_gratitude_id uuid, p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_deleted integer;
begin
  delete from public.gratitudes
   where id = p_gratitude_id and owner_token_hash = public.hash_token(p_token);
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end $$;

-- 통계: p_period = 'today' | 'week' | 'month' | 'all'
create or replace function public.get_stats(p_period text default 'all')
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_local timestamp := public.kst_now();
  v_from  timestamptz;
  v_tags json; v_emotions json; v_today integer; v_total integer; v_period_count integer;
begin
  v_from := case p_period
    when 'today' then (date_trunc('day',   v_local) at time zone 'Asia/Seoul')
    when 'week'  then (date_trunc('week',  v_local) at time zone 'Asia/Seoul')
    when 'month' then (date_trunc('month', v_local) at time zone 'Asia/Seoul')
    else '-infinity'::timestamptz end;

  select coalesce(json_object_agg(tag, cnt), '{}'::json) into v_tags
  from (select t as tag, count(*) as cnt
        from public.gratitudes g, unnest(g.tags) t
        where g.is_hidden = false and g.created_at >= v_from
        group by t order by cnt desc limit 60) x;

  select coalesce(json_object_agg(emotion, cnt), '{}'::json) into v_emotions
  from (select emotion, count(*) as cnt from public.gratitudes
        where is_hidden = false and created_at >= v_from group by emotion) y;

  select count(*) into v_period_count from public.gratitudes where is_hidden = false and created_at >= v_from;
  select count(*) into v_today from public.gratitudes
   where is_hidden = false and created_at >= (date_trunc('day', v_local) at time zone 'Asia/Seoul');
  select count(*) into v_total from public.gratitudes where is_hidden = false;

  return json_build_object('tags', v_tags, 'emotions', v_emotions,
                           'period_count', v_period_count, 'today_count', v_today, 'total_count', v_total);
end $$;

-- ---------- 관리자 ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.assert_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using hint = '관리자만 사용할 수 있어요';
  end if;
end $$;

-- 기간 내 랭킹 계산 (내부용)
create or replace function public.ranking_for(p_start timestamptz, p_end timestamptz, p_limit integer default 20)
returns table (rank bigint, nickname text, strawberry_total bigint, gratitude_count bigint)
language sql stable security definer set search_path = public as $$
  with totals as (
    select g.nickname, count(*) as total
    from public.strawberries s
    join public.gratitudes g on g.id = s.gratitude_id
    where g.is_hidden = false and s.created_at >= p_start and s.created_at < p_end
    group by g.nickname
  ), posts as (
    select nickname, count(*) as cnt from public.gratitudes
    where is_hidden = false and created_at >= p_start and created_at < p_end
    group by nickname
  )
  select rank() over (order by t.total desc, coalesce(p.cnt, 0) desc) as rank,
         t.nickname, t.total, coalesce(p.cnt, 0)
  from totals t left join posts p on p.nickname = t.nickname
  order by 1, 2
  limit p_limit;
$$;

create or replace function public.get_ranking(p_period text default null)
returns json language plpgsql stable security definer set search_path = public as $$
declare b record; v_rows json;
begin
  perform public.assert_admin();
  select * into b from public.period_bounds(p_period);
  select coalesce(json_agg(r), '[]'::json) into v_rows from public.ranking_for(b.start_ts, b.end_ts, 20) r;
  return json_build_object('period_type', b.period_type, 'period_start', b.start_ts, 'period_end', b.end_ts,
                           'top_n', public.get_setting('award_top_n', '3')::int, 'rows', v_rows);
end $$;

create or replace function public.get_award_history()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return (select coalesce(json_agg(a order by a.period_start desc, a.rank asc), '[]'::json)
          from (select id, period_type, period_start, period_end, rank, nickname, strawberry_total,
                       gratitude_count, delivered, delivered_at, created_at
                from public.awards) a);
end $$;

create or replace function public.verify_claim_code(p_award_id uuid, p_code text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return exists (
    select 1 from public.awards
    where id = p_award_id and claim_code_hash = public.hash_token(regexp_replace(coalesce(p_code, ''), '\D', '', 'g'))
  );
end $$;

create or replace function public.mark_delivered(p_award_id uuid, p_delivered boolean default true)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  update public.awards
     set delivered = p_delivered, delivered_at = case when p_delivered then now() else null end
   where id = p_award_id;
  return found;
end $$;

create or replace function public.get_suspicious_activity()
returns json language plpgsql stable security definer set search_path = public as $$
declare v_burst json; v_multi json;
begin
  perform public.assert_admin();
  -- 1) 첫 딸기 후 10분 안에 8개 이상 몰린 글 (최근 30일)
  select coalesce(json_agg(x), '[]'::json) into v_burst from (
    select g.id, g.nickname, left(g.content, 60) as content, g.created_at, g.strawberry_count,
           f.first_at, count(*) as burst_count
    from public.gratitudes g
    join (select gratitude_id, min(created_at) as first_at from public.strawberries group by gratitude_id) f
      on f.gratitude_id = g.id
    join public.strawberries s on s.gratitude_id = g.id and s.created_at < f.first_at + interval '10 minutes'
    where g.created_at > now() - interval '30 days'
    group by g.id, g.nickname, g.content, g.created_at, g.strawberry_count, f.first_at
    having count(*) >= 8
    order by burst_count desc limit 50
  ) x;
  -- 2) 같은 기기에서 여러 닉네임으로 딸기를 준 경우 (최근 30일)
  select coalesce(json_agg(y), '[]'::json) into v_multi from (
    select device_id, array_agg(distinct nickname) as nicknames, count(distinct nickname) as nickname_count,
           count(*) as strawberry_count, max(created_at) as last_at
    from public.strawberries
    where created_at > now() - interval '30 days'
    group by device_id
    having count(distinct nickname) >= 2
    order by nickname_count desc, strawberry_count desc limit 50
  ) y;
  return json_build_object('burst', v_burst, 'multi_nickname', v_multi);
end $$;

create or replace function public.get_needs_review()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return (select coalesce(json_agg(g order by g.created_at desc), '[]'::json)
          from (select id, nickname, content, emotion, tags, age_group, is_hidden, report_count, created_at
                from public.gratitudes where needs_review = true
                order by created_at desc limit 100) g);
end $$;

create or replace function public.get_hidden_gratitudes()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return (select coalesce(json_agg(g order by g.created_at desc), '[]'::json)
          from (select id, nickname, content, emotion, tags, report_count, strawberry_count, needs_review, created_at
                from public.gratitudes where is_hidden = true
                order by created_at desc limit 200) g);
end $$;

create or replace function public.restore_gratitude(p_gratitude_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  delete from public.reports where gratitude_id = p_gratitude_id;
  update public.gratitudes set is_hidden = false, report_count = 0 where id = p_gratitude_id;
  return found;
end $$;

create or replace function public.admin_delete_gratitude(p_gratitude_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  delete from public.gratitudes where id = p_gratitude_id;
  return found;
end $$;

-- ---------- 자동 시상 ----------
-- 직전 기간의 상위 N명을 awards 에 기록. 매일 KST 0시에 실행되며, 기간 경계일(월요일/1일)에만 동작.
create or replace function public.close_award_period(p_force boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare
  cur record;
  v_type   text;
  v_start  timestamptz;
  v_end    timestamptz;
  v_top_n  integer := public.get_setting('award_top_n', '3')::int;
  v_local  timestamp := public.kst_now();
  v_is_boundary boolean;
  r record;
  v_id uuid;
  v_inserted integer := 0;
begin
  select * into cur from public.period_bounds();
  v_type := cur.period_type;
  v_end := cur.start_ts;                                    -- 직전 기간의 끝 = 현재 기간의 시작
  v_start := case when v_type = 'month'
                  then ((cur.start_ts at time zone 'Asia/Seoul') - interval '1 month') at time zone 'Asia/Seoul'
                  else cur.start_ts - interval '1 week' end;
  v_is_boundary := case when v_type = 'month' then extract(day from v_local) = 1
                        else extract(isodow from v_local) = 1 end;

  if not p_force and not v_is_boundary then
    return json_build_object('closed', false, 'reason', 'NOT_BOUNDARY_DAY');
  end if;
  if exists (select 1 from public.awards where period_type = v_type and period_start = v_start) then
    return json_build_object('closed', false, 'reason', 'ALREADY_CLOSED', 'period_start', v_start);
  end if;

  for r in select * from public.ranking_for(v_start, v_end, 100) where rank <= v_top_n loop
    v_id := gen_random_uuid();
    insert into public.awards(id, period_type, period_start, period_end, rank, nickname, strawberry_total,
                              gratitude_count, claim_code_hash)
    values (v_id, v_type, v_start, v_end, r.rank, r.nickname, r.strawberry_total, r.gratitude_count,
            public.hash_token(public.award_claim_code(v_id)));
    v_inserted := v_inserted + 1;
  end loop;

  return json_build_object('closed', true, 'period_type', v_type, 'period_start', v_start,
                           'period_end', v_end, 'winners', v_inserted);
end $$;

-- 관리자 페이지에서 수동 마감 (테스트/비상용)
create or replace function public.admin_close_award_period(p_force boolean default true)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return public.close_award_period(p_force);
end $$;

-- pg_cron 등록: 매일 15:00 UTC = 한국 시간 0시
do $$ begin
  perform cron.unschedule('tvm-close-award-period');
exception when others then null; end $$;
do $$ begin
  perform cron.schedule('tvm-close-award-period', '0 15 * * *', 'select public.close_award_period(false)');
exception when others then
  raise notice 'pg_cron 스케줄 등록 실패 (%). README의 안내대로 수동 등록하세요.', sqlerrm;
end $$;

-- ---------- 함수 실행 권한 ----------
-- 내부 함수는 외부에서 호출 불가
revoke execute on function public.hash_token(text)                                   from public, anon, authenticated;
revoke execute on function public.period_bounds(text, timestamptz)                   from public, anon, authenticated;
revoke execute on function public.get_setting(text, text)                            from public, anon, authenticated;
revoke execute on function public.award_claim_code(uuid)                             from public, anon, authenticated;
revoke execute on function public.ranking_for(timestamptz, timestamptz, integer)     from public, anon, authenticated;
revoke execute on function public.close_award_period(boolean)                        from public, anon, authenticated;
revoke execute on function public.gratitudes_before_insert()                         from public, anon, authenticated;
revoke execute on function public.assert_admin()                                     from public, anon, authenticated;
revoke execute on function public.pin_hash_for(text, text)                           from public, anon, authenticated;
revoke execute on function public.check_nickname_pin(text, text)                     from public, anon, authenticated;

-- 공개 RPC
grant execute on function public.nickname_exists(text)                               to anon, authenticated;
grant execute on function public.claim_nickname(text, text)                          to anon, authenticated;
grant execute on function public.change_nickname(text, text, text)                   to anon, authenticated;
grant execute on function public.enter_nickname(text, text, text)                    to anon, authenticated;
grant execute on function public.create_gratitude(text, text, text, text, text, text[], text, text, text, boolean) to anon, authenticated;
grant execute on function public.get_my_gratitudes(text, text)                       to anon, authenticated;
grant execute on function public.get_my_summary(text, text)                          to anon, authenticated;
grant execute on function public.delete_my_gratitude(uuid, text, text)               to anon, authenticated;
grant execute on function public.toggle_strawberry(uuid, text, text)                 to anon, authenticated;
grant execute on function public.get_strawberry_givers(uuid)                         to anon, authenticated;
grant execute on function public.get_my_strawberries(text[])                         to anon, authenticated;
grant execute on function public.get_my_award(text[])                                to anon, authenticated;
grant execute on function public.report_gratitude(uuid, text)                        to anon, authenticated;
grant execute on function public.delete_gratitude(uuid, text)                        to anon, authenticated;
grant execute on function public.get_stats(text)                                     to anon, authenticated;
-- 관리자 RPC (함수 내부에서 is_admin() 검사)
grant execute on function public.is_admin()                                          to anon, authenticated;
grant execute on function public.get_ranking(text)                                   to authenticated;
grant execute on function public.get_award_history()                                 to authenticated;
grant execute on function public.verify_claim_code(uuid, text)                       to authenticated;
grant execute on function public.mark_delivered(uuid, boolean)                       to authenticated;
grant execute on function public.get_suspicious_activity()                           to authenticated;
grant execute on function public.get_needs_review()                                  to authenticated;
grant execute on function public.get_hidden_gratitudes()                             to authenticated;
grant execute on function public.restore_gratitude(uuid)                             to authenticated;
grant execute on function public.admin_delete_gratitude(uuid)                        to authenticated;
grant execute on function public.admin_close_award_period(boolean)                   to authenticated;

-- ---------- 관리자 등록 (이메일을 바꿔서 실행하세요) ----------
-- insert into public.admins(email) values ('you@example.com') on conflict do nothing;
