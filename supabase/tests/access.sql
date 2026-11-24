-- Reversible integration checks. Fixtures and all activity are rolled back.
begin;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000101','synaptiq-audit-a@example.invalid'),('00000000-0000-4000-8000-000000000102','synaptiq-audit-b@example.invalid');
create temporary table fixture(name text primary key, value jsonb);
grant all on fixture to authenticated,service_role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated"}',true);
insert into fixture values('workspace',public.synaptiq_action('bootstrap','{}'));
insert into fixture values('session',public.synaptiq_action('start_session',jsonb_build_object('p_workspace',(select value->>'id' from fixture where name='workspace'),'p_challenge','INT-01-1-1','p_code','def solve(): return 1','p_mode','practice','p_assistance',false)));
update fixture set value=public.synaptiq_action('save_draft',jsonb_build_object('p_session',value->>'id','p_revision',1,'p_code','def solve(): return 2','p_diagnosis','The boundary condition needs review.')) where name='session';
do $$ begin
  begin
    perform public.synaptiq_action('save_draft',jsonb_build_object('p_session',(select value->>'id' from fixture where name='session'),'p_revision',1,'p_code','stale','p_diagnosis','stale'));
    raise exception 'FAIL stale write accepted';
  exception when serialization_failure then null; end;
  begin
    insert into public.synaptiq_profiles values('00000000-0000-4000-8000-000000000102','forged',now());
    raise exception 'FAIL direct write accepted';
  exception when insufficient_privilege then null; end;
end $$;
insert into fixture values('run',public.synaptiq_action('enqueue_run',jsonb_build_object('p_session',(select value->>'id' from fixture where name='session'),'p_revision',2,'p_operation','test','p_key','00000000-0000-4000-8000-000000000201')));
do $$ declare repeated jsonb; begin
  repeated:=public.synaptiq_action('enqueue_run',jsonb_build_object('p_session',(select value->>'id' from fixture where name='session'),'p_revision',2,'p_operation','test','p_key','00000000-0000-4000-8000-000000000201'));
  if repeated->>'id'<>(select value->>'id' from fixture where name='run') then raise exception 'FAIL idempotency'; end if;
  begin perform public.synaptiq_worker('claim','{}'); raise exception 'FAIL worker access'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000102","role":"authenticated"}',true);
do $$ begin
  if exists(select 1 from public.synaptiq_sessions) or exists(select 1 from public.synaptiq_runs) or exists(select 1 from public.synaptiq_workspaces) then raise exception 'FAIL cross-user RLS'; end if;
  begin perform public.synaptiq_action('save_draft',jsonb_build_object('p_session',(select value->>'id' from fixture where name='session'),'p_revision',2,'p_code','stolen','p_diagnosis','stolen')); raise exception 'FAIL cross-user mutation'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.synaptiq_action('bootstrap','{}'); raise exception 'FAIL anonymous access'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: ownership, anonymous denial, protected writes, revision conflicts, idempotency, worker isolation' as result;
rollback;
