-- Transaction-scoped fixtures: never retain synthetic accounts or modify user work.
begin;
insert into auth.users(id,email) values
('00000000-0000-4000-8000-000000000192','synaptiq-assistant-a@example.invalid'),
('00000000-0000-4000-8000-000000000193','synaptiq-assistant-b@example.invalid');
create temporary table f(k text primary key,v jsonb);
grant all on f to authenticated,service_role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000192","role":"authenticated"}',true);
insert into f values('w',public.synaptiq_action('bootstrap','{}'));
insert into f values('p',public.synaptiq_action('create_project',jsonb_build_object('p_workspace',(select v->>'id' from f where k='w'),'p_name','Assistant rollback fixture','p_files','[{"path":"sum.py","source":"x=1"}]'::jsonb)));
insert into f select 'file',to_jsonb(v) from public.synaptiq_files v where project_id=(select (v->>'id')::uuid from f where k='p');
insert into f select 'request',jsonb_build_object('project_id',(select v->>'id' from f where k='p'),'file_id',(select v->>'id' from f where k='file'),'revision',1,'message','Set x to 2','auto_apply',true,'idempotency_key',gen_random_uuid());
insert into f values('turn',public.synaptiq_chat('enqueue',(select v from f where k='request')));
do $$ begin
  if public.synaptiq_chat('enqueue',(select v from f where k='request'))->>'id'<>(select v->>'id' from f where k='turn') then raise exception 'FAIL chat idempotency'; end if;
  begin
    perform public.synaptiq_chat('enqueue',(select v||'{"message":"Different intent"}' from f where k='request'));
    raise exception 'FAIL conflicting idempotency accepted';
  exception when others then if sqlerrm not like 'Idempotency key conflicts%' then raise; end if; end;
  begin
    perform public.synaptiq_chat('enqueue',(select v||jsonb_build_object('idempotency_key',gen_random_uuid()) from f where k='request'));
    raise exception 'FAIL duplicate pending reply accepted';
  exception when others then if sqlerrm not like 'Wait for the current%' then raise; end if; end;
  begin update public.synaptiq_chat_turns set status='completed'; raise exception 'FAIL client could forge reply'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000193","role":"authenticated"}',true);
do $$ begin
  if exists(select 1 from public.synaptiq_chat_turns) then raise exception 'FAIL cross-user chat read'; end if;
  begin perform public.synaptiq_chat('cancel',jsonb_build_object('turn_id',(select v->>'id' from f where k='turn'))); raise exception 'FAIL cross-user cancel'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.synaptiq_chat('enqueue','{}'); raise exception 'FAIL anonymous chat'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
insert into f values('claim',public.synaptiq_worker('chat_claim','{}'));
do $$ begin
  if (select v->>'source' from f where k='claim')<>'x=1' then raise exception 'FAIL immutable source snapshot'; end if;
  begin perform public.synaptiq_worker('chat_complete',(select v||jsonb_build_object('lease_token',gen_random_uuid()) from f where k='claim')); raise exception 'FAIL stale lease accepted';
  exception when others then if sqlerrm not like 'Chat lease is no longer valid%' then raise; end if; end;
end $$;
select public.synaptiq_worker('chat_complete',(select v||jsonb_build_object('candidate','x=2','response','{"message":"Fixed","edits":[],"validated":true}'::jsonb) from f where k='claim'));
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000192","role":"authenticated"}',true);
do $$ begin
  if (select source from public.synaptiq_files where id=(select (v->>'id')::uuid from f where k='file'))<>'x=2' then raise exception 'FAIL auto repair not applied'; end if;
  if (select applied_revision from public.synaptiq_chat_turns where id=(select (v->>'id')::uuid from f where k='turn'))<>2 then raise exception 'FAIL applied revision'; end if;
end $$;
select public.synaptiq_chat('undo',jsonb_build_object('turn_id',(select v->>'id' from f where k='turn')));
do $$ begin
  if not exists(select 1 from public.synaptiq_files where id=(select (v->>'id')::uuid from f where k='file') and revision=3 and source='x=1') then raise exception 'FAIL undo must create new revision'; end if;
end $$;
update f set v=v||jsonb_build_object('revision',3,'idempotency_key',gen_random_uuid()) where k='request';
update f set v=public.synaptiq_chat('enqueue',(select v from f where k='request')) where k='turn';
reset role;
set local role service_role;
update f set v=public.synaptiq_worker('chat_claim','{}') where k='claim';
reset role;
set local role authenticated;
select public.synaptiq_action('save_file',jsonb_build_object('p_file',(select v->>'id' from f where k='file'),'p_revision',3,'p_source','x=99'));
reset role;
set local role service_role;
select public.synaptiq_worker('chat_complete',(select v||jsonb_build_object('candidate','x=2','response','{"message":"Fixed","edits":[],"validated":true}'::jsonb) from f where k='claim'));
reset role;
set local role authenticated;
do $$ begin
  if (select source from public.synaptiq_files where id=(select (v->>'id')::uuid from f where k='file'))<>'x=99' then raise exception 'FAIL repair overwrote newer source'; end if;
  begin perform public.synaptiq_chat('apply',jsonb_build_object('turn_id',(select v->>'id' from f where k='turn'))); raise exception 'FAIL stale manual apply'; exception when serialization_failure then null; end;
