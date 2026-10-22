// Gym Crew: sends the crew's notifications through Firebase Cloud Messaging.
//
// Deploy: Supabase dashboard → Edge Functions → Deploy a new function → Via editor,
// name it crew-push, paste this file, Deploy. Then turn OFF "Verify JWT" for it
// (the database calls it without a key; see below for why that's safe).
// Secret: Edge Functions → Secrets → FCM_SERVICE_ACCOUNT = the whole Firebase service-account JSON.
//
// How it works: when something happens (a post, comment, reaction…), the database calls this
// function with { kind, ref }. The function asks the database what to send (crew_push_job), which
// only answers once per event and only for events that really happened, then sends each message.
// So calling this function by hand can't make up notifications or send one twice.

import postgres from 'npm:postgres@3.4.9'

type Msg = { token: string; title: string; body: string; channel: string; route: string; tag?: string }

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2, idle_timeout: 20 })

let account: { project_id: string; client_email: string; private_key: string } | null = null
try { account = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT') ?? 'null') } catch { account = null }

// ── Google OAuth token from the service account (cached for its hour) ──
let cached: { token: string; exp: number } | null = null

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)))

async function accessToken (): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.exp > now + 120) return cached.token
  const head = enc({ alg: 'RS256', typ: 'JWT' })
  const claim = enc({
    iss: account!.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  })
  const pem = account!.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claim}`)))
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${b64url(sig)}` })
  })
  const j = await res.json()
  if (!res.ok) throw new Error('Google sign-in failed: ' + JSON.stringify(j))
  cached = { token: j.access_token, exp: now + (j.expires_in || 3600) }
  return cached.token
}

async function send (m: Msg, token: string): Promise<boolean> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account!.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: m.token,
        notification: { title: m.title, body: m.body },
        data: { route: m.route || '/crew' },
        android: {
          priority: 'HIGH',
          notification: { channel_id: m.channel, icon: 'ic_stat_rest', color: '#2457B5', ...(m.tag ? { tag: m.tag } : {}) }
        }
      }
    })
  })
  if (res.ok) return true
  const text = await res.text()
  // The app was uninstalled or the token expired: stop sending to it
  if (res.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(text)) {
    await sql`select public.crew_push_drop(${m.token})`
  } else {
    console.error('FCM error', res.status, text)
  }
  return false
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('crew-push is running', { status: 200 })
  let kind = ''
  let ref = ''
  try {
    const body = await req.json()
    kind = String(body.kind ?? '')
    ref = String(body.ref ?? '')
  } catch {
    return Response.json({ error: 'bad request' }, { status: 400 })
  }
  if (!/^[a-z_]{2,20}$/.test(kind) || ref.length > 200) return Response.json({ error: 'bad request' }, { status: 400 })
  if (!account?.private_key) {
    console.error('FCM_SERVICE_ACCOUNT secret is missing or not valid JSON')
    return Response.json({ error: 'not configured' }, { status: 500 })
  }
  try {
    const [row] = await sql`select public.crew_push_job(${kind}, ${ref}) as msgs`
    const msgs: Msg[] = row?.msgs ?? []
    if (!msgs.length) return Response.json({ sent: 0 })
    const token = await accessToken()
    const results = await Promise.all(msgs.map(m => send(m, token).catch((e) => { console.error(e); return false })))
    return Response.json({ sent: results.filter(Boolean).length, of: msgs.length })
  } catch (e) {
    console.error(e)
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 500 })
  }
})
