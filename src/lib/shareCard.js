// Shareable image cards (workout, record, month), drawn on a canvas so they work offline
// and look the same on every phone. 1080 × 1350 (4:5), the size Instagram and WhatsApp
// show without cropping.
import { Filesystem, Directory } from '@capacitor/filesystem'
import { isNative, shareFiles, downloadFile } from './native.js'
import { t } from '../i18n/index.js'

const W = 1080
const H = 1350
const PAD = 84
const C = {
  bg: '#15202E',
  card: '#1F2B3B',
  ink: '#F2F4F7',
  muted: '#9AA4B2',
  faint: '#5E6B7D',
  line: '#2C394B',
  gold: '#F2B33D'
}
const F = {
  num: (w, s) => `${w} ${s}px "Barlow Condensed", "Barlow", sans-serif`,
  txt: (w, s) => `${w} ${s}px "Barlow", sans-serif`
}

async function loadFonts () {
  if (!document.fonts?.load) return
  await Promise.all([
    document.fonts.load(F.num(700, 100)), document.fonts.load(F.num(600, 40)),
    document.fonts.load(F.txt(400, 30)), document.fonts.load(F.txt(600, 30)), document.fonts.load(F.txt(700, 30))
  ]).catch(() => {})
}

/** Shrink the font until the text fits, then ellipsize as a last resort. */
function fit (ctx, text, maxW, font, size, min = Math.round(size * 0.6)) {
  let s = size
  ctx.font = font(s)
  while (ctx.measureText(text).width > maxW && s > min) { s -= 2; ctx.font = font(s) }
  if (ctx.measureText(text).width <= maxW) return { text, size: s }
  let out = text
  while (out.length > 1 && ctx.measureText(out + '…').width > maxW) out = out.slice(0, -1)
  return { text: out.trimEnd() + '…', size: s }
}

