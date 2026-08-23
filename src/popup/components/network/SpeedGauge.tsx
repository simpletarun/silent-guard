interface Props {
  value: number
  phase: 'idle' | 'ping' | 'download' | 'upload' | 'done'
}

// Non-linear tick scale, evenly spaced like speedtest.net's gauge
const TICKS = [0, 1, 5, 10, 25, 50, 100, 250, 500]
const R = 80
const CX = 100
const CY = 95
const ARC_LEN = Math.PI * R

function angleFor(v: number): number {
  const clamped = Math.max(TICKS[0], Math.min(TICKS[TICKS.length - 1], v))
  for (let i = 0; i < TICKS.length - 1; i++) {
    if (clamped <= TICKS[i + 1]) {
      const seg = (clamped - TICKS[i]) / (TICKS[i + 1] - TICKS[i])
      return -90 + (180 * (i + seg)) / (TICKS.length - 1)
    }
  }
  return 90
}

const PHASES = [
  { key: 'ping', label: 'PING' },
  { key: 'download', label: 'DOWN' },
  { key: 'upload', label: 'UP' },
] as const

export default function SpeedGauge({ value, phase }: Props) {
  const angle = angleFor(value)
  const frac = (angle + 90) / 180
  const order = ['ping', 'download', 'upload']
  const curIdx = order.indexOf(phase)

  return (
    <div className="speed-gauge">
      <div className="speed-phases">
        {PHASES.map(p => {
          const active = phase === p.key
          const completed = curIdx >= 0 ? order.indexOf(p.key) < curIdx : phase === 'done'
          return (
            <span key={p.key} className={`speed-phase${active ? ' active' : ''}${completed && !active ? ' done' : ''}`}>
              {p.label}
            </span>
          )
        })}
      </div>
      <svg viewBox="0 0 200 115" className="speed-svg">
        <path d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`} fill="none" stroke="var(--border)" strokeWidth="10" strokeLinecap="round" />
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none" stroke="var(--accent)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${ARC_LEN * frac} ${ARC_LEN}`}
        />
        {TICKS.map(t => {
          const a = ((angleFor(t) - 90) * Math.PI) / 180
          const x1 = CX + Math.cos(a) * (R - 14)
          const y1 = CY + Math.sin(a) * (R - 14)
          const x2 = CX + Math.cos(a) * (R - 20)
          const y2 = CY + Math.sin(a) * (R - 20)
          const lx = CX + Math.cos(a) * (R - 30)
          const ly = CY + Math.sin(a) * (R - 30)
          return (
            <g key={t}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--text-muted)" strokeWidth="1.5" />
              <text x={lx} y={ly} fontSize="8" fill="var(--text-muted)" textAnchor="middle">{t}</text>
            </g>
          )
        })}
        <line
          x1={CX} y1={CY}
          x2={CX} y2={CY - R + 16}
          stroke="var(--accent-hover)" strokeWidth="3" strokeLinecap="round"
          transform={`rotate(${angle} ${CX} ${CY})`}
        />
        <circle cx={CX} cy={CY} r="5" fill="var(--accent-hover)" />
        <text x={CX} y={CY - 18} textAnchor="middle" className="speed-value">{value > 0 ? value.toFixed(1) : phase === 'done' ? '—' : '…'}</text>
        <text x={CX} y={CY - 6} textAnchor="middle" className="speed-unit">Mbps</text>
      </svg>
    </div>
  )
}
