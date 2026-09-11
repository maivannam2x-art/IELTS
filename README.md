# IELTS Vocabulary Trainer

Personal IELTS vocabulary app for daily vocabulary learning, flashcards, testing, phrasal verbs and spaced review.

## Current V1 features

- Daily dashboard: total words, due today, mastered and weak words
- Vocabulary manager with clear POS categories: noun / verb / adjective / adverb / phrasal verb / collocation / idiom
- Dedicated Phrasal Verbs area
- Flashcards with Again / Hard / Good / Easy review scheduling
- Practice modes:
  - Vietnamese -> English typing
  - English -> Vietnamese typing
  - Multiple choice
  - Fill the missing vocabulary item in an example sentence
- Add vocabulary manually
- `/api/enrich` dictionary lookup
- Optional Gemini enrichment for Vietnamese meanings, examples, synonyms, topics and word family
- CSV export compatible with Excel
- PWA manifest + service worker
- Supabase/PostgreSQL schema with RLS-ready tables
- LocalStorage demo persistence until Supabase Auth/CRUD is wired

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Vercel
- Supabase-ready PostgreSQL

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

Copy `.env.example` to `.env.local`.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
```

Gemini is optional. Without it, the English dictionary lookup can still be used.

## Supabase database

Run `supabase/schema.sql` in the Supabase SQL Editor, then configure the Supabase public URL/key in Vercel Environment Variables.

The schema includes vocabulary entries, senses, examples, topics, accepted answers, word relations, review state/logs and test sessions/answers with Row Level Security groundwork.

## Deploy to Vercel

Import this repository into Vercel or deploy the file tree directly. Framework preset: Next.js. Node.js 22+.

## Next iteration

- Supabase email authentication
- Real cloud CRUD instead of LocalStorage
- Full accepted-answer variants
- Improved spaced repetition algorithm
- Word-family relation UI
- `.xlsx` import/export
- AI sentence grading and rewriting
- Statistics, streaks and daily goals
