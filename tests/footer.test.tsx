import { test, expect, mock } from 'claude-code/testing'
import { fade, ruNum } from '../hooks/register'

const NOW = Date.parse('2026-11-08T00:00:00Z')
const SNAP = {
  tokens: 184000,
  window: 1000000,
  percent: 18,
  five: { used: 14, resetsAt: '2026-11-08T03:55:00Z' },
  week: { used: 7, resetsAt: '2026-11-09T23:00:00Z' },
}
const FOOTER = { plugin: 'footer-ag', component: 'SessionMode', props: { modes: [] } } as const
const BAND = { plugin: 'footer-ag', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100 } } as const
const HINT = { plugin: 'footer-ag', component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } } as const

// stands for the engine and the person's earlier sessions: a clock the test moves, a stored reading, the engine's drawings
function seed(on: any) {
  const clock = mock.clock(on, { now: NOW })
  on('state.get', (_: any, e: any, next: any) =>
    e.key === 'snap' ? { value: { value: SNAP, version: 1 } } : next(e),
  )
  on('ui.render', { component: 'SessionMode' }, ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>mode</Text>
  })
  on('ui.render', { component: 'AbovePrompt' }, ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine band</Text>
  })
  on('ui.render', { component: 'PromptHint' }, ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })
  return clock
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: footer = live values + ⓘ, nothing else`, async ($, on) => {
    seed(on)
    const ui = await $.ui.mount({ ...FOOTER, surface })
    expect(await ui.find({ type: 'Text', text: /14%/ })).toBeDefined()
    expect(String((await ui.find({ key: 'footer-ag-info' }))?.props.label)).toContain('ⓘ')
    expect(await ui.find({ type: 'Text', text: /лимит|потрачено|токен|сброс/i })).toBeUndefined()
    await ui.unmount()
  })

  test(`${surface}: ⓘ unfolds the card above the prompt row by row, «Скрыть» folds it away`, async ($, on) => {
    const clock = seed(on)
    const footer = await $.ui.mount({ ...FOOTER, surface })
    const band = await $.ui.mount({ ...BAND, surface } as any)
    const below = await $.ui.mount({ ...HINT, surface } as any)

    // closed: the band is left to the engine
    expect(await band.find({ key: 'footer-ag-card' })).toBeUndefined()

    await footer.press({ key: 'footer-ag-info' } as any)
    expect(String((await footer.find({ key: 'footer-ag-info' }))?.props.label)).toContain('✕')

    // one frame in: the headings are sliding in, the reset times not yet
    await clock.advance(30)
    let card = await band.find({ key: 'footer-ag-card' })
    expect(card?.text).toContain('5-часовой лимит')
    expect(card?.text).not.toContain('сбросится через')

    // half a second later: fully open
    await clock.advance(600)
    card = await band.find({ key: 'footer-ag-card' })
    expect(card?.text).toContain('Недельный лимит')
    expect(card?.text).toContain('потрачено 14%')
    expect(card?.text).toContain('сбросится через 3 ч 55 мин')
    expect(card?.text).toContain('184 тыс. из 1 млн токенов')
    expect(card?.text.includes('▃')).toBe(false) // no bar: it must not look like the footer

    await band.press({ key: 'footer-ag-close' } as any)
    expect(String((await footer.find({ key: 'footer-ag-info' }))?.props.label)).toContain('ⓘ')
    await clock.advance(300)
    expect(await band.find({ key: 'footer-ag-card' })).toBeUndefined()
    // the band is the engine's again, and nothing was ever drawn under the prompt
    expect(await band.find({ type: 'Text', text: 'engine band' })).toBeDefined()
    expect(await below.find({ key: 'footer-ag-card' })).toBeUndefined()

    await footer.unmount()
    await band.unmount()
    await below.unmount()
  })
}

test('ⓘ pressed again mid-way folds it back', async ($, on) => {
  const clock = seed(on)
  const footer = await $.ui.mount({ ...FOOTER, surface: 'desktop' })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' } as any)
  await footer.press({ key: 'footer-ag-info' } as any)
  await clock.advance(70)
  await footer.press({ key: 'footer-ag-info' } as any)
  await clock.advance(300)
  expect(await band.find({ key: 'footer-ag-card' })).toBeUndefined()
  await footer.unmount()
  await band.unmount()
})

test('the card yields the band to a survey', async ($, on) => {
  const clock = seed(on)
  const footer = await $.ui.mount({ ...FOOTER, surface: 'desktop' })
  await footer.press({ key: 'footer-ag-info' } as any)
  await clock.advance(600)
  const band = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true }, surface: 'desktop' } as any)
  expect(await band.find({ key: 'footer-ag-card' })).toBeUndefined()
  await band.unmount()
  await footer.unmount()
})

test('fade runs from the background to the colour', () => {
  expect(fade('#22e5f0', 0)).toBe('#1e1e1e')
  expect(fade('#22e5f0', 1)).toBe('#22e5f0')
})

test('numbers in words', () => {
  expect(ruNum(184000)).toBe('184 тыс.')
  expect(ruNum(1000000)).toBe('1 млн')
  expect(ruNum(1500000)).toBe('1.5 млн')
})
