import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import type { Limit, Snap, View } from '../types'

const snap = atom({ plugin: 'footer-ag', key: 'snap' } as const, { tokens: 0, window: 0, percent: 0, five: null, week: null } as Snap)
const view = atom({ plugin: 'footer-ag', key: 'view' } as const, 'five' as View)
const tick = atom({ plugin: 'footer-ag', key: 'tick' } as const, 0)
const minute = atom({ plugin: 'footer-ag', key: 'minute' } as const, 0)
// the details card above the prompt: opened and closed by ⓘ in the footer
const open = atom({ plugin: 'footer-ag', key: 'open' } as const, false)
// how far the card has unfolded, 0 (gone) to 1 (fully open): animated on open and close
const reveal = atom({ plugin: 'footer-ag', key: 'reveal' } as const, 0)

const FRAME_MS = 30
const OPEN_STEP = 0.07 // ~15 frames, under half a second
const CLOSE_STEP = 0.14 // ~7 frames: folding away is quicker
// $.clock.every hands back a timer: cancel() ends it
let anim: { cancel: () => void } | undefined
async function setOpen($: any, to: boolean) {
  await update($, open, () => to)
  anim?.cancel()
  const timer: { cancel: () => void } = $.clock.every(FRAME_MS, () => {
    void update($, reveal, p => {
      const n = to ? Math.min(1, p + OPEN_STEP) : Math.max(0, p - CLOSE_STEP)
      if (n === (to ? 1 : 0)) {
        timer.cancel()
        if (anim === timer) anim = undefined
      }
      return n
    })
  })
  anim = timer
}

// one place for the card's and footer's colours
const COLOUR = {
  bg: [30, 30, 30], // the dark background the card fades in from
  text: '#e5e5e5', // main text in the card
  muted: '#8b8b8b', // labels and secondary text
  reset: '#22e5f0', // the reset countdown
  face: '#5eead4', // the short time next to the footer bar
  context: '#c4b5fd', // the "this chat" block
  unknown: '#3a3a40', // the bar's track while there is no reading yet
}
// below this share of the limit left, the bar and percent start to pulse
const URGENT = 0.15

// a colour faded toward the band's dark background, for the card fading in
const BG = COLOUR.bg
export function fade(color: string, p: number): string {
  const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16))
  const t = p * (2 - p) // ease out
  return hex(mix(BG, rgb, t))
}

const CELL = '▃'
// remaining fraction -> color: red (low) -> orange -> green (plenty)
const STOPS: [number, [number, number, number]][] = [
  [0, [239, 68, 68]],
  [0.15, [239, 68, 68]],
  [0.4, [245, 158, 11]],
  [0.65, [34, 197, 94]],
  [1, [34, 197, 94]],
]

export function mix(a: number[], b: number[], t: number): number[] {
  return a.map((v, i) => v + (b[i]! - v) * t)
}

export function baseColor(left: number): number[] {
  for (let i = 1; i < STOPS.length; i++) {
    const [x1, c1] = STOPS[i]!
    const [x0, c0] = STOPS[i - 1]!
    if (left <= x1) return x1 === x0 ? c1 : mix(c0, c1, (left - x0) / (x1 - x0))
  }
  return STOPS[STOPS.length - 1]![1]
}

export function hex(c: number[]): string {
  return '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
}

