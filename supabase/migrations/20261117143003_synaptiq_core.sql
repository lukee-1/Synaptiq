-- Synaptiq: private writes through validated transactions; RLS on every exposed table.
create schema if not exists synaptiq_private;
revoke all on schema synaptiq_private from public, anon;
grant usage on schema synaptiq_private to authenticated, service_role;

create table public.synaptiq_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 100),
  created_at timestamptz not null default now()
);
create table public.synaptiq_workspaces (
  id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 100),
  created_by uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.synaptiq_members (
  workspace_id uuid not null references public.synaptiq_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('owner','member')), primary key(workspace_id,user_id)
);
create index synaptiq_members_user_idx on public.synaptiq_members(user_id,workspace_id);
create table public.synaptiq_projects (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.synaptiq_workspaces(id) on delete cascade,
  name text not null check(length(name) between 1 and 100), created_at timestamptz not null default now()
);
create index synaptiq_projects_workspace_idx on public.synaptiq_projects(workspace_id,created_at desc);
create table public.synaptiq_files (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.synaptiq_projects(id) on delete cascade,
  path text not null check(length(path) between 1 and 260 and path !~ '(^/|(^|/)\.\.(/|$)|:|\\)'),
  source text not null check(octet_length(source)<=75000), revision integer not null default 1 check(revision>0),
  updated_at timestamptz not null default now(), unique(project_id,path)
);
create table public.synaptiq_file_revisions (
  file_id uuid not null references public.synaptiq_files(id) on delete cascade, revision integer not null,
  source text not null, created_at timestamptz not null default now(), primary key(file_id,revision)
);
create table public.synaptiq_sessions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.synaptiq_workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade, challenge_id text not null,
  mode text not null check(mode in ('practice','assessment')), assistance boolean not null default false,
  code text not null check(length(code)<=18000), diagnosis text not null default '' check(length(diagnosis)<=3000),
  revision integer not null default 1 check(revision>0), hints jsonb not null default '[]' check(jsonb_typeof(hints)='array' and jsonb_array_length(hints)<=3),
  status text not null default 'active' check(status in ('active','submitted')), deadline timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,workspace_id,owner_id)
);
create index synaptiq_sessions_owner_idx on public.synaptiq_sessions(owner_id,updated_at desc);
create index synaptiq_sessions_workspace_idx on public.synaptiq_sessions(workspace_id);
create index synaptiq_sessions_deadline_idx on public.synaptiq_sessions(deadline) where status='active' and mode='assessment';
create table public.synaptiq_runs (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, owner_id uuid not null,
  session_id uuid not null, operation text not null check(operation in ('test','submit','explain')),
  revision integer not null, source text not null, challenge_id text not null,
  idempotency_key uuid not null, status text not null default 'queued' check(status in ('queued','running','completed','failed','cancelled')),
  result jsonb, error text, created_at timestamptz not null default now(), completed_at timestamptz,
  unique(owner_id,idempotency_key),
  foreign key(session_id,workspace_id,owner_id) references public.synaptiq_sessions(id,workspace_id,owner_id) on delete cascade
);
create index synaptiq_runs_owner_idx on public.synaptiq_runs(owner_id,created_at desc);
create index synaptiq_runs_session_idx on public.synaptiq_runs(session_id,workspace_id,owner_id);
create table public.synaptiq_run_events (
  id bigint generated always as identity primary key, run_id uuid not null references public.synaptiq_runs(id) on delete cascade,
  event text not null, payload jsonb not null default '{}', created_at timestamptz not null default now()
);
create index synaptiq_events_run_idx on public.synaptiq_run_events(run_id,id);
create table public.synaptiq_reflections (
  run_id uuid primary key references public.synaptiq_runs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  confidence integer not null check(confidence between 1 and 5), explanation text not null check(length(explanation) between 12 and 3000),
  created_at timestamptz not null default now()
);
create index synaptiq_reflections_owner_idx on public.synaptiq_reflections(owner_id);
create table synaptiq_private.jobs (
  id uuid primary key default gen_random_uuid(), run_id uuid not null unique references public.synaptiq_runs(id) on delete cascade,
  state text not null default 'queued' check(state in ('queued','leased','done')),
  attempts integer not null default 0, available_at timestamptz not null default now(), lease_until timestamptz,
  lease_token uuid, created_at timestamptz not null default now()
);
create index synaptiq_jobs_available_idx on synaptiq_private.jobs(available_at) where state<>'done';
alter table synaptiq_private.jobs enable row level security;

