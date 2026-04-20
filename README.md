# ReverseIT

ReverseIT analyzes uploaded PDF documents, asks five critical AI-generated questions, and grades the participant's answers before updating the leaderboard.

## Environment Variables

Create a local `.env` file with the values below:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=

# OpenRouter
OPENROUTER_API_KEY=

# Optional overrides
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1/chat/completions
OPENROUTER_SITE_URL=
OPENROUTER_APP_NAME=ReverseIT
```

Use `OPENROUTER_API_KEY` from your OpenRouter account.

If no OpenRouter key is available, the app falls back to deterministic questions and local scoring so the upload flow still works during development.

## Notes

- The PDF upload endpoint stores files in Supabase Storage under the `documents` bucket.
- The leaderboard reads and updates the existing `profiles` table.
- The daily cleanup cron uses `CRON_SECRET`.

## Supabase Setup (Required)

If your Supabase dashboard shows no tables, you are likely on a fresh project.

1. Open your Supabase project SQL Editor.
2. Run the script in `supabase/schema.sql`.
3. Confirm these objects exist:
	- tables: `profiles`, `uploads`
	- function: `increment_upload_count(uuid)`
	- storage bucket: `documents`
4. Ensure `public/js/config.js` and backend `.env` use the same Supabase project URL.
5. Log out and log in again in the browser to refresh your auth token.

## Deploy on Netlify

This repository is preconfigured for Netlify static hosting + Netlify Functions.

1. Push this project to GitHub.
2. In Netlify, choose **Add new site** -> **Import an existing project**.
3. Use these build settings:
	- Base directory: `MSC_Reverse` (if your repo root is one level above this folder)
	- Build command: leave empty
	- Publish directory: `public`
	- Functions directory: `netlify/functions`
4. Add all environment variables from `.env.example` in Netlify Site settings -> Environment variables.
5. Deploy.

After deploy:

- Frontend loads from `/`.
- API endpoints are available at `/api/upload`, `/api/grade`, `/api/leaderboard`, `/api/cleanup`.
- A scheduled function (`netlify/functions/cleanup-scheduled.js`) runs daily at 02:00 UTC.