export function fmt(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${n}`
}

const DAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const two = (n: number) => String(n).padStart(2, '0')
export function resetText(iso: string | null, weekly: boolean): string {
  const d = new Date(iso ?? NaN)
  if (isNaN(d.getTime())) return ''
  return (weekly ? DAYS[d.getDay()] + ' ' : '') + two(d.getHours()) + ':' + two(d.getMinutes())
}
// time left until the reset, as short as the footer needs: "4:21" (hours:minutes) or "2д" (days)
export function shortLeft(iso: string | null, nowMs: number): string {
  const end = Date.parse(iso ?? '')
  if (isNaN(end)) return ''
  const mins = Math.max(0, Math.round((end - nowMs) / 60000))
  const d = Math.floor(mins / 1440)
  if (d > 0) return `${d}д`
  return `${Math.floor(mins / 60)}:${two(mins % 60)}`
}

// time left, spelled out for the hover card: "1 дн 23 ч", "4 ч 17 мин", "45 мин"
export function longLeft(iso: string | null, nowMs: number): string {
  const end = Date.parse(iso ?? '')
  if (isNaN(end)) return ''
  const mins = Math.max(0, Math.round((end - nowMs) / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return `${d} дн ${h} ч`
  if (h > 0) return `${h} ч ${m} мин`
  return `${m} мин`
}

// time left until the reset, in full: "5ч 20м", "2д 3ч", "45м"
export function untilText(iso: string | null, nowMs: number): string {
  const end = Date.parse(iso ?? '')
  if (isNaN(end)) return ''
  const mins = Math.max(0, Math.round((end - nowMs) / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return `${d}д ${h}ч`
  if (h > 0) return `${h}ч ${m}м`
  return `${m}м`
}
// numbers the way people say them: "184 тыс.", "1 млн", "1.5 млн"
export function ruNum(n: number): string {
  if (n >= 1e6) return `${Number.isInteger(n / 1e6) ? n / 1e6 : (n / 1e6).toFixed(1)} млн`
  if (n >= 1e3) return `${Math.round(n / 1e3)} тыс.`
  return `${n}`
}

const left = (used: number) => Math.max(0, Math.min(1, 1 - used / 100))

// One bar + text. The glyph is drawn two columns wide but measured as one: reserve both so nothing overlaps.
// The fill is a gradient (deeper at the start, brighter at the edge), its last cell lit only as far as the
// remainder reaches (a soft edge, not a jump), the empty track is tinted with the bar's own colour, and a
// soft highlight sweeps along the lit part. When little is left, the bar and the percent breathe instead.
// With no reading yet (`known` false) the bar is a plain grey track and the percent a dash, so an unknown
// limit never looks like a full, healthy one.
function item(Box: any, Text: any, t: number, key: string, remaining: number, pct: string, label: string, width: number, pad: number, known = true) {
  if (!known) {
    const cells = Array.from({ length: width }, (_, i) => <Text key={i} color={COLOUR.unknown}>{CELL}</Text>)
    return (
      <Box key={key} flexDirection="row" gap={1}>
        <Box width={width * 2} flexShrink={0}><Text>{cells}</Text></Box>
        <Box width={pad} flexShrink={0}><Text color={COLOUR.muted} bold>{pct}</Text></Box>
        {label ? <Text dimColor>{label}</Text> : null}
      </Box>
    )
  }
  const base = baseColor(remaining)
  const urgent = remaining < URGENT
  // a small glimmer while anything is left, so 99% used still differs from 90%; nothing lit at 100%
  const fill = remaining > 0 ? Math.max(0.15, remaining * width) : 0
  const track = mix([38, 38, 44], base, 0.16)
  const breath = 0.5 + 0.5 * Math.sin(t / 2.6)
  // the highlight runs across the lit cells and past them, then starts over
  const span = Math.max(1, fill) + 3
  const head = ((t * 0.22) % span) - 1.5
  const cells = []
  for (let i = 0; i < width; i++) {
    const f = Math.max(0, Math.min(1, fill - i))
    if (f <= 0) {
      cells.push(<Text key={i} color={hex(track)}>{CELL}</Text>)
      continue
    }
    const along = width > 1 ? i / (width - 1) : 1
    const grad = mix(mix(base, [0, 0, 0], 0.28), mix(base, [255, 255, 255], 0.12), along)
    const glow = urgent ? breath * 0.45 : 0.55 * Math.exp(-((i - head) ** 2) / 1.1)
    const lit = mix(grad, [255, 255, 255], glow)
    cells.push(<Text key={i} color={hex(mix(track, lit, f))}>{CELL}</Text>)
  }
  const pctColor = urgent ? mix(base, [255, 255, 255], breath * 0.3) : mix(base, [255, 255, 255], 0.08)
  return (
    <Box key={key} flexDirection="row" gap={1}>
      <Box width={width * 2} flexShrink={0}><Text>{cells}</Text></Box>
      <Box width={pad} flexShrink={0}><Text color={hex(pctColor)} bold>{pct}</Text></Box>
      {label ? <Text dimColor>{label}</Text> : null}
    </Box>
  )
}

// h 0-360, s/l 0-1 -> rgb 0-255
export function hsl(h: number, sat: number, l: number): number[] {
  const k = (n: number) => (n + h / 30) % 12
  const a = sat * Math.min(l, 1 - l)
  return [0, 8, 4].map(n => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const u = await $.session.usage()
    const fresh = pick(u.context, u.rateLimits)
    // a new chat has no limit reading until its first reply: show the last one seen in any chat
    if (!fresh.five) fresh.five = restore((await $.store.get('five')) as Limit | undefined, await $.clock.now())
    if (!fresh.week) fresh.week = restore((await $.store.get('week')) as Limit | undefined, await $.clock.now())
    await update($, snap, () => fresh)
    // ~7 fps: enough for a smooth shimmer, cheap to redraw
    $.ui.status(undefined)
    await $.ui.close({ id: 'footer-ag' })
    const saved = await $.store.get('view')
    if (saved === 'five' || saved === 'week') await update($, view, () => saved)
    await $.command.register({ name: 'limit', description: 'Лимиты: /limit 5ч или /limit неделя — что показывает полоска (без аргумента — переключить)' })
    $.clock.every(140, () => update($, tick, n => n + 1))
    $.clock.every(60_000, () => update($, minute, n => n + 1))
    return result
  })

  on('session.measure', async ($, e, next) => {
    const fresh = pick(e.context, e.rateLimits)
    if (fresh.five) await $.store.set('five', fresh.five)
    if (fresh.week) await $.store.set('week', fresh.week)
    await warn($, 'five', fresh.five)
    await warn($, 'week', fresh.week)
    await update($, snap, old => ({ ...fresh, five: fresh.five ?? old.five, week: fresh.week ?? old.week }))
    return next(e)
  })

  // Footer slot is ~20 columns and one row: the 5-hour limit only, compact.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const modes = await next(e)
    const s = await read($, snap)
    const v = await read($, view)
    // no reading yet (fresh chat, nothing stored): still show the bar, grey, so it is always there
    const lim = v === 'week' ? s.week : s.five
    const known = lim != null
    const l = lim ?? { used: 0, resetsAt: null }
    const t = await read($, tick)
    const { Box, Text, Button } = $.ui.resolve(e)
    const isOpen = await read($, open)
    const r = left(l.used)
    // the footer slot fits about four characters: "4:21" for hours left, "2д" for days left
    const now = await $.clock.now()
    const face = known ? shortLeft(l.resetsAt, now) : ''
    // the bar shows what is left, so the number does too: a full bar reads "100%", not "0%"
    const pct = known ? `${Math.round(r * 100)}%` : '—'
    return (
      <Box flexDirection="row" flexGrow={1} justifyContent="space-between" gap={2}>
        <Box flexDirection="row" gap={1}>
          {/* only the live values: nothing more fits, and the details live in the card above the prompt */}
          <Box key="footer-ag-values" flexDirection="row" gap={1}>
            {/* which limit the bar is showing: /limit switches it */}
            <Text key="footer-ag-mode" dimColor>{v === 'week' ? 'нед' : '5ч'}</Text>
            {item(Box, Text, t, v, r, pct, '', 5, 4, known)}
            {face ? <Text bold color={r < URGENT ? hex(baseColor(r)) : COLOUR.face}>{face}</Text> : null}
          </Box>
          {/* a click works in the footer; hover cannot open anything from here on the desktop */}
          <Button key="footer-ag-info" plain label={isOpen ? ' ✕ ' : ' ⓘ '} onPress={() => setOpen($, !isOpen)} />
        </Box>
        {modes}
      </Box>
    )
  })

  // above the prompt: the band, unless a survey holds it
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    return (await drawCard($, e)) ?? next(e)
  })

  on('command.run', { command: 'limit' }, async ($, e) => {
    const next = pickView(e.args, await read($, view))
    await update($, view, () => next)
    await $.store.set('view', next)
    return { text: next === 'week' ? 'Внизу теперь недельный лимит (все модели).' : 'Внизу теперь лимит на 5 часов.' }
  })
}

// The details card above the prompt: drawn while it unfolds, is open, or folds away. Text only, no bar.
// Opening: eased; each row slides in from the left and brightens out of the background, one after another.
const easeOut = (x: number) => 1 - (1 - x) ** 3
async function drawCard($: any, e: any) {
  const p = await read($, reveal)
  if (p <= 0) return null
  const s = await read($, snap)
  await read($, minute)
  const now = await $.clock.now()
  const { Box, Text, Button } = $.ui.resolve(e)
  const q = easeOut(p)
  // row i's own progress 0..1: rows start 0.18 apart and each takes 0.46 of the way
  const at = (i: number) => Math.max(0, Math.min(1, (q - i * 0.18) / 0.46))
  const row = (i: number, key: string, body: any) => {
    const a = at(i)
    if (a <= 0) return null
    return <Box key={key} flexDirection="row" marginLeft={Math.round((1 - easeOut(a)) * 4)}>{body(a)}</Box>
  }
  const GREY = COLOUR.muted

  const limit = (key: string, name: string, lim: Limit | null, weekly: boolean) => {
    if (!lim) {
      return (
        <Box key={key} flexDirection="column">
          {row(0, 'h', (a: number) => <Text bold color={fade(COLOUR.text, a)}>{name}</Text>)}
          {row(1, 'n', (a: number) => <Text color={fade(GREY, a)}>пока нет данных</Text>)}
        </Box>
      )
    }
    const used = Math.round(lim.used)
    const c = hex(baseColor(left(lim.used)))
    const until = longLeft(lim.resetsAt, now)
    const when = resetText(lim.resetsAt, weekly)
    return (
      <Box key={key} flexDirection="column">
        {row(0, 'h', (a: number) => <Text bold color={fade(c, a)}>{name}</Text>)}
        {row(1, 'u', (a: number) => [
          <Text key="1" color={fade(GREY, a)}>{'потрачено '}</Text>,
          <Text key="2" bold color={fade(c, a)}>{`${used}%`}</Text>,
          <Text key="3" color={fade(GREY, a)}>{'   осталось '}</Text>,
          <Text key="4" bold color={fade(COLOUR.text, a)}>{`${100 - used}%`}</Text>,
        ])}
        {until
          ? row(2, 'r', (a: number) => [
              <Text key="1" color={fade(GREY, a)}>{'сбросится через '}</Text>,
              <Text key="2" bold color={fade(COLOUR.reset, a)}>{until}</Text>,
              when ? <Text key="3" color={fade(GREY, a)}>{weekly ? `   ${when}` : `   в ${when}`}</Text> : null,
            ])
          : null}
      </Box>
    )
  }

  // three columns need about 100 columns; in a narrower window they stack instead of wrapping mid-line
  const narrow = (e.props?.bodyColumns ?? 100) < 100
  return (
    <Box key="footer-ag-card" flexDirection="column" gap={1} paddingX={1}>
      <Box flexDirection={narrow ? 'column' : 'row'} gap={narrow ? 1 : 6}>
        {limit('five', '5-часовой лимит', s.five, false)}
        {limit('week', 'Недельный лимит', s.week, true)}
        {s.window > 0 ? (
          <Box key="ctx" flexDirection="column">
            {row(0, 'h', (a: number) => <Text bold color={fade(COLOUR.context, a)}>Этот чат</Text>)}
            {row(1, 'u', (a: number) => [
              <Text key="1" color={fade(GREY, a)}>{'занято '}</Text>,
              <Text key="2" bold color={fade(COLOUR.context, a)}>{`${Math.round(s.percent)}%`}</Text>,
              <Text key="3" color={fade(GREY, a)}>{' памяти'}</Text>,
            ])}
            {row(2, 't', (a: number) => <Text color={fade(GREY, a)}>{`${ruNum(s.tokens)} из ${ruNum(s.window)} токенов`}</Text>)}
          </Box>
        ) : null}
      </Box>
      {at(3) > 0 ? <Button key="footer-ag-close" label="Скрыть" onPress={() => setOpen($, false)} /> : null}
    </Box>
  )
}

// "/limit" toggles; "/limit 5ч" or "/limit неделя" picks.
export function pickView(args: string, current: View): View {
  const a = args.trim().toLowerCase()
  if (/^(5|5ч|5h|час|five)/.test(a)) return 'five'
  if (/^(нед|week|7|w)/.test(a)) return 'week'
  return current === 'five' ? 'week' : 'five'
}

function pick(c: { tokens?: number; window: number; percent?: number }, limits: { kind: string; percentUsed: number; resetsAt?: string }[]): Snap {
  const get = (k: string): Limit | null => {
    const l = limits.find(x => x.kind === k)
    return l ? { used: l.percentUsed, resetsAt: l.resetsAt ?? null } : null
  }
  return { tokens: c.tokens ?? 0, window: c.window, percent: c.percent ?? 0, five: get('five_hour'), week: get('seven_day') }
}

// Toasts when a limit passes 50%, 80% and 95% used: once per level and window, remembered across chats in
// $.store so every open chat does not repeat it. A window is the same while its reset time stays within half
// an hour of the one remembered (the reported time can drift a little between replies).
export const LEVELS = [50, 80, 95]
type Warned = { resetsAt: string | null; level: number }
export function sameWindow(a: string | null, b: string | null): boolean {
  if (!a || !b) return a === b
  return Math.abs(Date.parse(a) - Date.parse(b)) < 30 * 60_000
}
// the highest level `used` has reached above the one already warned about, or 0
export function crossed(warnedLevel: number, used: number): number {
  let hit = 0
  for (const lv of LEVELS) if (used >= lv && lv > warnedLevel) hit = lv
  return hit
}
async function warn($: any, kind: View, lim: Limit | null) {
  if (!lim) return
  const key = kind === 'five' ? 'warned-five' : 'warned-week'
  const saved = (await $.store.get(key)) as Warned | undefined
  const prev = saved && sameWindow(saved.resetsAt, lim.resetsAt) ? saved.level : 0
  const hit = crossed(prev, lim.used)
  if (!hit) return
  await $.store.set(key, { resetsAt: lim.resetsAt, level: hit } satisfies Warned)
  const until = longLeft(lim.resetsAt, await $.clock.now())
  const name = kind === 'five' ? 'Лимит на 5 часов' : 'Недельный лимит'
  const text = `${name}: потрачено ${Math.round(lim.used)}%, осталось ${100 - Math.round(lim.used)}%${until ? ` · сброс через ${until}` : ''}`
  $.ui.toast(text, { timeoutMs: hit >= 95 ? 10_000 : 6_000 })
}

// A saved reading whose window already reset means the limit is back to zero.
export function restore(saved: Limit | undefined, nowMs: number): Limit | null {
  if (!saved) return null
  return saved.resetsAt && Date.parse(saved.resetsAt) <= nowMs ? { used: 0, resetsAt: null } : saved
}