end $$;
update f set v=v||jsonb_build_object('revision',4,'auto_apply',false,'idempotency_key',gen_random_uuid()) where k='request';
update f set v=public.synaptiq_chat('enqueue',(select v from f where k='request')) where k='turn';
reset role;
set local role service_role;
update f set v=public.synaptiq_worker('chat_claim','{}') where k='claim';
select public.synaptiq_worker('chat_complete',(select v||jsonb_build_object('candidate','x=2','response','{"message":"Fixed","edits":[],"validated":true}'::jsonb) from f where k='claim'));
reset role;
set local role authenticated;
do $$ begin
  if (select source from public.synaptiq_files where id=(select (v->>'id')::uuid from f where k='file'))<>'x=99' then raise exception 'FAIL manual mode auto applied'; end if;
end $$;
select public.synaptiq_chat('apply',jsonb_build_object('turn_id',(select v->>'id' from f where k='turn')));
select public.synaptiq_action('save_file',jsonb_build_object('p_file',(select v->>'id' from f where k='file'),'p_revision',5,'p_source','x=88'));
do $$ begin
  begin perform public.synaptiq_chat('undo',jsonb_build_object('turn_id',(select v->>'id' from f where k='turn'))); raise exception 'FAIL unsafe undo'; exception when serialization_failure then null; end;
end $$;
update f set v=v||jsonb_build_object('revision',6,'idempotency_key',gen_random_uuid()) where k='request';
update f set v=public.synaptiq_chat('enqueue',(select v from f where k='request')) where k='turn';
reset role;
set local role service_role;
update f set v=public.synaptiq_worker('chat_claim','{}') where k='claim';
reset role;
set local role authenticated;
select public.synaptiq_chat('cancel',jsonb_build_object('turn_id',(select v->>'id' from f where k='turn')));
reset role;
set local role service_role;
do $$ begin
  begin perform public.synaptiq_worker('chat_complete',(select v||jsonb_build_object('candidate','x=2') from f where k='claim')); raise exception 'FAIL cancelled job completed';
  exception when others then if sqlerrm not like 'Chat lease is no longer valid%' then raise; end if; end;
end $$;
reset role;
set local role authenticated;
insert into f values('s',public.synaptiq_action('start_session',jsonb_build_object('p_workspace',(select v->>'id' from f where k='w'),'p_challenge','INT-01-1-1','p_code','x=1','p_mode','practice','p_assistance',true)));
select public.synaptiq_action('save_draft',jsonb_build_object('p_session',(select v->>'id' from f where k='s'),'p_revision',1,'p_code','x=2','p_diagnosis','The final range endpoint is missing.'));
insert into f values('r',public.synaptiq_action('enqueue_run',jsonb_build_object('p_session',(select v->>'id' from f where k='s'),'p_revision',2,'p_operation','test','p_key',gen_random_uuid())));
reset role;
update public.synaptiq_runs set status='completed',result='{"rating":4}' where id=(select (v->>'id')::uuid from f where k='r');
update synaptiq_private.jobs set state='done' where run_id=(select (v->>'id')::uuid from f where k='r');
set local role authenticated;
insert into f values('reflection',public.synaptiq_action('reflect',jsonb_build_object('p_run',(select v->>'id' from f where k='r'),'p_explanation','The extra boundary includes the last element.','p_confidence',5)));
do $$ begin
  if (select (v->>'code_score')::numeric from f where k='reflection')<>4 then raise exception 'FAIL forged confidence influenced code score'; end if;
end $$;
reset role;
set local role service_role;
insert into f values('review',public.synaptiq_worker('reflection_claim','{}'));
select public.synaptiq_worker('reflection_complete',(select v||'{"diagnosis_score":3,"explanation_score":5,"feedback":"Clear explanation; add a diagnosis example."}' from f where k='review'));
reset role;
set local role authenticated;
do $$ begin
  if (select confidence from public.synaptiq_reflections where run_id=(select (v->>'id')::uuid from f where k='r'))<>4 then raise exception 'FAIL weighted rating'; end if;
end $$;
select public.synaptiq_action('reflect',jsonb_build_object('p_run',(select v->>'id' from f where k='r'),'p_explanation','Resubmitted explanation includes an edge case.'));
reset role;
set local role service_role;
do $$ begin
  begin perform public.synaptiq_worker('reflection_complete',(select v||'{"diagnosis_score":5,"explanation_score":5,"feedback":"Stale"}' from f where k='review')); raise exception 'FAIL stale reflection version';
  exception when others then if sqlerrm not like 'Reflection lease is no longer valid%' then raise; end if; end;
end $$;
reset role;
update public.synaptiq_runs set diagnosis='' where id=(select (v->>'id')::uuid from f where k='r');
set local role service_role;
update f set v=public.synaptiq_worker('reflection_claim','{}') where k='review';
select public.synaptiq_worker('reflection_complete',(select v||'{"diagnosis_score":5,"explanation_score":5,"feedback":"Missing diagnosis."}' from f where k='review'));
reset role;
do $$ begin
  if not exists(select 1 from public.synaptiq_reflections where run_id=(select (v->>'id')::uuid from f where k='r') and diagnosis_score=0 and confidence=3.4 and evaluation_status='completed') then raise exception 'FAIL missing diagnosis must score zero'; end if;
end $$;
select 'PASS: chat RLS, idempotency, leases, auto/manual apply, undo, conflict preservation, cancellation, weighted reasoning and version fencing' as result;
rollback;
