-- Run ONCE in the Supabase SQL editor after deploying the send-reminders function.
-- Replace <PROJECT_REF> and <CRON_SECRET> (the same value you set with
-- `supabase secrets set CRON_SECRET=...`). Do not commit the real secret.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'ba-coach-reminders',
  '*/5 * * * *', -- every 5 minutes; the function decides who is due
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- To stop reminders entirely:  select cron.unschedule('ba-coach-reminders');
