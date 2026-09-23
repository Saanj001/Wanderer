# Wander — group trip planner (Next.js + Supabase)

Itinerary · expense split · UPI settle-up · group chat (+ `@ai`) · shared photos with bulk download.
Everything syncs live between everyone who joins with the invite link.

## 1. Supabase (free tier is enough)
1. Create a project at https://supabase.com
2. **SQL Editor → New query** → paste `supabase/schema.sql` → **Run** (creates tables, realtime, and the `trip-photos` bucket)
3. **Project Settings → API**: copy the *Project URL* and the *anon public* key

## 2. Run locally
```bash
cp .env.example .env.local     # fill in the 2 Supabase values (+ ANTHROPIC_API_KEY for AI)
npm install
npm run dev
```

## 3. Deploy to Vercel
1. Push this folder to a GitHub repo
2. Vercel → **Add New → Project** → import the repo (Next.js is auto-detected)
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY` (or ANTHROPIC_API_KEY; only for the AI features)
4. Deploy. Open the site, start a trip, and share the invite link in your WhatsApp group.

## How it works
- No sign-up. Whoever opens an invite link picks their name (or adds themselves). That choice is remembered on their device.
- **Split tab:** equal splits among chosen people; settle-up suggests the fewest payments. "Pay with UPI" opens the user's UPI app with the amount prefilled (payments happen in their UPI app, then tap **Mark as paid**).
- **Chat:** live for everyone. Type `@ai` in a message to get an answer that knows your itinerary and expenses.
- **Photos:** uploads are resized to max 2560px. Select several → download as a ZIP.

## Privacy note
A trip is protected by its unguessable 8-character invite code — fine for friends, but not bank-grade. Anyone with the code can read/edit that trip. If you later want real accounts, add Supabase Auth and tighten the RLS policies in `schema.sql`.

## Train tickets & reminders
- **Plan → Tickets:** upload a screenshot; AI reads train, times, coach & seats (you confirm). Tickets are shared with everyone and feed the AI planner's arrival/departure times.
- **Reminders** go out 3 h, 1 h and 20 min before departure as a group-chat message and (if enabled) a push notification.
- Extra Vercel env vars for push: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (generate with `npx web-push generate-vapid-keys`).
- Background delivery when nobody has the app open: run `supabase/reminders_cron.sql` once (after putting your production domain in it).

## v3 additions
- **Admin & permissions:** the trip creator is admin (gear icon on the Trip tab). Admins toggle what members can do (itinerary, expenses, adding people, photos, AI) and can edit anyone's details. These are in-app guardrails, not bank-grade security.
- **Chat:** photos, stickers, GIFs (needs `GIPHY_API_KEY`), video call (opens a private Jitsi room), push notifications for new messages, and `@ai` concierge chips (stays, trains, rentals, food) using live web search.
- **Money:** split by shares (couples/kids), scan a bill or payment screenshot with AI, spending forecast on the Trip tab.
- **Photos:** Collage (grid/hero/polaroid, post or story), Reel maker (9:16 video), AI captions + hashtags.
- **AI models:** Gemini model is auto-discovered if the default isn't available for your key (`GEMINI_MODEL` overrides).

## v4: real accounts & privacy
- Everyone signs up / logs in (name, email, password, optional UPI, photo). Forgot password: email link, or an admin sets a temporary password.
- Trips are private: only members can read anything (enforced by Supabase row-level security). Members see the crew and edit only their own details; the admin(s) grant access person by person.
- Pre-added friends stay in the trip; each claims their name when they sign up from the invite link.
- **Required env var:** `SUPABASE_SERVICE_ROLE_KEY` (server only). Also set Supabase → Authentication → URL Configuration: Site URL = your production domain, and add `https://<your-domain>/**` to Redirect URLs (needed for the reset-password email link).
- `/api/health` shows what's configured and whether Gemini answers.
- Note: `supabase/schema.sql` is the original open-access schema. The v4 auth + row-level-security migration was applied to the live project; see the Supabase migrations list ("wander_v4_auth_rls").

## In-app video calls
Peer-to-peer WebRTC inside the app (signalling over Supabase Realtime, Google STUN). Best for up to ~5 people. Some mobile networks block direct connections; add a TURN relay with `NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USER`, `NEXT_PUBLIC_TURN_PASS` (e.g. a free Metered/Cloudflare TURN account).

## Group calls (7+ people)
Direct phone-to-phone calls only scale to ~4 people. For bigger groups set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (LiveKit Cloud project). The app detects them and uses the group-call server automatically. `/api/health` → `groupCallServer: true` when it's on.

## Chat polls & tasks
Polls (`messages.kind = 'poll'` + `poll_votes`) and "who's bringing what" tasks (`tasks`, permission `members_can_assign_tasks`) were added in migration `wander_v5_tasks_polls`.
