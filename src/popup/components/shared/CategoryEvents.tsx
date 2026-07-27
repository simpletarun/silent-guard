
import { RiskEvent } from '../../../types'

interface Props {
  events: RiskEvent[]
  onAcknowledge?: (id: string) => void
  maxItems?: number
  compact?: boolean
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`
  return d.toLocaleDateString()
}

const severityConfig: Record<string, { icon: string; label: string }> = {
  low: { icon: '●', label: 'Low' },
  medium: { icon: '◆', label: 'Medium' },
  high: { icon: '▲', label: 'High' },
  critical: { icon: '🔴', label: 'Critical' },
}

export default function CategoryEvents({ events, onAcknowledge, maxItems = 10, compact = false }: Props) {
  const display = events.slice(0, maxItems)

  if (display.length === 0) {
    return (
      <div className="cat-events-empty">
        <div className="cat-events-clean-icon">✓</div>
        <p className="cat-events-clean">No recent events</p>
      </div>
    )
  }

  return (
    <div className={`cat-events ${compact ? 'compact' : ''}`}>
      {display.map(event => {
        const cfg = severityConfig[event.severity] || severityConfig.low
        return (
          <div key={event.id} className={`cat-event-item severity-${event.severity} ${event.acknowledged ? 'acknowledged' : ''}`}>
            <div className="cat-event-severity-bar" />
            <div className={`cat-event-icon-wrap severity-${event.severity}`}>
              <span>{cfg.icon}</span>
            </div>
            <div className="cat-event-body">
              <div className="cat-event-header">
                <span className="cat-event-title">{event.title}</span>
                <span className={`badge badge-${event.severity}`}>{cfg.label}</span>
              </div>
              {!compact && <p className="cat-event-desc">{event.description}</p>}
              <div className="cat-event-meta">
                <span className="cat-event-time">{formatTime(event.timestamp)}</span>
                {event.source && <span className="cat-event-source">{event.source}</span>}
              </div>
            </div>
            {!event.acknowledged && onAcknowledge && (
              <button className="cat-event-dismiss" onClick={() => onAcknowledge(event.id)} title="Dismiss">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        )
      })}
      <style>{`
        .cat-events { display: flex; flex-direction: column; gap: 6px; }
        .cat-events.compact .cat-event-item { padding: 8px 10px; }
        .cat-events-empty {
          text-align: center; padding: 20px 12px;
          display: flex; flex-direction: column; align-items: center; gap: 8px;
        }
        .cat-events-clean-icon {
          width: 32px; height: 32px; border-radius: 50%;
          background: var(--success-bg); color: var(--success);
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; font-weight: 700;
        }
        .cat-events-clean { font-size: 11px; color: var(--text-muted); font-weight: 500; margin: 0; }
        .cat-event-item {
          display: flex; gap: 10px; align-items: flex-start;
          background: var(--bg-surface); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 10px 12px;
          position: relative; overflow: hidden;
          transition: var(--transition);
          animation: slideUp 0.2s ease;
        }
        .cat-event-item:hover { border-color: var(--border-light); }
        .cat-event-item.acknowledged { opacity: 0.4; }
        .cat-event-item.acknowledged:hover { opacity: 0.5; }
        .cat-event-severity-bar {
          position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
        }
        .severity-critical .cat-event-severity-bar { background: var(--danger); }
        .severity-high .cat-event-severity-bar { background: #ff6348; }
        .severity-medium .cat-event-severity-bar { background: var(--warning); }
        .severity-low .cat-event-severity-bar { background: var(--success); }
        .cat-event-icon-wrap {
          width: 24px; height: 24px; border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; font-size: 11px;
        }
        .severity-critical .cat-event-icon-wrap { background: var(--critical-bg); }
        .severity-high .cat-event-icon-wrap { background: var(--danger-bg); }
        .severity-medium .cat-event-icon-wrap { background: var(--warning-bg); }
        .severity-low .cat-event-icon-wrap { background: var(--success-bg); }
        .cat-event-body { flex: 1; min-width: 0; }
        .cat-event-header { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
        .cat-event-title { font-size: 11px; font-weight: 600; flex: 1; line-height: 1.3; }
        .cat-event-desc { font-size: 10px; color: var(--text-secondary); line-height: 1.4; margin: 2px 0 0; }
        .cat-event-meta { font-size: 9px; color: var(--text-muted); display: flex; gap: 10px; margin-top: 4px; }
        .cat-event-time { font-weight: 500; }
        .cat-event-source { color: var(--text-muted); }
        .cat-event-dismiss {
          background: var(--bg-card); border: 1px solid var(--border);
          color: var(--text-muted); cursor: pointer;
          width: 22px; height: 22px; border-radius: 6px;
          transition: var(--transition); flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          margin-top: 1px;
        }
        .cat-event-dismiss:hover { background: var(--danger-bg); color: var(--danger); border-color: var(--danger); }
      `}</style>
    </div>
  )
}
