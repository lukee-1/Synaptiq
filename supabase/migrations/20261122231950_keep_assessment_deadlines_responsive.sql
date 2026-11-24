create or replace function synaptiq_private.worker(action text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j synaptiq_private.jobs; r public.synaptiq_runs; s public.synaptiq_sessions; output jsonb;
begin
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
