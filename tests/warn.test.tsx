import { test, expect, mock } from 'claude-code/testing'
import { crossed, sameWindow } from '../hooks/register'

const NOW = Date.parse('2026-11-09T14:00:00Z')
const RESET = '2026-11-09T16:00:00Z'
const CTX = { tokens: 1000, window: 200000, percent: 1 }
const FOOTER = { plugin: 'footer-ag', component: 'SessionMode', props: { modes: [] } } as const

const measure = (used: number, resetsAt = RESET) => ({
  context: CTX,
  rateLimits: [{ kind: 'five_hour', percentUsed: used, resetsAt }],
  changed: ['rateLimits'],
})

function seed(on: any) {
  const clock = mock.clock(on, { now: NOW })
  const toasts: string[] = []
  on('ui.toast', (_: any, e: any) => { toasts.push(e.text); return { value: undefined } })
  // stands for the engine: the measurement's echo and the store shared across chats
  on('session.measure', (_: any, e: any) => ({ changed: e.changed }))
  const store = new Map<string, unknown>()
  on('store.get', (_: any, e: any) => ({ value: store.get(e.key) }))
  on('store.set', (_: any, e: any) => { store.set(e.key, e.value); return { value: undefined } })
  on('ui.render', { component: 'SessionMode' }, ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>mode</Text>
  })
  return Object.assign(toasts, { clock })
}

test('levels: the highest one passed above the last warned', () => {
  expect(crossed(0, 49)).toBe(0)
  expect(crossed(0, 50)).toBe(50)
  expect(crossed(0, 83)).toBe(80)
  expect(crossed(80, 90)).toBe(0)
  expect(crossed(80, 96)).toBe(95)
  expect(crossed(95, 100)).toBe(0)
})

test('a window stays the same while its reset time drifts a little', () => {
  expect(sameWindow(RESET, '2026-11-09T16:04:00Z')).toBe(true)
  expect(sameWindow(RESET, '2026-11-09T21:00:00Z')).toBe(false)
})

test('one toast per level, none repeated, a new window starts over', async ($, on) => {
  const toasts = seed(on)
  await $.session.measure(measure(30) as any)
  expect(toasts).toHaveLength(0)

  await $.session.measure(measure(52) as any)
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toContain('Лимит на 5 часов: потрачено 52%')
  expect(toasts[0]).toContain('сброс через 2 ч 0 мин')

  // the same level again, a few minutes' drift in the reset time: no new toast
  await $.session.measure(measure(60, '2026-11-09T16:03:00Z') as any)
  expect(toasts).toHaveLength(1)

  // jumping straight past 80 and 95 warns once, for the higher level
  await $.session.measure(measure(97) as any)
  expect(toasts).toHaveLength(2)
  expect(toasts[1]).toContain('97%')

  // the next window: starts over
  await $.session.measure(measure(55, '2026-11-09T21:00:00Z') as any)
  expect(toasts).toHaveLength(3)
})

test('no reading: grey bar and a dash, never a full green bar', async ($, on) => {
  seed(on)
  const ui = await $.ui.mount({ ...FOOTER, surface: 'desktop' } as any)
  expect(await ui.find({ type: 'Text', text: '—' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\d+%/ })).toBeUndefined()
  await ui.unmount()
})

test('a narrow window stacks the card columns', async ($, on) => {
  const { clock } = seed(on)
  on('state.get', (_: any, e: any, next: any) =>
    e.key === 'snap'
      ? { value: { value: { tokens: 1000, window: 200000, percent: 1, five: { used: 10, resetsAt: RESET }, week: null }, version: 1 } }
      : next(e),
  )
  on('ui.render', { component: 'AbovePrompt' }, ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine band</Text>
  })
  const footer = await $.ui.mount({ ...FOOTER, surface: 'desktop' } as any)
  const band = await $.ui.mount({ plugin: 'footer-ag', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 60 }, surface: 'desktop' } as any)
  await footer.press({ key: 'footer-ag-info' } as any)
  await clock.advance(600)
  const card: any = await band.find({ key: 'footer-ag-card' })
  const columns = (card?.children ?? []).find((c: any) => c && typeof c === 'object' && c.type === 'Box')
  expect(columns?.props?.flexDirection).toBe('column')
  await footer.unmount()
  await band.unmount()
})
