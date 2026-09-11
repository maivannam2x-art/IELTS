-- IELTS Vocabulary Trainer - Supabase/PostgreSQL schema
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create type public.entry_type as enum ('WORD','PHRASAL_VERB','COLLOCATION','IDIOM');
create type public.part_of_speech as enum ('NOUN','VERB','ADJECTIVE','ADVERB','PHRASAL_VERB','IDIOM','COLLOCATION','OTHER');

create table if not exists public.lexical_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  headword text not null,
  lemma text,
  ipa text,
  entry_type public.entry_type not null default 'WORD',
  cefr_level text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists lexical_entries_user_headword_type_uq
  on public.lexical_entries(user_id, lower(headword), entry_type);

create table if not exists public.senses (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.lexical_entries(id) on delete cascade,
  part_of_speech public.part_of_speech not null,
  meaning_vi text not null,
  definition_en text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.examples (
  id uuid primary key default gen_random_uuid(),
  sense_id uuid not null references public.senses(id) on delete cascade,
  sentence_en text not null,
  sentence_vi text,
  source text,
  is_user_created boolean not null default false
);

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists public.entry_topics (
  entry_id uuid not null references public.lexical_entries(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  primary key(entry_id, topic_id)
);

create table if not exists public.accepted_answers (
  id uuid primary key default gen_random_uuid(),
  sense_id uuid not null references public.senses(id) on delete cascade,
  answer text not null,
  language text not null check(language in ('vi','en'))
);

create table if not exists public.word_relations (
  id uuid primary key default gen_random_uuid(),
  source_entry_id uuid not null references public.lexical_entries(id) on delete cascade,
  target_text text not null,
  relation_type text not null
);

create table if not exists public.review_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sense_id uuid not null references public.senses(id) on delete cascade,
  interval_days integer not null default 1,
  ease numeric(4,2) not null default 2.50,
  repetition_count integer not null default 0,
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  last_reviewed_at timestamptz,
  next_review_at timestamptz not null default now(),
  unique(user_id, sense_id)
);

create table if not exists public.review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sense_id uuid not null references public.senses(id) on delete cascade,
  review_result text not null check(review_result in ('AGAIN','HARD','GOOD','EASY','CORRECT','WRONG')),
  reviewed_at timestamptz not null default now()
);

create table if not exists public.test_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  correct_count integer not null default 0,
  wrong_count integer not null default 0
);

create table if not exists public.test_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.test_sessions(id) on delete cascade,
  sense_id uuid references public.senses(id) on delete set null,
  answer_text text,
  is_correct boolean not null,
  answered_at timestamptz not null default now()
);

-- RLS
alter table public.lexical_entries enable row level security;
alter table public.senses enable row level security;
alter table public.examples enable row level security;
alter table public.entry_topics enable row level security;
alter table public.accepted_answers enable row level security;
alter table public.word_relations enable row level security;
alter table public.review_state enable row level security;
alter table public.review_logs enable row level security;
alter table public.test_sessions enable row level security;
alter table public.test_answers enable row level security;

create policy "users own lexical entries" on public.lexical_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users own senses" on public.senses for all using (exists(select 1 from public.lexical_entries e where e.id = entry_id and e.user_id = auth.uid())) with check (exists(select 1 from public.lexical_entries e where e.id = entry_id and e.user_id = auth.uid()));
create policy "users own examples" on public.examples for all using (exists(select 1 from public.senses s join public.lexical_entries e on e.id=s.entry_id where s.id=sense_id and e.user_id=auth.uid())) with check (exists(select 1 from public.senses s join public.lexical_entries e on e.id=s.entry_id where s.id=sense_id and e.user_id=auth.uid()));
create policy "users own entry topics" on public.entry_topics for all using (exists(select 1 from public.lexical_entries e where e.id=entry_id and e.user_id=auth.uid())) with check (exists(select 1 from public.lexical_entries e where e.id=entry_id and e.user_id=auth.uid()));
create policy "users own accepted answers" on public.accepted_answers for all using (exists(select 1 from public.senses s join public.lexical_entries e on e.id=s.entry_id where s.id=sense_id and e.user_id=auth.uid())) with check (exists(select 1 from public.senses s join public.lexical_entries e on e.id=s.entry_id where s.id=sense_id and e.user_id=auth.uid()));
create policy "users own word relations" on public.word_relations for all using (exists(select 1 from public.lexical_entries e where e.id=source_entry_id and e.user_id=auth.uid())) with check (exists(select 1 from public.lexical_entries e where e.id=source_entry_id and e.user_id=auth.uid()));
create policy "users own review state" on public.review_state for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "users own review logs" on public.review_logs for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "users own test sessions" on public.test_sessions for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "users own test answers" on public.test_answers for all using (exists(select 1 from public.test_sessions t where t.id=session_id and t.user_id=auth.uid())) with check (exists(select 1 from public.test_sessions t where t.id=session_id and t.user_id=auth.uid()));

-- Topics are public/read-only seed data.
alter table public.topics enable row level security;
create policy "topics readable" on public.topics for select using (true);

insert into public.topics(name) values
('Education'),('Environment'),('Technology'),('Health'),('Government'),('Economy'),('Work'),('Transport'),('Housing'),('Culture'),('Media'),('Science'),('Globalisation'),('Society'),('Academic')
on conflict(name) do nothing;
