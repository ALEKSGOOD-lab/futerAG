export type Limit = { used: number; resetsAt: string | null }
export type View = 'five' | 'week'
export type Snap = { tokens: number; window: number; percent: number; five: Limit | null; week: Limit | null }

declare module 'claude-code' {
  interface PluginState {
    'footer-ag': { snap: Snap; tick: number; view: View; minute: number; open: boolean; reveal: number }
  }
}
