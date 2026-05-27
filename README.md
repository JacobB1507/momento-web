# momento-web

Static web companion for the Momento iOS app. Hosts the **guest upload** flow at `/g/<code>`.

## Setup

```bash
npm install
cp .env.example .env.local
# edit .env.local with your Supabase URL + anon key
npm run dev
# open http://localhost:3000
```

To test a guest upload locally:
1. Open the iOS app, generate a guest upload link from a gallery (you'll add this UI in a later step), copy the `short_code`.
2. Visit `http://localhost:3000/g/<short_code>`.

## Deploy to Vercel

One-time:

```bash
npm install -g vercel
vercel login
```

Deploy:

```bash
vercel               # first run: links the project, deploys to a preview URL
vercel --prod        # deploys to production
```

In the Vercel dashboard, set these two env vars (Production + Preview):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Then either:
- Use the auto-generated `momento-web-xxx.vercel.app` URL, OR
- Point your `momento.app` domain at the project (Vercel → Domains → Add).

## Pages

- `/` — marketing landing
- `/g/[code]` — guest upload flow (the one that matters)

## Backend dependencies

This app calls two Supabase Edge Functions:
- `guest-upload-signed-url`
- `guest-upload-commit`

And one public RPC:
- `get_guest_upload_link_info(p_code text)`

All of these are already deployed/created in the Momento Supabase project.
