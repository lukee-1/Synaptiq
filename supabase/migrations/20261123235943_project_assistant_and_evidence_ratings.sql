create table public.synaptiq_chat_threads (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.synaptiq_projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now(), unique(project_id,owner_id)
);
create index chat_threads_owner_idx on public.synaptiq_chat_threads(owner_id);
create table public.synaptiq_chat_turns (
  id uuid primary key default gen_random_uuid(), thread_id uuid not null references public.synaptiq_chat_threads(id) on delete cascade,
  file_id uuid not null references public.synaptiq_files(id) on delete cascade, revision integer not null,
  prompt text not null check(length(trim(prompt)) between 1 and 4000), auto_apply boolean not null,
  idempotency_key uuid not null, status text not null default 'queued' check(status in ('queued','running','completed','failed','cancelled')),
  response jsonb, error text, applied_revision integer, reverted_revision integer,
  created_at timestamptz not null default now(), completed_at timestamptz, unique(thread_id,idempotency_key)
);
create index chat_turns_file_idx on public.synaptiq_chat_turns(file_id);
create index chat_turns_thread_time_idx on public.synaptiq_chat_turns(thread_id,created_at desc);
create table synaptiq_private.chat_jobs (
  turn_id uuid primary key references public.synaptiq_chat_turns(id) on delete cascade,
  attempts integer not null default 0, lease_token uuid, lease_until timestamptz, candidate text
);
alter table public.synaptiq_chat_threads enable row level security;
alter table public.synaptiq_chat_turns enable row level security;
alter table synaptiq_private.chat_jobs enable row level security;
revoke all on public.synaptiq_chat_threads,public.synaptiq_chat_turns,synaptiq_private.chat_jobs from public,anon,authenticated;
grant select on public.synaptiq_chat_threads,public.synaptiq_chat_turns to authenticated;
create policy own_chat on public.synaptiq_chat_threads for select to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.synaptiq_projects p where p.id=project_id));
create policy own_turn on public.synaptiq_chat_turns for select to authenticated using(exists(select 1 from public.synaptiq_chat_threads t where t.id=thread_id));

