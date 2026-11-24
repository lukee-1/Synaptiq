-- Transactional queue integration tests; leave no users, sessions or jobs behind.
begin;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000103','synaptiq-queue-test@example.invalid');
create temporary table fixture(name text primary key,value jsonb);
grant all on fixture to authenticated,service_role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000103","role":"authenticated"}',true);
insert into fixture values('workspace',public.synaptiq_action('bootstrap','{}'));
insert into fixture values('session',public.synaptiq_action('start_session',jsonb_build_object('p_workspace',(select value->>'id' from fixture where name='workspace'),'p_challenge','INT-01-1-1','p_code','old source','p_mode','practice','p_assistance',false)));
update fixture set value=public.synaptiq_action('save_draft',jsonb_build_object('p_session',value->>'id','p_revision',1,'p_code','queued source','p_diagnosis','Original diagnosis for the queued revision.')) where name='session';
insert into fixture values('run',public.synaptiq_action('enqueue_run',jsonb_build_object('p_session',(select value->>'id' from fixture where name='session'),'p_revision',2,'p_operation','test','p_key',gen_random_uuid())));
update fixture set value=public.synaptiq_action('save_draft',jsonb_build_object('p_session',value->>'id','p_revision',2,'p_code','newer source','p_diagnosis','Later diagnosis must not affect the queued run.')) where name='session';
reset role;
set local role service_role;
insert into fixture values('lease',public.synaptiq_worker('claim','{}'));
do $$ declare j jsonb:=(select value from fixture where name='lease'); begin
  if j->'run'->>'source'<>'queued source' or j->>'diagnosis'<>'Original diagnosis for the queued revision.' then raise exception 'FAIL snapshot changed after enqueue'; end if;
  if public.synaptiq_worker('claim','{}') is not null then raise exception 'FAIL duplicate lease'; end if;
  perform public.synaptiq_worker('complete',j||jsonb_build_object('result','{"passed":7,"total":7,"visible":[],"hidden_passed":5,"source_hash":"test"}'::jsonb));
  begin
    perform public.synaptiq_worker('complete',j||jsonb_build_object('result','{}'::jsonb));
    raise exception 'FAIL stale lease accepted';
  exception when raise_exception then if sqlerrm='FAIL stale lease accepted' then raise; end if; end;
end $$;
reset role;
set local role authenticated;
insert into fixture values('assessment',public.synaptiq_action('start_session',jsonb_build_object('p_workspace',(select value->>'id' from fixture where name='workspace'),'p_challenge','INT-01-1-1','p_code','assessment source','p_mode','assessment','p_assistance',false)));
-- Deliberately occupy the session UUID as an ordinary idempotency key.
insert into fixture values('assessment_run',public.synaptiq_action('enqueue_run',jsonb_build_object('p_session',(select value->>'id' from fixture where name='assessment'),'p_revision',1,'p_operation','test','p_key',(select value->>'id' from fixture where name='assessment'))));
reset role;
set local role service_role;
update fixture set value=public.synaptiq_worker('claim','{}') where name='lease';
select public.synaptiq_worker('complete',(select value from fixture where name='lease')||jsonb_build_object('result','{"passed":7,"total":7,"visible":[],"hidden_passed":5,"rating":5,"source_hash":"test"}'::jsonb));
reset role;
do $$ begin
 if exists(select 1 from public.synaptiq_runs where id=(select (value->>'id')::uuid from fixture where name='assessment_run') and (result ? 'passed' or result ? 'hidden_passed' or result ? 'rating')) then raise exception 'FAIL hidden result leaked during assessment'; end if;
end $$;
update public.synaptiq_sessions set deadline=now()-interval '1 second' where id=(select (value->>'id')::uuid from fixture where name='assessment');
set local role service_role;
update fixture set value=public.synaptiq_worker('claim','{}') where name='lease';
do $$ declare j jsonb:=(select value from fixture where name='lease'); begin
 if j->'run'->>'operation'<>'submit' then raise exception 'FAIL deadline did not enqueue final grading'; end if;
end $$;
reset role;
select 'PASS: immutable snapshots, exclusive leases, stale-worker fencing, hidden result privacy, automatic assessment submission' as result;
rollback;
