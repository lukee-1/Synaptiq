-- Remove product import caps; use authenticated, chunked uploads.
alter table public.synaptiq_files drop constraint synaptiq_files_source_check;
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
    if r.id is null or r.status<>'completed' or r.operation='explain' then raise exception 'Choose a completed test run'; end if;
    select * into s from public.synaptiq_sessions where id=r.session_id;
    if s.revision<>r.revision then raise exception 'Run the latest saved revision before reflecting'; end if;
    insert into public.synaptiq_reflections(run_id,owner_id,confidence,explanation)
      values(r.id,u,(data->>'p_confidence')::integer,data->>'p_explanation') on conflict(run_id) do update set confidence=excluded.confidence,explanation=excluded.explanation;
    return '{"ok":true}';
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

-- Appended to the CLI-created migration before applying it.
create table synaptiq_private.worker_credentials (
  name text primary key, token_hash text not null, created_at timestamptz not null default now()
);
alter table synaptiq_private.worker_credentials enable row level security;
revoke all on synaptiq_private.worker_credentials from public,anon,authenticated;
create function public.synaptiq_worker_token(action text, data jsonb, token text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if token is null or length(token)<40 or not exists(
    select 1 from synaptiq_private.worker_credentials where token_hash=encode(extensions.digest(token,'sha256'),'hex')
  ) then raise exception 'Worker authentication required' using errcode='42501'; end if;
  return synaptiq_private.worker(action,data);
end $$;
revoke all on function public.synaptiq_worker_token(text,jsonb,text) from public,authenticated;
grant execute on function public.synaptiq_worker_token(text,jsonb,text) to anon;

create table synaptiq_private.file_uploads (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.synaptiq_projects(id) on delete cascade,
  path text not null, file_id uuid references public.synaptiq_files(id) on delete cascade,
  base_revision integer, next_part integer not null default 0,
  created_at timestamptz not null default now()
);
create table synaptiq_private.file_upload_parts (
  upload_id uuid not null references synaptiq_private.file_uploads(id) on delete cascade,
  part integer not null, content text not null, primary key(upload_id,part)
);
alter table synaptiq_private.file_uploads enable row level security;
alter table synaptiq_private.file_upload_parts enable row level security;
revoke all on synaptiq_private.file_uploads,synaptiq_private.file_upload_parts from public,anon,authenticated;
create function public.synaptiq_upload(action text,data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); p public.synaptiq_projects; f public.synaptiq_files;
  task synaptiq_private.file_uploads; contents text; part_number integer;
begin
  if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if action='begin' then
    select * into p from public.synaptiq_projects where id=(data->>'project_id')::uuid for update;
    if p.id is null or not synaptiq_private.has_workspace(p.workspace_id) then raise exception 'Project not found' using errcode='42501'; end if;
    if data->>'path' is null or length(data->>'path') not between 1 and 260 or data->>'path' ~ '(^/|(^|/)\.\.(/|$)|:|\\)' then raise exception 'Use a relative source path'; end if;
    select * into f from public.synaptiq_files where project_id=p.id and path=data->>'path';
    if f.id is not null and f.revision is distinct from (data->>'revision')::integer then raise exception 'File changed elsewhere; reload before saving' using errcode='40001'; end if;
    delete from synaptiq_private.file_uploads where owner_id=u and created_at<now()-interval '1 day';
    insert into synaptiq_private.file_uploads(owner_id,project_id,path,file_id,base_revision)
      values(u,p.id,data->>'path',f.id,f.revision) returning * into task;
    return jsonb_build_object('id',task.id,'next_part',0);
  end if;
  select * into task from synaptiq_private.file_uploads where id=(data->>'upload_id')::uuid and owner_id=u for update;
  if task.id is null then raise exception 'Upload not found' using errcode='42501'; end if;
  select * into p from public.synaptiq_projects where id=task.project_id;
  if not synaptiq_private.has_workspace(p.workspace_id) then raise exception 'Project not found' using errcode='42501'; end if;
  if action='append' then
    part_number:=(data->>'part')::integer;
    if data->>'content' is null or octet_length(data->>'content')>262144 then raise exception 'Send smaller transport chunks'; end if;
    if part_number<task.next_part and exists(select 1 from synaptiq_private.file_upload_parts where upload_id=task.id and part=part_number and content=data->>'content') then
      return jsonb_build_object('id',task.id,'next_part',task.next_part);
    end if;
    if part_number<>task.next_part then raise exception 'Upload chunk order mismatch' using errcode='40001'; end if;
    insert into synaptiq_private.file_upload_parts values(task.id,part_number,data->>'content');
    update synaptiq_private.file_uploads set next_part=next_part+1 where id=task.id returning * into task;
    return jsonb_build_object('id',task.id,'next_part',task.next_part);
  elsif action='finish' then
    if task.next_part<>(data->>'parts')::integer or task.next_part<1 then raise exception 'Upload is incomplete'; end if;
    select string_agg(content,'' order by part) into contents from synaptiq_private.file_upload_parts where upload_id=task.id;
    if task.file_id is null then
      insert into public.synaptiq_files(project_id,path,source) values(task.project_id,task.path,contents) returning * into f;
    else
      select * into f from public.synaptiq_files where id=task.file_id for update;
      if f.revision<>task.base_revision then raise exception 'File changed elsewhere; reload before saving' using errcode='40001'; end if;
      update public.synaptiq_files set source=contents,revision=revision+1,updated_at=now() where id=f.id returning * into f;
    end if;
    insert into public.synaptiq_file_revisions(file_id,revision,source) values(f.id,f.revision,f.source);
    delete from synaptiq_private.file_uploads where id=task.id;
    return to_jsonb(f);
  elsif action='abort' then
    delete from synaptiq_private.file_uploads where id=task.id;
    return '{"ok":true}';
  end if;
  raise exception 'Unknown upload operation';
end $$;
revoke all on function public.synaptiq_upload(text,jsonb) from public,anon;
grant execute on function public.synaptiq_upload(text,jsonb) to authenticated;


create index file_uploads_owner_idx on synaptiq_private.file_uploads(owner_id);
create index file_uploads_project_idx on synaptiq_private.file_uploads(project_id);
create index file_uploads_file_idx on synaptiq_private.file_uploads(file_id);
