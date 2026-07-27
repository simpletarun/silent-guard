
import { CategoryAction } from '../../../types'

interface Props {
  actions: CategoryAction[]
}

export default function CategoryActions({ actions }: Props) {
  const urlActions = actions.filter(a => a.action === 'open_url')
  if (urlActions.length === 0) return null

  return (
    <div className="cat-actions">
      <div className="cat-actions-label">Quick Links</div>
      <div className="cat-actions-grid">
        {urlActions.map(action => (
          <button
            key={action.id}
            className="cat-action-btn cat-action-default"
            onClick={() => { if (action.url) chrome.tabs.create({ url: action.url }).catch(() => {}) }}
            title={action.description}
          >
            <span className="cat-action-icon">{action.icon}</span>
            <span className="cat-action-text">{action.label}</span>
          </button>
        ))}
      </div>
      <style>{`
        .cat-actions { margin-top: 4px; }
        .cat-actions-label {
          font-size: 11px; font-weight: 700; color: var(--text-secondary);
          margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.8px;
        }
        .cat-actions-grid { display: flex; gap: 6px; flex-wrap: wrap; }
        .cat-action-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 8px 14px; border: none; border-radius: var(--radius);
          font-size: 11px; font-weight: 600; font-family: inherit;
          cursor: pointer; transition: var(--transition);
          letter-spacing: 0.2px;
        }
        .cat-action-btn:active { transform: scale(0.96); }
        .cat-action-default {
          background: var(--bg-surface); color: var(--text-secondary);
          border: 1px solid var(--border);
        }
        .cat-action-default:hover {
          background: var(--bg-card-hover); color: var(--text-primary);
          border-color: var(--accent);
        }
        .cat-action-icon { font-size: 13px; line-height: 1; }
        .cat-action-text { line-height: 1; }
      `}</style>
    </div>
  )
}
