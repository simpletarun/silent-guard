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

### Version
- Updated to v1.1.2
