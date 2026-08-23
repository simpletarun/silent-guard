// Word-boundary-safe truncation for clause previews. Cutting at raw
// character offsets produced previews like "tent like ChatGPT..." that
// start mid-word.
export function cleanExcerpt(text: string, maxLen: number): string {
  const t = (text || '').replace(/\s+/g, ' ').trim()
  if (t.length <= maxLen) return t
  let cut = t.slice(0, maxLen)
  // Snap back to the last word edge inside the window; fall back to the
  // window itself when the first word alone exceeds maxLen.
  const lastSpace = cut.lastIndexOf(' ')
  if (lastSpace > 0) cut = cut.slice(0, lastSpace)
  return `${cut.trimEnd()} …`
}
