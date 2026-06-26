// supabase/functions/close-markets/index.ts
// Deno edge function — called every 5 minutes to auto-close expired markets

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Close markets that have passed their closes_at
  const { data: toClose, error: fetchErr } = await supabase
    .from('markets')
    .select('id, title, closes_at')
    .eq('status', 'active')
    .lt('closes_at', new Date().toISOString())

  if (fetchErr) {
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 })
  }

  if (!toClose?.length) {
    return new Response(JSON.stringify({ closed: 0, at: new Date().toISOString() }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const ids = toClose.map((m) => m.id)
  const { error: closeErr } = await supabase
    .from('markets')
    .update({ status: 'closed', updated_at: new Date().toISOString() })
    .in('id', ids)

  if (closeErr) {
    return new Response(JSON.stringify({ error: closeErr.message }), { status: 500 })
  }

  // Notify bettors of closing
  for (const market of toClose) {
    const { data: positions } = await supabase
      .from('positions')
      .select('user_id')
      .eq('market_id', market.id)
      .eq('is_active', true)

    if (positions?.length) {
      const notifications = positions.map((p) => ({
        user_id: p.user_id,
        type: 'market_resolved',
        title: '🔒 Market Closed',
        body: `"${market.title}" is now closed for betting. Resolution is pending.`,
        data: { market_id: market.id },
      }))
      await supabase.from('notifications').insert(notifications)
    }
  }

  console.log(`Closed ${toClose.length} markets:`, ids)

  return new Response(JSON.stringify({
    closed: toClose.length,
    ids,
    at: new Date().toISOString(),
  }), { headers: { 'Content-Type': 'application/json' } })
})
