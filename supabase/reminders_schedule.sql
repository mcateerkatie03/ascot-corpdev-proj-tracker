-- Emailed reminders schedule (Supabase Cron). Run in the Supabase SQL editor AFTER deploying the send-reminders
-- function and setting its REMINDER_SECRET. Replace the two placeholders first.
-- Needs the pg_cron and pg_net extensions (the two lines below turn them on).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The function address and the shared secret live in Supabase Vault, not in the job text.
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-reminders', 'reminders_url');
select vault.create_secret('THE_SAME_VALUE_AS_REMINDER_SECRET', 'reminders_secret');

-- Every 10 minutes: sends any reminder whose 24 or 48 hours are up.
select cron.schedule('corpdev-send-reminders', '*/10 * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_url'),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-reminder-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret')),
    body    := '{}'::jsonb
  );
$$);

-- Check it ran:      select * from cron.job_run_details order by start_time desc limit 5;
-- Stop it:           select cron.unschedule('corpdev-send-reminders');
