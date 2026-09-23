-- Background reminders (works even when nobody has the app open).
-- 1) Replace YOUR-SITE with your production domain, e.g. wanderer.vercel.app
-- 2) Run in Supabase → SQL Editor
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('wander-reminders', '*/5 * * * *',
  $$ select net.http_get(url := 'https://YOUR-SITE/api/cron/reminders') $$);
