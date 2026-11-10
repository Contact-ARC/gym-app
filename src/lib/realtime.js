// A tiny Supabase Realtime client (Phoenix channels over a WebSocket), broadcast only.
// Used while training together to say "something changed" the moment it happens; the data itself is
// always fetched through the crew functions, so nothing private goes over the channel, and if the socket
// can't connect the phones simply check every few seconds instead.
const HEARTBEAT = 25000

/**
 * Join a broadcast channel. onEvent(event, payload) for each message from others.
 * Returns { send(event, payload), close(), isOpen() }; reconnects by itself until closed.
 */
export function openChannel ({ url, anonKey }, topic, onEvent, onStatus = () => {}) {
  const wsUrl = `${url.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(anonKey)}&vsn=1.0.0`
  const full = `realtime:${topic}`
  let ws = null
  let ref = 0
  let joinRef = null
  let joined = false
  let closed = false
  let beat = null
  let retry = 1000
  let timer = null

  const next = () => String(++ref)
  const raw = (msg) => { try { if (ws?.readyState === 1) ws.send(JSON.stringify(msg)) } catch { /* reconnects */ } }

  function connect () {
    if (closed) return
    try { ws = new WebSocket(wsUrl) } catch { schedule(); return }
    ws.onopen = () => {
      joinRef = next()
      raw({ topic: full, event: 'phx_join', ref: joinRef, join_ref: joinRef, payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, private: false } } })
      clearInterval(beat)
      beat = setInterval(() => raw({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: next() }), HEARTBEAT)
    }
    ws.onmessage = (e) => {
      let msg
      try { msg = JSON.parse(e.data) } catch { return }
      if (msg.topic !== full) return
      if (msg.event === 'phx_reply' && msg.ref === joinRef) {
        joined = msg.payload?.status === 'ok'
        if (joined) retry = 1000
        onStatus(joined)
      } else if (msg.event === 'broadcast') {
        onEvent(msg.payload?.event, msg.payload?.payload || {})
      } else if (msg.event === 'phx_error' || msg.event === 'phx_close') {
        joined = false
        onStatus(false)
      }
    }
    ws.onclose = () => { joined = false; onStatus(false); clearInterval(beat); schedule() }
    ws.onerror = () => { try { ws.close() } catch { /* onclose follows */ } }
  }
  function schedule () {
    if (closed) return
    clearTimeout(timer)
    timer = setTimeout(connect, retry)
    retry = Math.min(30000, retry * 2)
  }
  connect()

  return {
    send (event, payload = {}) {
      if (!joined) return false
      raw({ topic: full, event: 'broadcast', ref: next(), join_ref: joinRef, payload: { type: 'broadcast', event, payload } })
      return true
    },
    close () {
      closed = true
      clearTimeout(timer)
      clearInterval(beat)
      joined = false
      try { ws?.close() } catch { /* already closed */ }
    },
    isOpen: () => joined
  }
}