create function synaptiq_private.has_workspace(target uuid) returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.synaptiq_members where workspace_id=target and user_id=(select auth.uid()));
$$;
revoke all on function synaptiq_private.has_workspace(uuid) from public, anon;
grant execute on function synaptiq_private.has_workspace(uuid) to authenticated;

do $$ declare t text; begin
  foreach t in array array['profiles','workspaces','members','projects','files','file_revisions','sessions','runs','run_events','reflections'] loop
    execute format('alter table public.synaptiq_%I enable row level security',t);
    execute format('revoke all on public.synaptiq_%I from anon, authenticated',t);
    execute format('grant select on public.synaptiq_%I to authenticated',t);
  end loop;
end $$;
create policy own_profile on public.synaptiq_profiles for select to authenticated using(id=(select auth.uid()));
create policy member_workspace on public.synaptiq_workspaces for select to authenticated using(synaptiq_private.has_workspace(id));
create policy own_membership on public.synaptiq_members for select to authenticated using(user_id=(select auth.uid()));
create policy member_project on public.synaptiq_projects for select to authenticated using(synaptiq_private.has_workspace(workspace_id));
create policy member_file on public.synaptiq_files for select to authenticated using(exists(select 1 from public.synaptiq_projects p where p.id=project_id));
create policy member_revision on public.synaptiq_file_revisions for select to authenticated using(exists(select 1 from public.synaptiq_files f where f.id=file_id));
create policy own_session on public.synaptiq_sessions for select to authenticated using(owner_id=(select auth.uid()) and synaptiq_private.has_workspace(workspace_id));
create policy own_run on public.synaptiq_runs for select to authenticated using(owner_id=(select auth.uid()) and synaptiq_private.has_workspace(workspace_id));
create policy own_run_event on public.synaptiq_run_events for select to authenticated using(exists(select 1 from public.synaptiq_runs r where r.id=run_id));
create policy own_reflection on public.synaptiq_reflections for select to authenticated using(owner_id=(select auth.uid()));

