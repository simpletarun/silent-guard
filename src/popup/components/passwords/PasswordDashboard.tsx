import React from 'react'
import { useToast, default as ToastBar } from '../shared/Toast'

import { AMBIGUOUS, LOWERS, UPPERS, DIGITS, SYMBOLS, CONSONANTS, VOWELS, WORDS, UNIQUE_WORD_COUNT } from '../../utils/passwordConstants'

function shuffle(s: string): string {
  const a = s.split('')
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]
  }
  return a.join('')
}

function pickFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
function pickChar(s: string): string {
  return s[Math.floor(Math.random() * s.length)]
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function generateRandom(length: number, useUpper: boolean, useDigits: boolean, useSymbols: boolean, excludeAmbiguous: boolean, minUpper: number, minDigits: number, minSymbols: number): string {
  let lowers = LOWERS, uppers = UPPERS, digits = DIGITS, symbols = SYMBOLS
  if (excludeAmbiguous) {
    for (const c of AMBIGUOUS) {
      lowers = lowers.replace(c, ''); uppers = uppers.replace(c, ''); digits = digits.replace(c, '')
    }
  }
  const chars: string[] = []
  for (let i = 0; i < minUpper && useUpper; i++) chars.push(pickChar(uppers))
  for (let i = 0; i < minDigits && useDigits; i++) chars.push(pickChar(digits))
  for (let i = 0; i < minSymbols && useSymbols; i++) chars.push(pickChar(symbols))
  let pool = lowers
  if (useUpper) pool += uppers
  if (useDigits) pool += digits
  if (useSymbols) pool += symbols
  if (!pool) return ''
  while (chars.length < length) chars.push(pickChar(pool))
  return shuffle(chars.join(''))
}

function generatePassphrase(wordCount: number, separator: string, capitalize: boolean): string {
  const words: string[] = []
  for (let i = 0; i < wordCount; i++) {
    let w = pickFrom(WORDS)
    if (capitalize) w = w.charAt(0).toUpperCase() + w.slice(1)
    words.push(w)
  }
  return words.join(separator)
}

function generatePronounceable(syllables: number): string {
  let result = ''
  for (let i = 0; i < syllables; i++) {
    if (i > 0 && Math.random() < 0.3) result += pickChar(CONSONANTS)
    result += pickChar(CONSONANTS) + pickChar(VOWELS)
    if (Math.random() < 0.6) result += pickChar(CONSONANTS)
  }
  return result
}

function estimateEntropy(pw: string): number {
  let pool = 0
  if (/[a-z]/.test(pw)) pool += 26
  if (/[A-Z]/.test(pw)) pool += 26
  if (/\d/.test(pw)) pool += 10
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 22
  if (pool === 0) return 0
  return Math.round(pw.length * Math.log2(pool))
}

function estimatePassphraseEntropy(wordCount: number): number {
  return Math.round(wordCount * Math.log2(UNIQUE_WORD_COUNT))
}

function strengthFromEntropy(e: number): { label: string; color: string } {
  if (e >= 80) return { label: 'Strong', color: 'var(--success)' }
  if (e >= 60) return { label: 'Good', color: 'var(--warning)' }
  if (e >= 40) return { label: 'Fair', color: 'var(--accent)' }
  return { label: 'Weak', color: 'var(--danger)' }
}

type GenMode = 'random' | 'passphrase' | 'pronounceable'

export default function PasswordDashboard({}: Record<string, never>) {
  const { toasts, show } = useToast()

  const [mode, setMode] = React.useState<GenMode>('random')

  const [pwLength, setPwLength] = React.useState(20)
  const [pwUpper, setPwUpper] = React.useState(true)
  const [pwDigits, setPwDigits] = React.useState(true)
  const [pwSymbols, setPwSymbols] = React.useState(true)
  const [excludeAmbiguous, setExcludeAmbiguous] = React.useState(true)
  const [minUpper, setMinUpper] = React.useState(1)
  const [minDigits, setMinDigits] = React.useState(1)
  const [minSymbols, setMinSymbols] = React.useState(1)

  const [wordCount, setWordCount] = React.useState(5)
  const [separator, setSeparator] = React.useState('-')
  const [capitalize, setCapitalize] = React.useState(false)

  const [syllables, setSyllables] = React.useState(4)

  const [passwords, setPasswords] = React.useState<string[]>([])
  const [count, setCount] = React.useState(3)
  const [copiedIndex, setCopiedIndex] = React.useState(-1)
  const copiedTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    }
  }, [])

  const canGenerate = mode === 'random' ? (pwUpper || pwDigits || pwSymbols) : true

  const handleGenerate = () => {
    const list: string[] = []
    for (let i = 0; i < count; i++) {
      let pw: string
      if (mode === 'passphrase') {
        pw = generatePassphrase(wordCount, separator, capitalize)
      } else if (mode === 'pronounceable') {
        pw = generatePronounceable(syllables)
      } else {
        if (!canGenerate) return
        pw = generateRandom(pwLength, pwUpper, pwDigits, pwSymbols, excludeAmbiguous, minUpper, minDigits, minSymbols)
      }
      list.push(pw && pw.length > 0 ? pw : '')
    }
    setPasswords(list)
    setCopiedIndex(-1)
  }

  const handleCopy = async (pw: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(pw)
      setCopiedIndex(idx)
      show('Copied to clipboard', 'success')
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = setTimeout(() => {
        copiedTimerRef.current = null
        setCopiedIndex(-1)
      }, 2000)
    } catch {
      show('Failed to copy', 'error')
    }
  }

  const handleRefresh = () => {
    if (passwords.length > 0) handleGenerate()
  }

  const renderEntropy = (pw: string, idx: number) => {
    const ent = mode === 'passphrase' ? estimatePassphraseEntropy(wordCount) : estimateEntropy(pw)
    const st = strengthFromEntropy(ent)
    return { ent, st }
  }

  return (
    <div className="cat-dashboard">
      <ToastBar toasts={toasts} />
      <div className="card">
        <div className="card-title">
          <span className="pwgen-title-icon">🔑</span>
          Password Generator
        </div>

        <div className="pwgen-mode-tabs">
          {(['random', 'passphrase', 'pronounceable'] as const).map(m => (
            <button key={m} className={`pwgen-mode-tab ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>
              {m === 'random' ? 'Random' : m === 'passphrase' ? 'Passphrase' : 'Pronounceable'}
            </button>
          ))}
        </div>

        {passwords.length > 0 && (
          <div className="pwgen-list">
            {passwords.map((pw, i) => {
              const { ent, st } = renderEntropy(pw, i)
              return (
                <div key={i} className="pwgen-list-item">
                  <div className="pwgen-list-top">
                    <span className="pwgen-list-pw">{pw}</span>
                    <button className="pwgen-list-copy" onClick={() => handleCopy(pw, i)} title="Copy">
                      {copiedIndex === i ? (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M2 7l3 3 7-7" stroke="var(--success)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                          <rect x="4" y="4" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                          <path d="M12 4V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h1" stroke="currentColor" strokeWidth="1.3" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <div className="pwgen-list-bar-wrap">
                    <div className="pwgen-list-bar" style={{ width: `${Math.min(ent, 128) / 128 * 100}%`, background: st.color }} />
                  </div>
                  <div className="pwgen-list-meta">
                    <span className="pwgen-list-strength" style={{ color: st.color }}>{st.label}</span>
                    <span className="pwgen-list-entropy">{ent} bits</span>
                  </div>
                </div>
              )
            })}
            <button className="pwgen-reroll" onClick={handleRefresh}>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M12 7a5 5 0 1 1-5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M12 3V1h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Re-roll
            </button>
          </div>
        )}

        {passwords.length === 0 && (
          <div className="pwgen-empty">
            <div className="pwgen-empty-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="11" width="18" height="10" rx="2" stroke="var(--text-muted)" strokeWidth="1.5" />
                <circle cx="12" cy="16" r="1.5" fill="var(--text-muted)" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="pwgen-empty-text">Configure options and generate</p>
          </div>
        )}

        <div className="pwgen-divider" />
        <div className="pwgen-section">
          <div className="pwgen-section-label">Options</div>

          <div className="pwgen-option">
            <div className="pwgen-option-header">
              <span className="pwgen-option-name">{mode === 'passphrase' ? 'Words' : mode === 'pronounceable' ? 'Syllables' : 'Length'}</span>
              <span className="pwgen-option-value">
                {mode === 'passphrase' ? wordCount : mode === 'pronounceable' ? syllables : pwLength}
              </span>
            </div>
            <input type="range"
              min={mode === 'pronounceable' ? 2 : mode === 'passphrase' ? 3 : 6}
              max={mode === 'pronounceable' ? 10 : mode === 'passphrase' ? 12 : 64}
              value={mode === 'passphrase' ? wordCount : mode === 'pronounceable' ? syllables : pwLength}
              onChange={e => {
                const v = Number(e.target.value)
                if (mode === 'passphrase') setWordCount(v)
                else if (mode === 'pronounceable') setSyllables(v)
                else setPwLength(v)
              }}
              className="pwgen-slider" />
          </div>

          <div className="pwgen-option">
            <div className="pwgen-option-header">
              <span className="pwgen-option-name">Passwords to generate</span>
              <span className="pwgen-option-value">{count}</span>
            </div>
            <input type="range" min="1" max="10" value={count} onChange={e => setCount(Number(e.target.value))} className="pwgen-slider" />
          </div>

          {mode === 'random' && (
            <>
              <div className="pwgen-toggles">
                <label className={`pwgen-toggle ${pwUpper ? 'active' : ''}`}>
                  <input type="checkbox" checked={pwUpper} onChange={e => setPwUpper(e.target.checked)} />
                  <span className="pwgen-toggle-indicator" />
                  <span className="pwgen-toggle-text">A–Z</span>
                </label>
                <label className={`pwgen-toggle ${pwDigits ? 'active' : ''}`}>
                  <input type="checkbox" checked={pwDigits} onChange={e => setPwDigits(e.target.checked)} />
                  <span className="pwgen-toggle-indicator" />
                  <span className="pwgen-toggle-text">0–9</span>
                </label>
                <label className={`pwgen-toggle ${pwSymbols ? 'active' : ''}`}>
                  <input type="checkbox" checked={pwSymbols} onChange={e => setPwSymbols(e.target.checked)} />
                  <span className="pwgen-toggle-indicator" />
                  <span className="pwgen-toggle-text">!@#</span>
                </label>
                <label className={`pwgen-toggle ${excludeAmbiguous ? 'active' : ''}`}>
                  <input type="checkbox" checked={excludeAmbiguous} onChange={e => setExcludeAmbiguous(e.target.checked)} />
                  <span className="pwgen-toggle-indicator" />
                  <span className="pwgen-toggle-text">No Ambiguous</span>
                </label>
              </div>
              <div className="pwgen-min-grid">
                <div className="pwgen-min-item">
                  <label className="pwgen-min-label">Min A–Z</label>
                  <div className="pwgen-min-stepper">
                    <button className="pwgen-step-btn" onClick={() => setMinUpper(Math.max(0, minUpper - 1))} disabled={!pwUpper}>–</button>
                    <span className="pwgen-min-value">{pwUpper ? minUpper : 0}</span>
                    <button className="pwgen-step-btn" onClick={() => setMinUpper(Math.min(8, minUpper + 1))} disabled={!pwUpper}>+</button>
                  </div>
                </div>
                <div className="pwgen-min-item">
                  <label className="pwgen-min-label">Min 0–9</label>
                  <div className="pwgen-min-stepper">
                    <button className="pwgen-step-btn" onClick={() => setMinDigits(Math.max(0, minDigits - 1))} disabled={!pwDigits}>–</button>
                    <span className="pwgen-min-value">{pwDigits ? minDigits : 0}</span>
                    <button className="pwgen-step-btn" onClick={() => setMinDigits(Math.min(8, minDigits + 1))} disabled={!pwDigits}>+</button>
                  </div>
                </div>
                <div className="pwgen-min-item">
                  <label className="pwgen-min-label">Min !@#</label>
                  <div className="pwgen-min-stepper">
                    <button className="pwgen-step-btn" onClick={() => setMinSymbols(Math.max(0, minSymbols - 1))} disabled={!pwSymbols}>–</button>
                    <span className="pwgen-min-value">{pwSymbols ? minSymbols : 0}</span>
                    <button className="pwgen-step-btn" onClick={() => setMinSymbols(Math.min(8, minSymbols + 1))} disabled={!pwSymbols}>+</button>
                  </div>
                </div>
              </div>
            </>
          )}

          {mode === 'passphrase' && (
            <div className="pwgen-pass-opts">
              <div className="pwgen-option">
                <label className="pwgen-opt-label">Separator</label>
                <div className="pwgen-sep-btns">
                  {['-', '_', '.', ' ', '#'].map(s => (
                    <button key={s} className={`pwgen-sep-btn ${separator === s ? 'active' : ''}`} onClick={() => setSeparator(s)}>
                      {s === ' ' ? '␣' : s === '#' ? '#' : s}
                    </button>
                  ))}
                  <input className="pwgen-sep-input" value={separator} onChange={e => setSeparator(e.target.value || '-')} maxLength={2} />
                </div>
              </div>
              <label className={`pwgen-toggle ${capitalize ? 'active' : ''}`} style={{ alignSelf: 'flex-start' }}>
                <input type="checkbox" checked={capitalize} onChange={e => setCapitalize(e.target.checked)} />
                <span className="pwgen-toggle-indicator" />
                <span className="pwgen-toggle-text">Capitalize each word</span>
              </label>
            </div>
          )}

          {mode === 'pronounceable' && (
            <p className="pwgen-mode-hint">Generates consonant-vowel syllable passwords that are easy to remember</p>
          )}

          <button className="pwgen-generate-btn" onClick={handleGenerate} disabled={!canGenerate}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M12 7a5 5 0 1 1-5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M12 3V1h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Generate {count > 1 ? `${count} Passwords` : 'Password'}
          </button>
        </div>
      </div>



      <style>{`
        .pwgen-title-icon { margin-right: 6px; }
        .pwgen-empty { text-align: center; padding: 24px 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .pwgen-empty-icon { opacity: 0.35; }
        .pwgen-empty-text { font-size: 12px; color: var(--text-muted); margin: 0; }

        .pwgen-mode-tabs { display: flex; gap: 4px; margin-bottom: 10px; background: var(--bg-surface); border-radius: var(--radius-sm); padding: 3px; }
        .pwgen-mode-tab {
          flex: 1; padding: 6px 0; border: none; border-radius: 4px;
          font-size: 11px; font-weight: 600; font-family: inherit;
          cursor: pointer; transition: 0.2s; color: var(--text-muted);
          background: none;
        }
        .pwgen-mode-tab.active { background: var(--bg-card); color: var(--accent); box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

        .pwgen-list { display: flex; flex-direction: column; gap: 8px; margin: 6px 0 4px; }
        .pwgen-list-item {
          background: var(--bg-surface); border: 1px solid var(--border);
          border-radius: var(--radius-sm); padding: 10px 12px;
          animation: slideUp 0.2s ease;
        }
        .pwgen-list-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
        .pwgen-list-pw { font-family: 'JetBrains Mono', monospace; font-size: 13px; letter-spacing: 0.5px; color: var(--text-primary); word-break: break-all; }
        .pwgen-list-copy { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; border-radius: 4px; flex-shrink: 0; transition: 0.15s; display: flex; }
        .pwgen-list-copy:hover { background: var(--bg-card-hover); }
        .pwgen-list-bar-wrap { height: 3px; background: var(--bg-card); border-radius: 4px; overflow: hidden; margin-bottom: 4px; }
        .pwgen-list-bar { height: 100%; border-radius: 4px; transition: width 0.3s ease, background 0.3s ease; }
        .pwgen-list-meta { display: flex; justify-content: space-between; align-items: center; }
        .pwgen-list-strength { font-size: 10px; font-weight: 700; }
        .pwgen-list-entropy { font-size: 9px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; }

        .pwgen-reroll {
          display: flex; align-items: center; justify-content: center; gap: 5px;
          width: 100%; padding: 7px; margin-top: 2px;
          background: var(--bg-surface); border: 1px dashed var(--border);
          border-radius: var(--radius-sm); color: var(--text-muted);
          font-size: 11px; font-weight: 500; font-family: inherit;
          cursor: pointer; transition: var(--transition);
        }
        .pwgen-reroll:hover { border-color: var(--accent); color: var(--accent); }

        .pwgen-divider { height: 1px; background: var(--border); margin: 14px 0 10px; }
        .pwgen-section { display: flex; flex-direction: column; gap: 12px; }
        .pwgen-section-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-muted); }

        .pwgen-option { display: flex; flex-direction: column; gap: 4px; }
        .pwgen-option-header { display: flex; justify-content: space-between; align-items: center; }
        .pwgen-option-name { font-size: 12px; font-weight: 500; color: var(--text-secondary); }
        .pwgen-option-value { font-size: 13px; font-weight: 700; color: var(--accent); font-family: 'JetBrains Mono', monospace; }
        .pwgen-slider { width: 100%; height: 4px; appearance: none; background: var(--bg-surface); border-radius: 4px; outline: none; cursor: pointer; }
        .pwgen-slider::-webkit-slider-thumb { appearance: none; width: 16px; height: 16px; border-radius: 50%; background: var(--accent); border: 2px solid var(--bg-card); box-shadow: 0 1px 4px rgba(0,0,0,0.2); cursor: pointer; transition: 0.15s; }
        .pwgen-slider::-webkit-slider-thumb:hover { transform: scale(1.15); }

        .pwgen-toggles { display: flex; gap: 6px; flex-wrap: wrap; }
        .pwgen-toggle { display: flex; align-items: center; gap: 5px; padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-surface); cursor: pointer; transition: var(--transition); user-select: none; }
        .pwgen-toggle.active { border-color: var(--accent); background: var(--accent-bg); }
        .pwgen-toggle input { display: none; }
        .pwgen-toggle-indicator { width: 7px; height: 7px; border-radius: 2px; background: var(--border); transition: 0.2s; }
        .pwgen-toggle.active .pwgen-toggle-indicator { background: var(--accent); }
        .pwgen-toggle-text { font-size: 10px; font-weight: 500; color: var(--text-secondary); white-space: nowrap; }
        .pwgen-toggle.active .pwgen-toggle-text { color: var(--accent); }

        .pwgen-min-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
        .pwgen-min-item { display: flex; flex-direction: column; gap: 4px; }
        .pwgen-min-label { font-size: 9px; color: var(--text-muted); text-align: center; }
        .pwgen-min-stepper { display: flex; align-items: center; justify-content: center; gap: 4px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 4px; }
        .pwgen-min-value { font-size: 13px; font-weight: 700; color: var(--accent); font-family: 'JetBrains Mono', monospace; min-width: 14px; text-align: center; }
        .pwgen-step-btn { width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; background: var(--bg-card); border: 1px solid var(--border); border-radius: 4px; color: var(--text-secondary); font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer; transition: 0.15s; }
        .pwgen-step-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
        .pwgen-step-btn:disabled { opacity: 0.3; cursor: not-allowed; }

        .pwgen-pass-opts { display: flex; flex-direction: column; gap: 10px; }
        .pwgen-opt-label { font-size: 11px; font-weight: 500; color: var(--text-secondary); }
        .pwgen-sep-btns { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
        .pwgen-sep-btn { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 4px; color: var(--text-secondary); font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.15s; }
        .pwgen-sep-btn.active { border-color: var(--accent); color: var(--accent); background: var(--accent-bg); }
        .pwgen-sep-input { width: 36px; height: 28px; text-align: center; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); font-size: 13px; font-family: inherit; outline: none; }
        .pwgen-sep-input:focus { border-color: var(--accent); }

        .pwgen-mode-hint { font-size: 10px; color: var(--text-muted); font-style: italic; margin: 0; }

        .pwgen-generate-btn { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; padding: 11px; border: none; border-radius: var(--radius); font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer; color: white; background: linear-gradient(135deg, var(--accent), #3a6bdf); box-shadow: 0 2px 8px var(--accent-glow); transition: var(--transition); }
        .pwgen-generate-btn:hover { background: linear-gradient(135deg, var(--accent-hover), #2d5bcf); }
        .pwgen-generate-btn:active { transform: scale(0.97); }
        .pwgen-generate-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  )
}