create function public.synaptiq_chat(action text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); t public.synaptiq_chat_threads; c public.synaptiq_chat_turns; f public.synaptiq_files; p public.synaptiq_projects; contents text;
begin
  if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if action='enqueue' then
    select * into p from public.synaptiq_projects where id=(data->>'project_id')::uuid;
    if p.id is null or not synaptiq_private.has_workspace(p.workspace_id) then raise exception 'Project not found' using errcode='42501'; end if;
    insert into public.synaptiq_chat_threads(project_id,owner_id) values(p.id,u) on conflict(project_id,owner_id) do nothing;
    select * into t from public.synaptiq_chat_threads where project_id=p.id and owner_id=u for update;
    select * into c from public.synaptiq_chat_turns where thread_id=t.id and idempotency_key=(data->>'idempotency_key')::uuid;
    if c.id is not null then
      if c.file_id is distinct from (data->>'file_id')::uuid or c.revision is distinct from (data->>'revision')::integer or c.prompt is distinct from trim(data->>'message') or c.auto_apply is distinct from coalesce((data->>'auto_apply')::boolean,true) then raise exception 'Idempotency key conflicts with another chat request'; end if;
      return to_jsonb(c)-'idempotency_key';
    end if;
    if exists(select 1 from public.synaptiq_chat_turns where thread_id=t.id and status in ('queued','running')) then raise exception 'Wait for the current reply or cancel it first'; end if;
    if (select count(*) from public.synaptiq_chat_turns where thread_id=t.id and created_at>now()-interval '1 minute')>=10 then raise exception 'Please wait a moment before sending another message'; end if;
    select * into f from public.synaptiq_files where id=(data->>'file_id')::uuid and project_id=p.id for update;
    if f.id is null then raise exception 'File not found' using errcode='42501'; end if;
    if f.revision is distinct from (data->>'revision')::integer then raise exception 'Save or reload the latest file before asking the assistant' using errcode='40001'; end if;
    insert into public.synaptiq_chat_turns(thread_id,file_id,revision,prompt,auto_apply,idempotency_key)
      values(t.id,f.id,f.revision,trim(data->>'message'),coalesce((data->>'auto_apply')::boolean,true),(data->>'idempotency_key')::uuid) returning * into c;
    insert into synaptiq_private.chat_jobs(turn_id) values(c.id);
    return to_jsonb(c)-'idempotency_key';
  end if;
  perform 1 from synaptiq_private.chat_jobs where turn_id=(data->>'turn_id')::uuid for update;
  select * into c from public.synaptiq_chat_turns where id=(data->>'turn_id')::uuid for update;
  select * into t from public.synaptiq_chat_threads where id=c.thread_id and owner_id=u;
  select * into p from public.synaptiq_projects where id=t.project_id;
  if t.id is null or not synaptiq_private.has_workspace(p.workspace_id) then raise exception 'Chat not found' using errcode='42501'; end if;
  if action='cancel' then
    if c.status in ('queued','running') then
      update public.synaptiq_chat_turns set status='cancelled',completed_at=now() where id=c.id returning * into c;
      update synaptiq_private.chat_jobs set lease_token=null where turn_id=c.id;
    end if;
    return to_jsonb(c)-'idempotency_key';
  end if;
  if c.status<>'completed' then raise exception 'Wait for a completed reply'; end if;
  select * into f from public.synaptiq_files where id=c.file_id for update;
  if action='apply' then
    if c.applied_revision is not null then raise exception 'This repair has already been applied'; end if;
    if f.revision<>c.revision then raise exception 'File changed after this suggestion; ask for a fresh repair' using errcode='40001'; end if;
    select candidate into contents from synaptiq_private.chat_jobs where turn_id=c.id;
    if contents is null then raise exception 'This reply has no validated code changes'; end if;
  elsif action='undo' then
    if c.applied_revision is null or c.reverted_revision is not null then raise exception 'There is no applied repair to undo'; end if;
    if f.revision<>c.applied_revision then raise exception 'The file has newer changes; undo would overwrite them' using errcode='40001'; end if;
    select source into contents from public.synaptiq_file_revisions where file_id=c.file_id and revision=c.revision;
  else raise exception 'Unknown chat action'; end if;
  if contents is null then raise exception 'Source revision unavailable'; end if;
  update public.synaptiq_files set source=contents,revision=revision+1,updated_at=now() where id=f.id returning * into f;
  insert into public.synaptiq_file_revisions(file_id,revision,source) values(f.id,f.revision,f.source);
  if action='apply' then update public.synaptiq_chat_turns set applied_revision=f.revision where id=c.id returning * into c;
  else update public.synaptiq_chat_turns set reverted_revision=f.revision where id=c.id returning * into c; end if;
  return to_jsonb(c)-'idempotency_key';
end $$;
revoke all on function public.synaptiq_chat(text,jsonb) from public,anon;
grant execute on function public.synaptiq_chat(text,jsonb) to authenticated;

