let enabled = false

export function setDebugEnabled(v: boolean): void {
  enabled = v
}

export function dbg(...args: unknown[]): void {
  if (enabled) console.log('[SilentGuard]', ...args)
}