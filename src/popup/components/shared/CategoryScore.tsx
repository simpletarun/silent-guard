
import { CategoryScore as CategoryScoreType } from '../../../types'

interface Props {
  score?: CategoryScoreType | null
  size?: 'small' | 'medium' | 'large'
}

function getScoreColor(s: number): string {
  if (s >= 80) return '#2ed573'
  if (s >= 60) return '#ffa502'
  if (s >= 40) return '#ff6348'
  return '#ff4757'
}

function getScoreLabel(s: number): string {
  if (s >= 80) return 'Good'
  if (s >= 60) return 'Fair'
  if (s >= 40) return 'Poor'
  return 'Critical'
}

function getScoreBg(s: number): string {
  if (s >= 80) return 'rgba(46,213,115,0.08)'
  if (s >= 60) return 'rgba(255,165,2,0.08)'
  if (s >= 40) return 'rgba(255,99,72,0.08)'
  return 'rgba(255,71,87,0.08)'
}

export default function CategoryScore({ score, size = 'medium' }: Props) {
  const safe = score || { total: 50, maxScore: 100, factors: [] }
  const pct = safe.maxScore > 0 ? (safe.total / safe.maxScore) * 100 : 0
  const color = getScoreColor(safe.total)
  const label = getScoreLabel(safe.total)
  const bg = getScoreBg(safe.total)

  const dim = size === 'small' ? 52 : size === 'large' ? 100 : 76
  const strokeW = size === 'small' ? 3.5 : size === 'large' ? 6 : 4.5
  const radius = (dim - strokeW) / 2
  const circ = 2 * Math.PI * radius
  const offset = circ - (pct / 100) * circ

  return (
    <div className={`cat-score cat-score-${size}`}>
      <div className="cat-score-ring" style={{ width: dim, height: dim }}>
        <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`}>
          <circle cx={dim / 2} cy={dim / 2} r={radius} fill={bg} stroke="var(--border)" strokeWidth={strokeW} />
          <circle
            cx={dim / 2} cy={dim / 2} r={radius}
            fill="none" stroke={color} strokeWidth={strokeW}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${dim / 2} ${dim / 2})`}
            style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.3s ease' }}
          />
        </svg>
        <div className="cat-score-value">
          <span className="cat-score-number" style={{ color, fontSize: size === 'small' ? 13 : size === 'large' ? 28 : 21 }}>
            {safe.total}
          </span>
        </div>
      </div>
      <div className="cat-score-info">
        <span className="cat-score-label" style={{ color, fontSize: size === 'small' ? 10 : size === 'large' ? 15 : 13 }}>
          {label}
        </span>
      </div>
      {size !== 'small' && safe.factors.length > 0 && (
        <div className="cat-score-factors">
          {safe.factors.map((f, i) => (
            <div key={i} className="cat-factor-row">
              <span className="cat-factor-label">{f.label}</span>
              <span className={`cat-factor-value ${f.type}`}>
                {f.score > 0 ? `+${f.score}` : f.score}
              </span>
            </div>
          ))}
        </div>
      )}
      <style>{`
        .cat-score { display: flex; flex-direction: column; align-items: center; gap: 5px; }
        .cat-score-ring { position: relative; flex-shrink: 0; }
        .cat-score-value {
          position: absolute; top: 50%; left: 50%;
          transform: translate(-50%, -50%); text-align: center;
          line-height: 1;
        }
        .cat-score-number { font-weight: 800; line-height: 1; letter-spacing: -0.5px; }
        .cat-score-label { font-weight: 700; letter-spacing: 0.3px; }
        .cat-score-factors { width: 100%; border-top: 1px solid var(--border); padding-top: 8px; margin-top: 6px; }
        .cat-factor-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 10px; }
        .cat-factor-label { color: var(--text-secondary); flex: 1; }
        .cat-factor-value { font-weight: 700; margin-left: 8px; }
        .cat-factor-value.positive { color: var(--success); }
        .cat-factor-value.negative { color: var(--danger); }
      `}</style>
    </div>
  )
}
