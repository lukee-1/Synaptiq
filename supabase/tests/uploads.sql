-- Reversible checks of chunking, ownership, retries, revision conflicts and clue access.
begin;
insert into auth.users(id,email) values
('00000000-0000-4000-8000-000000000111','upload-a@example.invalid'),
('00000000-0000-4000-8000-000000000112','upload-b@example.invalid');
create temporary table fixture(name text primary key,value jsonb);
grant all on fixture to authenticated,anon;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000111","role":"authenticated"}',true);
insert into fixture values('workspace',public.synaptiq_action('bootstrap','{}'));
insert into fixture values('project',public.synaptiq_action('create_project',jsonb_build_object('p_workspace',(select value->>'id' from fixture where name='workspace'),'p_name','Upload regression fixture','p_files','[]'::jsonb)));
insert into fixture values('upload',public.synaptiq_upload('begin',jsonb_build_object('project_id',(select value->>'id' from fixture where name='project'),'path','large.txt')));
do $$ declare id text := (select value->>'id' from fixture where name='upload'); i integer; f jsonb; begin
  for i in 0..9 loop
    perform public.synaptiq_upload('append',jsonb_build_object('upload_id',id,'part',i,'content',repeat('é',60000)));
  end loop;
  -- A transport retry is idempotent.
  perform public.synaptiq_upload('append',jsonb_build_object('upload_id',id,'part',9,'content',repeat('é',60000)));
  f:=public.synaptiq_upload('finish',jsonb_build_object('upload_id',id,'parts',10));
  if octet_length(f->>'source')<>1200000 then raise exception 'FAIL large Unicode upload'; end if;
  insert into fixture values('file',f);
  for i in 1..64 loop
    f:=public.synaptiq_upload('begin',jsonb_build_object('project_id',(select value->>'id' from fixture where name='project'),'path',i||'.txt'));
    perform public.synaptiq_upload('append',jsonb_build_object('upload_id',f->>'id','part',0,'content',''));
    perform public.synaptiq_upload('finish',jsonb_build_object('upload_id',f->>'id','parts',1));
  end loop;
  if (select count(*) from public.synaptiq_files where project_id=(select (value->>'id')::uuid from fixture where name='project'))<>65 then raise exception 'FAIL file count cap'; end if;
end $$;
insert into fixture values('race',public.synaptiq_upload('begin',jsonb_build_object('project_id',(select value->>'id' from fixture where name='project'),'path','large.txt','revision',1)));
select public.synaptiq_upload('append',jsonb_build_object('upload_id',(select value->>'id' from fixture where name='race'),'part',0,'content','stale'));
select public.synaptiq_action('save_file',jsonb_build_object('p_file',(select value->>'id' from fixture where name='file'),'p_revision',1,'p_source','new revision'));
do $$ begin
  begin
    perform public.synaptiq_upload('finish',jsonb_build_object('upload_id',(select value->>'id' from fixture where name='race'),'parts',1));
    raise exception 'FAIL stale upload overwrote newer revision';
  exception when serialization_failure then null; end;
end $$;
insert into fixture values('session',public.synaptiq_action('start_session',jsonb_build_object('p_workspace',(select value->>'id' from fixture where name='workspace'),'p_challenge','INT-01-1-1','p_code','def solve(): return 1','p_mode','practice','p_assistance',true)));
select public.synaptiq_action('reveal_hint',jsonb_build_object('p_session',(select value->>'id' from fixture where name='session'),'p_index',0,'p_hint','A clue without a diagnosis gate.'));
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000112","role":"authenticated"}',true);
do $$ begin
  begin perform public.synaptiq_upload('abort',jsonb_build_object('upload_id',(select value->>'id' from fixture where name='race'))); raise exception 'FAIL cross-user upload'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.synaptiq_upload('begin','{}'); raise exception 'FAIL anonymous upload'; exception when insufficient_privilege then null; end;
  begin perform public.synaptiq_worker_token('claim','{}',repeat('x',48)); raise exception 'FAIL bad worker token'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: 65 files, 1.2MB Unicode source, retries, CAS conflicts, ownership, clues, invalid worker token' as result;
rollback;
