require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Optional: only needed if you're on Node <18
// const fetch = require('node-fetch');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ZAPIER_WEBHOOK_URL = process.env.ZAPIER_WEBHOOK_URL;

async function sendToZapier(job) {
  const payload = {
    job_title: job.title,
    company_name: job.company?.name ?? 'Unknown Company',
    job_location: job.job_location?.[0] ?? 'Remote',
    job_url: `https://kerja-remote.com/jobs/${job.slug}`,
  };

  console.log('📤 Sending to Zapier:', payload);

  try {
    const res = await fetch(ZAPIER_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const responseText = await res.text();

    if (!res.ok) {
      console.error(`❌ Zapier Error (${res.status}):`, responseText);
      return false;
    }

    console.log(`✅ Posted: ${payload.company_name} – ${payload.job_title}`);
    return true;
  } catch (err) {
    console.error('❌ Failed to send to Zapier:', err);
    return false;
  }
}

async function main() {
  const now = new Date().toISOString();
  console.log(`🔁 Cron started at ${now}`);

  const { data: jobs, error } = await supabase
    .from('jobs')
    .select(`
      id,
      slug,
      title,
      job_location,
      apply_url,
      goes_public_at,
      zapier_posted,
      company:companies (
        name
      )
    `)
    .eq('status', 'published')
    .eq('zapier_posted', false)
    .lte('goes_public_at', now)
    .order('goes_public_at', { ascending: true })
    .limit(1); // One job per cron run — cron interval controls spacing (set to 10–15 min)

  if (error) {
    console.error('❌ Supabase fetch error:', error.message);
    return;
  }

  if (!jobs?.length) {
    console.log('🟡 No new jobs to send');
    return;
  }

  for (const job of jobs) {
    const success = await sendToZapier(job);
    if (success) {
      const { error: updateError } = await supabase
        .from('jobs')
        .update({ zapier_posted: true })
        .eq('id', job.id);

      if (updateError) {
        console.error(`❌ Failed to update job ${job.id}`, updateError.message);
      } else {
        console.log(`📝 Marked job ${job.id} as zapier_posted ✅`);
      }
    }
  }
}

main();