-- One audited write boundary. Every branch checks identity and resource ownership.
create function synaptiq_private.action(action text, data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  u uuid := auth.uid(); w public.synaptiq_workspaces; s public.synaptiq_sessions; r public.synaptiq_runs;
  p public.synaptiq_projects; f public.synaptiq_files; item jsonb; target uuid; op text;
begin
  if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if action='bootstrap' then
    perform pg_advisory_xact_lock(hashtextextended(u::text,0));
    insert into public.synaptiq_profiles(id,display_name) values(u,'Learner') on conflict do nothing;
    select * into w from public.synaptiq_workspaces where created_by=u;
    if w.id is null then
      insert into public.synaptiq_workspaces(name,created_by) values('Personal workspace',u) returning * into w;
      insert into public.synaptiq_members values(w.id,u,'owner');
    end if;
    return to_jsonb(w);
  elsif action='start_session' then
    target := (data->>'p_workspace')::uuid;
    if not synaptiq_private.has_workspace(target) then raise exception 'Workspace not found' using errcode='42501'; end if;
    if data->>'p_challenge' !~ '^INT-[0-9]{2}-[12]-[1-5]$' then raise exception 'Invalid challenge'; end if;
    insert into public.synaptiq_sessions(workspace_id,owner_id,challenge_id,code,mode,assistance,deadline)
      values(target,u,data->>'p_challenge',data->>'p_code',data->>'p_mode',(data->>'p_assistance')::boolean,
      case when data->>'p_mode'='assessment' then now()+interval '5 minutes' else null end) returning * into s;
    return to_jsonb(s);
  elsif action in ('save_draft','reveal_hint','enqueue_run') then
    select * into s from public.synaptiq_sessions where id=(data->>'p_session')::uuid and owner_id=u for update;
    if s.id is null or not synaptiq_private.has_workspace(s.workspace_id) then raise exception 'Session not found' using errcode='42501'; end if;
    if action='enqueue_run' then
      select * into r from public.synaptiq_runs where owner_id=u and idempotency_key=(data->>'p_key')::uuid;
      if r.id is not null then
        if r.session_id<>s.id or r.operation<>data->>'p_operation' or r.revision<>(data->>'p_revision')::integer then raise exception 'Idempotency key conflicts with another request'; end if;
        return to_jsonb(r)-array['source','challenge_id','idempotency_key'];
      end if;
    end if;
    if s.status<>'active' then raise exception 'Session is already submitted'; end if;
    if action='save_draft' then
      if s.deadline is not null and s.deadline<=now() then raise exception 'Assessment deadline reached'; end if;
      if s.revision<>(data->>'p_revision')::integer then raise exception 'Draft changed elsewhere; reload before saving' using errcode='40001'; end if;
      update public.synaptiq_sessions set code=data->>'p_code',diagnosis=data->>'p_diagnosis',revision=revision+1,updated_at=now() where id=s.id returning * into s;
      return to_jsonb(s);
    elsif action='reveal_hint' then
      if s.deadline is not null and s.deadline<=now() then raise exception 'Assessment deadline reached'; end if;
      if s.mode='assessment' and not s.assistance then raise exception 'Hints are disabled for this assessment'; end if;
      if s.mode='practice' and length(trim(s.diagnosis))<12 then raise exception 'Write your diagnosis before asking for a hint'; end if;
      if jsonb_array_length(s.hints)>=3 or jsonb_array_length(s.hints)<>(data->>'p_index')::integer then raise exception 'Hint state changed; refresh and try again'; end if;
      if length(data->>'p_hint')>3000 then raise exception 'Hint too long'; end if;
      update public.synaptiq_sessions set hints=hints||jsonb_build_array(data->>'p_hint'),updated_at=now() where id=s.id returning * into s;
      return to_jsonb(s);
    end if;
    op := data->>'p_operation';
    if op not in ('test','submit','explain') then raise exception 'Invalid operation'; end if;
    if s.revision<>(data->>'p_revision')::integer then raise exception 'Run must use the current saved revision' using errcode='40001'; end if;
    if s.mode='practice' and length(trim(s.diagnosis))<12 then raise exception 'Write a diagnosis before running or asking for feedback'; end if;
    if s.mode='assessment' and op='explain' then raise exception 'AI feedback is unavailable during assessments'; end if;
    if s.deadline is not null and s.deadline<=now() and op<>'submit' then raise exception 'Assessment deadline reached'; end if;
    if (select count(*) from public.synaptiq_runs where owner_id=u and created_at>now()-interval '1 minute')>=10 then raise exception 'Run limit reached; try again in one minute'; end if;
    insert into public.synaptiq_runs(workspace_id,owner_id,session_id,operation,revision,source,challenge_id,idempotency_key)
      values(s.workspace_id,u,s.id,op,s.revision,s.code,s.challenge_id,(data->>'p_key')::uuid) returning * into r;
    insert into synaptiq_private.jobs(run_id) values(r.id);
    insert into public.synaptiq_run_events(run_id,event,payload) values(r.id,'queued',jsonb_build_object('run_id',r.id));
    if op='submit' then update public.synaptiq_sessions set status='submitted',updated_at=now() where id=s.id; end if;
    return to_jsonb(r)-array['source','challenge_id','idempotency_key'];
  elsif action='cancel_run' then
    select * into r from public.synaptiq_runs where id=(data->>'p_run')::uuid and owner_id=u for update;
    if r.id is null then raise exception 'Run not found' using errcode='42501'; end if;
    if r.operation='submit' then raise exception 'A final submission cannot be cancelled'; end if;
    if r.status in ('queued','running') then
      update public.synaptiq_runs set status='cancelled',completed_at=now() where id=r.id;
      update synaptiq_private.jobs set state='done',lease_token=null where run_id=r.id;
      insert into public.synaptiq_run_events(run_id,event) values(r.id,'cancelled');
    end if;
    return '{"ok":true}';
  elsif action='reflect' then
    select * into r from public.synaptiq_runs where id=(data->>'p_run')::uuid and owner_id=u;
    if r.id is null or r.status<>'completed' or r.operation='explain' then raise exception 'Choose a completed test run'; end if;
    select * into s from public.synaptiq_sessions where id=r.session_id;
    if s.revision<>r.revision then raise exception 'Run the latest saved revision before reflecting'; end if;
    insert into public.synaptiq_reflections(run_id,owner_id,confidence,explanation)
      values(r.id,u,(data->>'p_confidence')::integer,data->>'p_explanation') on conflict(run_id) do update set confidence=excluded.confidence,explanation=excluded.explanation;
    return '{"ok":true}';
  elsif action='create_project' then
    target := (data->>'p_workspace')::uuid;
    if not synaptiq_private.has_workspace(target) then raise exception 'Workspace not found' using errcode='42501'; end if;
    if jsonb_typeof(data->'p_files')<>'array' or jsonb_array_length(data->'p_files') not between 1 and 60 then raise exception 'Choose 1 to 60 files'; end if;
    if (select sum(octet_length(x->>'source')) from jsonb_array_elements(data->'p_files') x)>850000 then raise exception 'Project exceeds 850 KB'; end if;
    insert into public.synaptiq_projects(workspace_id,name) values(target,data->>'p_name') returning * into p;
    for item in select * from jsonb_array_elements(data->'p_files') loop
      insert into public.synaptiq_files(project_id,path,source) values(p.id,item->>'path',item->>'source') returning * into f;
      insert into public.synaptiq_file_revisions(file_id,revision,source) values(f.id,1,f.source);
    end loop;
    return to_jsonb(p);
  elsif action='save_file' then
    select * into f from public.synaptiq_files where id=(data->>'p_file')::uuid for update;
    select * into p from public.synaptiq_projects where id=f.project_id;
    if f.id is null or not synaptiq_private.has_workspace(p.workspace_id) then raise exception 'File not found' using errcode='42501'; end if;
    if f.revision<>(data->>'p_revision')::integer then raise exception 'File changed elsewhere; reload before saving' using errcode='40001'; end if;
    if (select coalesce(sum(octet_length(source)),0) from public.synaptiq_files where project_id=p.id and id<>f.id)+octet_length(data->>'p_source')>850000 then raise exception 'Project exceeds 850 KB'; end if;
    update public.synaptiq_files set source=data->>'p_source',revision=revision+1,updated_at=now() where id=f.id returning * into f;
    insert into public.synaptiq_file_revisions(file_id,revision,source) values(f.id,f.revision,f.source);
    return to_jsonb(f);
  end if;
  raise exception 'Unknown operation';
end $$;
revoke all on function synaptiq_private.action(text,jsonb) from public, anon;
grant execute on function synaptiq_private.action(text,jsonb) to authenticated;
create function public.synaptiq_action(action text,data jsonb) returns jsonb language sql security invoker set search_path='' as $$ select synaptiq_private.action(action,data) $$;
revoke all on function public.synaptiq_action(text,jsonb) from public,anon;
grant execute on function public.synaptiq_action(text,jsonb) to authenticated;

-- Service-only queue operations: leases fence stale workers, results are immutable.
create function synaptiq_private.worker(action text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j synaptiq_private.jobs; r public.synaptiq_runs; s public.synaptiq_sessions; output jsonb;
begin
  if action='claim' then
    for s in select * from public.synaptiq_sessions where status='active' and mode='assessment' and deadline<=now() for update skip locked loop
      insert into public.synaptiq_runs(workspace_id,owner_id,session_id,operation,revision,source,challenge_id,idempotency_key)
        values(s.workspace_id,s.owner_id,s.id,'submit',s.revision,s.code,s.challenge_id,s.id) on conflict(owner_id,idempotency_key) do nothing returning * into r;
      if r.id is not null then insert into synaptiq_private.jobs(run_id) values(r.id); end if;
      update public.synaptiq_sessions set status='submitted',updated_at=now() where id=s.id;
    end loop;
    update public.synaptiq_runs set status='failed',error='Worker retry budget exhausted',completed_at=now()
      where id in(select run_id from synaptiq_private.jobs where state='leased' and lease_until<now() and attempts>=3) and status in ('queued','running');
    update synaptiq_private.jobs set state='done' where state='leased' and lease_until<now() and attempts>=3;
    select * into j from synaptiq_private.jobs where ((state='queued' and available_at<=now()) or (state='leased' and lease_until<now())) and attempts<3 order by available_at for update skip locked limit 1;
    if j.id is null then return null; end if;
    update synaptiq_private.jobs set state='leased',attempts=attempts+1,lease_until=now()+interval '120 seconds',lease_token=gen_random_uuid() where id=j.id returning * into j;
    update public.synaptiq_runs set status='running',error=null where id=j.run_id and status in ('queued','running') returning * into r;
    if r.id is null then update synaptiq_private.jobs set state='done' where id=j.id; return null; end if;
    insert into public.synaptiq_run_events(run_id,event,payload) values(r.id,'started',jsonb_build_object('attempt',j.attempts));
    select * into s from public.synaptiq_sessions where id=r.session_id;
    return jsonb_build_object('job_id',j.id,'lease_token',j.lease_token,'run',to_jsonb(r),'mode',s.mode,'diagnosis',s.diagnosis,'hints',jsonb_array_length(s.hints));
  end if;
  select * into j from synaptiq_private.jobs where id=(data->>'job_id')::uuid and lease_token=(data->>'lease_token')::uuid and state='leased' and lease_until>now() for update;
  if j.id is null then raise exception 'Lease is no longer valid'; end if;
  select * into r from public.synaptiq_runs where id=j.run_id for update;
  if r.status<>'running' then raise exception 'Run is no longer running'; end if;
  if action='heartbeat' then
    update synaptiq_private.jobs set lease_until=now()+interval '120 seconds' where id=j.id;
  elsif action='event' then
    if octet_length((data->'payload')::text)>16000 then raise exception 'Event is too large'; end if;
    insert into public.synaptiq_run_events(run_id,event,payload) values(r.id,'delta',data->'payload');
  elsif action='complete' then
    output := data->'result';
    select * into s from public.synaptiq_sessions where id=r.session_id;
    if s.mode='assessment' and r.operation='test' then output := output-array['passed','hidden_passed','rating']; end if;
    update public.synaptiq_runs set status='completed',result=output,completed_at=now() where id=r.id;
    update synaptiq_private.jobs set state='done',lease_token=null where id=j.id;
    insert into public.synaptiq_run_events(run_id,event,payload) values(r.id,'completed',jsonb_build_object('run_id',r.id));
  elsif action='fail' then
    update public.synaptiq_runs set status=case when j.attempts<3 then 'queued' else 'failed' end,error=left(data->>'error',300),completed_at=case when j.attempts>=3 then now() else null end where id=r.id;
    update synaptiq_private.jobs set state=case when attempts<3 then 'queued' else 'done' end,available_at=now()+interval '10 seconds',lease_token=null where id=j.id;
    insert into public.synaptiq_run_events(run_id,event,payload) values(r.id,case when j.attempts<3 then 'retrying' else 'failed' end,jsonb_build_object('run_id',r.id));
  else raise exception 'Unknown worker operation'; end if;
  return '{"ok":true}';
end $$;
revoke all on function synaptiq_private.worker(text,jsonb) from public,anon,authenticated;
grant execute on function synaptiq_private.worker(text,jsonb) to service_role;
create function public.synaptiq_worker(action text,data jsonb) returns jsonb language sql security invoker set search_path='' as $$ select synaptiq_private.worker(action,data) $$;
revoke all on function public.synaptiq_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.synaptiq_worker(text,jsonb) to service_role;