function roundRect (ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function trophy (ctx, x, y, color) {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = C.bg
  // simple cup
  ctx.beginPath()
  ctx.moveTo(x - 10, y - 10); ctx.lineTo(x + 10, y - 10); ctx.lineTo(x + 8, y + 1)
  ctx.quadraticCurveTo(x, y + 7, x - 8, y + 1); ctx.closePath(); ctx.fill()
  ctx.fillRect(x - 2, y + 4, 4, 6)
  ctx.fillRect(x - 7, y + 9, 14, 3)
  ctx.restore()
}

/**
 * spec: {
 *   accent, accentFg, badge,           plate colours and the letter in the badge
 *   kicker, title, subtitle,
 *   stats: [{ value, label }]            up to 4
 *   heading, items: [{ title, detail, trophy }]
 *   calendar: { weeks, labels }          optional month grid (weeks from calendarMonth)
 *   footer
 * }
 */
export async function drawCard (spec) {
  await loadFonts()
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const ctx = cv.getContext('2d')
  const accent = spec.accent || '#E6EAEF'
  const accentFg = spec.accentFg || C.bg

  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, W, H)
  // Plate-coloured band down the left edge
  ctx.fillStyle = accent
  ctx.fillRect(0, 0, 18, H)

  let y = PAD + 10
  // Badge + app name
  ctx.fillStyle = accent
  ctx.beginPath(); ctx.arc(PAD + 44, y + 44, 44, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = accentFg
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.font = F.num(700, 52)
  ctx.fillText(spec.badge || '★', PAD + 44, y + 47)
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = C.muted
  ctx.font = F.txt(700, 28)
  ctx.fillText('GYM CREW', PAD + 112, y + 36)
  if (spec.kicker) {
    ctx.fillStyle = C.ink
    const k = fit(ctx, spec.kicker, W - PAD * 2 - 112, (s) => F.txt(600, s), 32)
    ctx.font = F.txt(600, k.size)
    ctx.fillText(k.text, PAD + 112, y + 76)
  }
  y += 88 + 70

  // Title
  ctx.fillStyle = C.ink
  const ti = fit(ctx, spec.title || '', W - PAD * 2, (s) => F.num(700, s), 120, 64)
  ctx.font = F.num(700, ti.size)
  ctx.fillText(ti.text, PAD, y + ti.size * 0.8)
  y += ti.size * 0.8 + 18
  if (spec.subtitle) {
    ctx.fillStyle = C.muted
    const su = fit(ctx, spec.subtitle, W - PAD * 2, (s) => F.txt(400, s), 36)
    ctx.font = F.txt(400, su.size)
    ctx.fillText(su.text, PAD, y + 36)
    y += 36
  }
  y += 56

  // Stats
  const stats = (spec.stats || []).slice(0, 4)
  if (stats.length) {
    const h = 190
    const gap = 16
    const w = (W - PAD * 2 - gap * (stats.length - 1)) / stats.length
    stats.forEach((st, i) => {
      const x = PAD + i * (w + gap)
      ctx.fillStyle = C.card
      roundRect(ctx, x, y, w, h, 28); ctx.fill()
      ctx.fillStyle = C.ink
      const v = fit(ctx, String(st.value), w - 32, (s) => F.num(700, s), 96, 48)
      ctx.font = F.num(700, v.size)
      ctx.textAlign = 'center'
      ctx.fillText(v.text, x + w / 2, y + 112)
      ctx.fillStyle = C.muted
      const l = fit(ctx, st.label, w - 24, (s) => F.txt(600, s), 28, 20)
      ctx.font = F.txt(600, l.size)
      ctx.fillText(l.text, x + w / 2, y + 156)
      ctx.textAlign = 'left'
    })
    y += h + 56
  }

  const footerY = H - PAD
  const listBottom = footerY - 70

  // Month calendar
  if (spec.calendar) {
    const weeks = spec.calendar.weeks
    const cols = 7
    const cell = Math.min(84, (W - PAD * 2) / cols)
    const gx = PAD + (W - PAD * 2 - cell * cols) / 2
    ctx.fillStyle = C.faint
    ctx.font = F.txt(700, 24)
    ctx.textAlign = 'center'
    spec.calendar.labels.forEach((l, i) => ctx.fillText(l, gx + cell * i + cell / 2, y + 20))
    y += 40
    for (const wk of weeks) {
      wk.forEach((d, i) => {
        const cx = gx + cell * i + cell / 2
        const cy = y + cell / 2
        if (!d.inMonth) return
        if (d.sessions.length) {
          ctx.fillStyle = accent
          ctx.beginPath(); ctx.arc(cx, cy, cell * 0.38, 0, Math.PI * 2); ctx.fill()
          ctx.fillStyle = accentFg
        } else {
          ctx.fillStyle = C.faint
        }
        ctx.font = F.num(600, 34)
        ctx.fillText(String(d.day), cx, cy + 12)
      })
      y += cell
    }
    ctx.textAlign = 'left'
    y += 30
  }

  // List (records, gains)
  const items = spec.items || []
  if (items.length && y < listBottom - 100) {
    if (spec.heading) {
      ctx.fillStyle = C.muted
      ctx.font = F.txt(700, 28)
      ctx.fillText(spec.heading.toUpperCase(), PAD, y + 28)
      y += 56
    }
    const rowH = 104
    for (const it of items) {
      if (y + rowH > listBottom) break
      ctx.strokeStyle = C.line; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke()
      let x = PAD
      if (it.trophy) { trophy(ctx, PAD + 22, y + rowH / 2, C.gold); x += 64 }
      ctx.fillStyle = C.ink
      const a = fit(ctx, it.title, W - PAD - x, (s) => F.txt(600, s), 38, 26)
      ctx.font = F.txt(600, a.size)
      ctx.fillText(a.text, x, y + 46)
      if (it.detail) {
        ctx.fillStyle = C.muted
        const b = fit(ctx, it.detail, W - PAD - x, (s) => F.num(600, s), 34, 24)
        ctx.font = F.num(600, b.size)
        ctx.fillText(b.text, x, y + 86)
      }
      y += rowH
    }
  }

  // Footer
  if (spec.footer) {
    ctx.fillStyle = C.muted
    const f = fit(ctx, spec.footer, W - PAD * 2, (s) => F.txt(600, s), 30, 22)
    ctx.font = F.txt(600, f.size)
    ctx.fillText(f.text, PAD, footerY)
  }
  return cv
}

/** Share a canvas as a PNG (share sheet on the phone, download in a browser). */
export async function shareCanvas (canvas, name = 'gym-crew') {
  const file = `${name}-${Date.now()}.png`
  const dataUrl = canvas.toDataURL('image/png')
  if (!isNative) {
    downloadFile(file, dataUrl)
    return 'downloaded'
  }
  const res = await Filesystem.writeFile({ path: file, data: dataUrl.split(',')[1], directory: Directory.Cache })
  return shareFiles([res.uri], t('Share image'))
}
