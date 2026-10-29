import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('cleanup enforces acknowledgement age, ownership, retention and batch limits',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated;
   create schema auth;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as
   $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated, anon;
   insert into auth.users values ('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222');`);
  const setup=await readFile('supabase/setup.sql','utf8');
  const migration=await readFile('supabase/migrations/20261029_review_cleanup.sql','utf8');
  await db.exec(setup);
  // An old pre-migration acknowledgement gets a new 90-day grace period.
  await db.exec(`insert into public.cards(user_id,id,data) select id,'card','{}' from auth.users;
   drop trigger reviews_applied_at on public.reviews;
   insert into public.reviews(user_id,id,card_id,rating,expected_reps,reviewed_at,status)
   values ('11111111-1111-1111-1111-111111111111',md5('legacy')::uuid,'card',3,0,'2020-01-01','applied');`);
  await db.exec(migration);await db.exec(migration);
  assert.equal((await db.query(`select applied_at > now()-interval '1 minute' as safe from reviews where id=md5('legacy')::uuid`)).rows[0].safe,true);
  // Client-supplied timestamps cannot immediately expire an acknowledgement.
  await db.exec(`insert into public.reviews(user_id,id,card_id,rating,expected_reps,reviewed_at,status,applied_at)
   values ('11111111-1111-1111-1111-111111111111',md5('forged')::uuid,'card',3,0,now(),'applied','2000-01-01');
   update reviews set applied_at='2000-01-01' where id=md5('forged')::uuid;`);
  assert.equal((await db.query(`select applied_at > now()-interval '1 minute' as safe from reviews where id=md5('forged')::uuid`)).rows[0].safe,true);
  // Seed historical rows as an administrator, bypassing timestamp stamping only for fixtures.
  await db.exec(`alter table reviews disable trigger reviews_applied_at;
   insert into reviews(user_id,id,card_id,rating,expected_reps,reviewed_at,status,applied_at)
   select '11111111-1111-1111-1111-111111111111',md5('batch-'||n)::uuid,'card',3,0,'2020-01-01','applied',now()-interval '91 days' from generate_series(1,5001) n;
   insert into reviews(user_id,id,card_id,rating,expected_reps,reviewed_at,status,applied_at) values
    ('11111111-1111-1111-1111-111111111111',md5('recent-ack')::uuid,'card',3,0,'2020-01-01','applied',now()-interval '1 day'),
    ('11111111-1111-1111-1111-111111111111',md5('pending')::uuid,'card',3,0,'2020-01-01','pending',null),
    ('11111111-1111-1111-1111-111111111111',md5('conflict')::uuid,'card',3,0,'2020-01-01','conflict',null),
    ('22222222-2222-2222-2222-222222222222',md5('other-user')::uuid,'card',3,0,'2020-01-01','applied',now()-interval '91 days');
   alter table reviews enable trigger reviews_applied_at;
   set role authenticated;
   set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';`);
  assert.equal((await db.query('select public.cleanup_applied_reviews() as removed')).rows[0].removed,5000);
  assert.equal((await db.query('select public.cleanup_applied_reviews() as removed')).rows[0].removed,1);
  assert.equal((await db.query('select public.cleanup_applied_reviews() as removed')).rows[0].removed,0);
  const own=await db.query('select status,count(*)::int as count from reviews group by status order by status');
  assert.deepEqual(own.rows,[{status:'applied',count:3},{status:'conflict',count:1},{status:'pending',count:1}]);
  await db.exec('reset role');
  assert.equal((await db.query(`select count(*)::int as count from reviews where user_id='22222222-2222-2222-2222-222222222222'`)).rows[0].count,1);
  assert.equal((await db.query('select count(*)::int as count from cards')).rows[0].count,2);
  await db.exec('set role anon');
  await assert.rejects(db.query('select public.cleanup_applied_reviews()'),/permission denied/);
  assert.equal(await readFile('public/review-cleanup.sql','utf8'),migration);
  assert.equal(await readFile('public/setup.sql','utf8'),setup);
 }finally{await db.close()}
});