create function synaptiq_private.chat_worker(action text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j synaptiq_private.chat_jobs; c public.synaptiq_chat_turns; t public.synaptiq_chat_threads; f public.synaptiq_files; snapshot text; history jsonb; applied integer;
begin
  if action='chat_claim' then
    update public.synaptiq_chat_turns set status='failed',error='Worker retry budget exhausted',completed_at=now()
      where id in(select turn_id from synaptiq_private.chat_jobs where attempts>=3 and lease_until<now()) and status='running';
    select q.* into j from synaptiq_private.chat_jobs q join public.synaptiq_chat_turns turn on turn.id=q.turn_id
      where turn.status in ('queued','running') and (q.lease_until is null or q.lease_until<now()) and q.attempts<3 order by turn.created_at for update of q skip locked limit 1;
    if j.turn_id is null then return null; end if;
    update synaptiq_private.chat_jobs set attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '120 seconds' where turn_id=j.turn_id returning * into j;
    update public.synaptiq_chat_turns set status='running',error=null where id=j.turn_id returning * into c;
    select * into t from public.synaptiq_chat_threads where id=c.thread_id;
    select * into f from public.synaptiq_files where id=c.file_id;
    select source into snapshot from public.synaptiq_file_revisions where file_id=c.file_id and revision=c.revision;
    select coalesce(jsonb_agg(x order by x.created_at),'[]') into history from (
      select prompt,response->>'message' as reply,created_at from public.synaptiq_chat_turns where thread_id=t.id and status='completed' and id<>c.id order by created_at desc limit 6
    ) x;
    return jsonb_build_object('turn_id',c.id,'lease_token',j.lease_token,'path',f.path,'source',snapshot,'message',c.prompt,'history',history);
  end if;
  select * into j from synaptiq_private.chat_jobs where turn_id=(data->>'turn_id')::uuid and lease_token=(data->>'lease_token')::uuid and lease_until>now() for update;
  select * into c from public.synaptiq_chat_turns where id=j.turn_id and status='running' for update;
  if c.id is null then raise exception 'Chat lease is no longer valid'; end if;
  if action='chat_heartbeat' then
    update synaptiq_private.chat_jobs set lease_until=now()+interval '120 seconds' where turn_id=c.id;
  elsif action='chat_fail' then
    update public.synaptiq_chat_turns set status='failed',error=left(data->>'error',500),completed_at=now() where id=c.id;
    update synaptiq_private.chat_jobs set lease_token=null where turn_id=c.id;
  elsif action='chat_complete' then
    select * into t from public.synaptiq_chat_threads where id=c.thread_id;
    if not exists(select 1 from public.synaptiq_projects p join public.synaptiq_members m on m.workspace_id=p.workspace_id where p.id=t.project_id and m.user_id=t.owner_id) then raise exception 'Project access was removed'; end if;
    update synaptiq_private.chat_jobs set candidate=data->>'candidate',lease_token=null where turn_id=c.id;
    select * into f from public.synaptiq_files where id=c.file_id for update;
    if c.auto_apply and data->>'candidate' is not null and f.revision=c.revision then
      update public.synaptiq_files set source=data->>'candidate',revision=revision+1,updated_at=now() where id=f.id returning * into f;
      insert into public.synaptiq_file_revisions(file_id,revision,source) values(f.id,f.revision,f.source);
      applied:=f.revision;
    end if;
    update public.synaptiq_chat_turns set status='completed',response=data->'response',applied_revision=applied,completed_at=now(),
      error=case when c.auto_apply and data->>'candidate' is not null and applied is null then 'File changed while the assistant was working. Your changes were preserved; request a fresh repair.' else null end where id=c.id;
  else raise exception 'Unknown chat worker action'; end if;
  return '{"ok":true}';
end $$;
revoke all on function synaptiq_private.chat_worker(text,jsonb) from public,anon,authenticated;

alter table public.synaptiq_reflections drop constraint synaptiq_reflections_confidence_check;
alter table public.synaptiq_reflections alter column confidence type numeric(3,2);
alter table public.synaptiq_reflections add constraint synaptiq_reflections_confidence_check check(confidence between 0 and 5);
alter table public.synaptiq_reflections add column code_score numeric(3,2) not null default 0 check(code_score between 0 and 5),
  add column diagnosis_score numeric(3,2) check(diagnosis_score between 0 and 5),
  add column explanation_score numeric(3,2) check(explanation_score between 0 and 5),
  add column feedback text, add column evaluation_status text not null default 'queued' check(evaluation_status in ('queued','running','completed','failed')),
  add column version integer not null default 1;
update public.synaptiq_reflections f set code_score=coalesce((r.result->>'rating')::numeric,0),confidence=coalesce((r.result->>'rating')::numeric,0) from public.synaptiq_runs r where r.id=f.run_id;
create table synaptiq_private.reflection_jobs (
  run_id uuid primary key references public.synaptiq_reflections(run_id) on delete cascade,
  version integer not null, attempts integer not null default 0, lease_token uuid, lease_until timestamptz
);
alter table synaptiq_private.reflection_jobs enable row level security;
revoke all on synaptiq_private.reflection_jobs from public,anon,authenticated;
insert into synaptiq_private.reflection_jobs(run_id,version) select run_id,version from public.synaptiq_reflections;

create function synaptiq_private.reflection_worker(action text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j synaptiq_private.reflection_jobs; f public.synaptiq_reflections; r public.synaptiq_runs; d numeric; e numeric;
begin
  if action='reflection_claim' then
    update public.synaptiq_reflections set evaluation_status='failed',feedback='Reasoning evaluation timed out. Submit again to retry.' where run_id in(select run_id from synaptiq_private.reflection_jobs where attempts>=3 and lease_until<now()) and evaluation_status='running';
    select q.* into j from synaptiq_private.reflection_jobs q join public.synaptiq_reflections v on v.run_id=q.run_id where v.evaluation_status in ('queued','running') and (q.lease_until is null or q.lease_until<now()) and q.attempts<3 for update of q skip locked limit 1;
    if j.run_id is null then return null; end if;
    update synaptiq_private.reflection_jobs set lease_token=gen_random_uuid(),lease_until=now()+interval '120 seconds',attempts=attempts+1 where run_id=j.run_id returning * into j;
    update public.synaptiq_reflections set evaluation_status='running' where run_id=j.run_id returning * into f;
    select * into r from public.synaptiq_runs where id=f.run_id;
    return jsonb_build_object('run_id',r.id,'lease_token',j.lease_token,'version',j.version,'source',r.source,'diagnosis',r.diagnosis,'explanation',f.explanation,'code_score',f.code_score,'challenge_id',r.challenge_id);
  end if;
  select * into j from synaptiq_private.reflection_jobs where run_id=(data->>'run_id')::uuid and version=(data->>'version')::integer and lease_token=(data->>'lease_token')::uuid and lease_until>now() for update;
  select * into f from public.synaptiq_reflections where run_id=j.run_id and version=j.version and evaluation_status='running' for update;
  if f.run_id is null then raise exception 'Reflection lease is no longer valid'; end if;
  if action='reflection_heartbeat' then update synaptiq_private.reflection_jobs set lease_until=now()+interval '120 seconds' where run_id=f.run_id;
  elsif action='reflection_fail' then update public.synaptiq_reflections set evaluation_status='failed',feedback='Evaluation unavailable. Your answer was saved; submit again to retry.' where run_id=f.run_id;
  elsif action='reflection_complete' then
    select * into r from public.synaptiq_runs where id=f.run_id;
    d:=case when length(trim(r.diagnosis))=0 then 0 else (data->>'diagnosis_score')::numeric end;
    e:=(data->>'explanation_score')::numeric;
    if d is null or e is null or d not between 0 and 5 or e not between 0 and 5 then raise exception 'Invalid reasoning score'; end if;
    update public.synaptiq_reflections set diagnosis_score=d,explanation_score=e,confidence=round(0.6*code_score+0.2*d+0.2*e,2),feedback=data->>'feedback',evaluation_status='completed' where run_id=f.run_id;
  else raise exception 'Unknown reflection action'; end if;
  return '{"ok":true}';
end $$;
revoke all on function synaptiq_private.reflection_worker(text,jsonb) from public,anon,authenticated;

create or replace function synaptiq_private.action(action text, data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
        return to_jsonb(r)-array['source','challenge_id','idempotency_key','diagnosis','hints_used'];
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
      if jsonb_array_length(s.hints)>=3 or jsonb_array_length(s.hints)<>(data->>'p_index')::integer then raise exception 'Hint state changed; refresh and try again'; end if;
      if length(data->>'p_hint')>3000 then raise exception 'Hint too long'; end if;
      update public.synaptiq_sessions set hints=hints||jsonb_build_array(data->>'p_hint'),updated_at=now() where id=s.id returning * into s;
      return to_jsonb(s);
    end if;
    op := data->>'p_operation';
    if op not in ('test','submit','explain') then raise exception 'Invalid operation'; end if;
    if s.revision<>(data->>'p_revision')::integer then raise exception 'Run must use the current saved revision' using errcode='40001'; end if;
    if s.mode='assessment' and op='explain' then raise exception 'AI feedback is unavailable during assessments'; end if;
    if s.deadline is not null and s.deadline<=now() and op<>'submit' then raise exception 'Assessment deadline reached'; end if;
    if (select count(*) from public.synaptiq_runs where owner_id=u and created_at>now()-interval '1 minute')>=10 then raise exception 'Run limit reached; try again in one minute'; end if;
    insert into public.synaptiq_runs(workspace_id,owner_id,session_id,operation,revision,source,challenge_id,idempotency_key,diagnosis,hints_used)
      values(s.workspace_id,u,s.id,op,s.revision,s.code,s.challenge_id,(data->>'p_key')::uuid,s.diagnosis,jsonb_array_length(s.hints)) returning * into r;
    insert into synaptiq_private.jobs(run_id) values(r.id);
    insert into public.synaptiq_run_events(run_id,event,payload) values(r.id,'queued',jsonb_build_object('run_id',r.id));
    if op='submit' then update public.synaptiq_sessions set status='submitted',updated_at=now() where id=s.id; end if;
    return to_jsonb(r)-array['source','challenge_id','idempotency_key','diagnosis','hints_used'];
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
    if r.id is null or not synaptiq_private.has_workspace(r.workspace_id) or r.status<>'completed' or r.operation='explain' then raise exception 'Choose a completed test run'; end if;
    select * into s from public.synaptiq_sessions where id=r.session_id;
    if s.revision<>r.revision then raise exception 'Run the latest saved revision before reflecting'; end if;
    if not (r.result ? 'rating') then raise exception 'Submit the assessment before saving your reflection'; end if;
    if length(trim(data->>'p_explanation')) not between 12 and 3000 then raise exception 'Explain your repair in at least 12 characters'; end if;
    perform pg_advisory_xact_lock(hashtextextended('reflection:'||r.id::text,0));
    perform 1 from synaptiq_private.reflection_jobs where run_id=r.id for update;
    insert into public.synaptiq_reflections(run_id,owner_id,confidence,code_score,explanation,evaluation_status)
      values(r.id,u,(r.result->>'rating')::numeric,(r.result->>'rating')::numeric,trim(data->>'p_explanation'),'queued')
      on conflict(run_id) do update set explanation=excluded.explanation,confidence=excluded.confidence,code_score=excluded.code_score,
      diagnosis_score=null,explanation_score=null,feedback=null,evaluation_status='queued',version=public.synaptiq_reflections.version+1;
    insert into synaptiq_private.reflection_jobs(run_id,version) select run_id,version from public.synaptiq_reflections where run_id=r.id
      on conflict(run_id) do update set version=excluded.version,attempts=0,lease_token=null,lease_until=null;
    return (select to_jsonb(v) from public.synaptiq_reflections v where run_id=r.id);
  elsif action='create_project' then
    target := (data->>'p_workspace')::uuid;
    if not synaptiq_private.has_workspace(target) then raise exception 'Workspace not found' using errcode='42501'; end if;
    if jsonb_typeof(data->'p_files')<>'array' then raise exception 'Files must be an array'; end if;
    insert into public.synaptiq_projects(workspace_id,name) values(target,data->>'p_name') returning * into p;
    for item in select * from jsonb_array_elements(data->'p_files') loop
      insert into public.synaptiq_files(project_id,path,source) values(p.id,item->>'path',item->>'source') returning * into f;
      insert into public.synaptiq_file_revisions(file_id,revision,source) values(f.id,1,f.source);
    end loop;
    return to_jsonb(p);
  elsif action='save_file' then
    select * into f from public.synaptiq_files where id=(data->>'p_file')::uuid for update;
    select * into p from public.synaptiq_projects where id=f.project_id for update;
    if f.id is null or not synaptiq_private.has_workspace(p.workspace_id) then raise exception 'File not found' using errcode='42501'; end if;
    if f.revision<>(data->>'p_revision')::integer then raise exception 'File changed elsewhere; reload before saving' using errcode='40001'; end if;
    update public.synaptiq_files set source=data->>'p_source',revision=revision+1,updated_at=now() where id=f.id returning * into f;
    insert into public.synaptiq_file_revisions(file_id,revision,source) values(f.id,f.revision,f.source);
    return to_jsonb(f);
  end if;
  raise exception 'Unknown operation';
end $$;


create or replace function synaptiq_private.worker(action text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j synaptiq_private.jobs; r public.synaptiq_runs; s public.synaptiq_sessions; output jsonb;
begin
  if left(action,5)='chat_' then return synaptiq_private.chat_worker(action,data); end if;
  if left(action,11)='reflection_' then return synaptiq_private.reflection_worker(action,data); end if;
  if action in ('claim','sweep') then
    for s in select * from public.synaptiq_sessions where status='active' and mode='assessment' and deadline<=now() for update skip locked loop
      insert into public.synaptiq_runs(workspace_id,owner_id,session_id,operation,revision,source,challenge_id,idempotency_key,diagnosis,hints_used)
        values(s.workspace_id,s.owner_id,s.id,'submit',s.revision,s.code,s.challenge_id,gen_random_uuid(),s.diagnosis,jsonb_array_length(s.hints)) returning * into r;
      if r.id is not null then insert into synaptiq_private.jobs(run_id) values(r.id); end if;
      update public.synaptiq_sessions set status='submitted',updated_at=now() where id=s.id;
    end loop;
    if action='sweep' then return null; end if;
    update public.synaptiq_runs set status='failed',error='Worker retry budget exhausted',completed_at=now()
      where id in(select run_id from synaptiq_private.jobs where state='leased' and lease_until<now() and attempts>=3) and status in ('queued','running');
    update synaptiq_private.jobs set state='done' where state='leased' and lease_until<now() and attempts>=3;
    select q.* into j from synaptiq_private.jobs q
      where ((q.state='queued' and q.available_at<=now()) or (q.state='leased' and q.lease_until<now())) and q.attempts<3
      and (coalesce(data->>'lane','all')='all' or exists (
        select 1 from public.synaptiq_runs candidate where candidate.id=q.run_id and (
          (data->>'lane'='explain' and candidate.operation='explain') or
          (data->>'lane'='grading' and candidate.operation<>'explain')
        )
      )) order by q.available_at for update of q skip locked limit 1;
    if j.id is null then return null; end if;
    update synaptiq_private.jobs set state='leased',attempts=attempts+1,lease_until=now()+interval '120 seconds',lease_token=gen_random_uuid() where id=j.id returning * into j;
    update public.synaptiq_runs set status='running',error=null where id=j.run_id and status in ('queued','running') returning * into r;
    if r.id is null then update synaptiq_private.jobs set state='done' where id=j.id; return null; end if;
    insert into public.synaptiq_run_events(run_id,event,payload) values(r.id,'started',jsonb_build_object('attempt',j.attempts));
    select * into s from public.synaptiq_sessions where id=r.session_id;
    return jsonb_build_object('job_id',j.id,'lease_token',j.lease_token,'run',to_jsonb(r),'mode',s.mode,'diagnosis',r.diagnosis,'hints',r.hints_used);
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
