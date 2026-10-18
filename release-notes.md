## What's Changed (v1.1.3)

### Fixes
- **Fix: downloaded source ZIP had no build to load.** `dist/` was gitignored, so `Code → Download ZIP` contained source only and could not be loaded in Chrome. The built `dist/` is now committed, so a fresh source download includes a ready-to-load extension. Release assets continue to ship `silent-guard-1.1.3-dist.zip` (build only).

### Version
- Updated to v1.1.3

---

## What's Changed

### Features
- **Extension Search**: Added search box to All Installed Extensions dashboard for quick filtering by extension name
- **ASN Display**: Network info now shows Autonomous System Number for better cloud/CDN identification

### Bug Fixes
- **Fix: ISP/Location stuck at "Unknown"**. The network monitor rewrites geo enrichment around four free, keyless HTTPS providers (ipwho.is → ipapi.co → ip.sb → ipinfo.io) with field-level merging — one provider's failure no longer blanks ISP/ASN/city/country. A 6-hour refresh gate keeps the 5-minute alarm from exhausting free API quotas (the old code re-fetched every 5 min, drained the quota, and then showed "Unknown" forever), and geo failures are silent — no more errors spamming the service-worker console.
- **Fix: Download Shield auto-cancel missed already-finished downloads**. A small/fast risky file could complete before Chrome's async danger verdict arrived, making `downloads.cancel` a no-op. When cancel fails on a high/critical download, the file is now removed from disk (Download Shield toggle on).
- **Fix: downloads list pushed a popup scrollbar past ~8 rows**. The Download Shield list is now bounded (240px) and scrolls in place with a styled scrollbar, matching the Who Tracks Me list — the Privacy tab no longer stretches the 600px popup page.
- **Fix: privacy-policy tab auto-opening on every site visit**. The content script auto-reported policy footer links on every page load, which made the background open a policy scrape tab (then close it) for nearly any site you visited. Policy analysis is now request-driven only (popup / "Analyze" button); the passive path only analyzes the page you are actually on, and any remaining scrape tab opens inactive (never steals focus) and auto-closes within seconds or on completion (the `tabHide` permission was dropped — it's not recognized by stable Chrome, so the extension must load without it).
- **Fix: revisits re-scraped policies after every service-worker restart**. Policy cooldowns/attempt-TTLs are now persisted in `chrome.storage.session`, so a 5-minute "one analysis per domain" gate is no longer reset every time the MV3 worker wakes.
- **Fix: threat-intel domains marked as checked before the check succeeded** — a transient URLHaus outage no longer burns the 24h recheck window.
- **Fix: cert monitor queried crt.sh for `chrome://`/new-tab pages** — the http(s) + dot-domain filter now matches the other monitors.
- **Fix: concurrent policy scrapes collapsed into one promise** — scrapes are keyed per URL, so analyzing two sites at once no longer drops one analysis.

### UI Improvements
- Shows 'Cloud/Proxy location limited' instead of just 'Unknown' when VPN/proxy location data unavailable
- Search input with real-time filtering in Extensions tab

### Bug Fixes (four-agent code audit & dead-code cleanup)
- **Fix: "Analyze again" silently no-op'd on any previously-analyzed site.** The cached-report short-circuit made an explicit Analyze click skip probing; it now forces a fresh analysis (`force` flag) while auto-analysis still respects the cache.
- **Fix: a Chrome-dangerous download from a trusted host earned a bogus +1 / "untrusted source domain" penalty** (it also mislabeled the risk), and the disk-cleanup fallback now deletes a finished file only when Chrome itself flagged it — a hostname heuristic alone never destroys a file you deliberately saved.
- **Fix: CLEAR_ALL_DATA could "resurrect" wiped rows.** Phishing results, password strengths and threat-intel matches were read-then-replaced outside the storage mutex; they now write under the mutex, so a wipe landing mid-write stays wiped.
- **Fix: login form memory lost on service-worker restart** — password-form timestamps (used to prove accounts) now persist in `chrome.storage.session`.
- **Fix: notification throttle reset every worker restart** — a page could re-burst notification spam after each wake; the 15-minute throttle now survives restarts.
- **Fix: failed crt.sh fetch burned the 5-minute cert cooldown** — the window is claimed only after a valid response.
- **Fix: shared policy URL skipped analysis for the second domain** — scrape dedupe is keyed by URL *and* domain; the scrape watchdog now closes a stray tab that wins the `tabs.create` race.
- **Fix: hourly timeline alarm re-created on every wake** (reset its period) — now created only when missing.
- **Fix: popup toggles flashed off before settings loaded, and a failed GET_SETTINGS flipped stored values** — settings now initialize with defaults.
- **Fix: Policy page showed no category score header** (the prop was dropped) — restored, matching every other category page.
- **Dead code removed**: `ADD_EVENT` and `GET_POLICY_REPORT` message handlers (no senders), the `forensic_snapshot` event type, unused settings keys (`monitorPasswords`, `monitorPrivacy`, `forensicSnapshots`), `getRiskLevelColor`, a dead `refresh` prop, and two unreferenced CSS classes.

### Version
- Updated to v1.1.2
