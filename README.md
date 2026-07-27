# Session Guardian 🔒

A Chrome extension that monitors browser sessions for security threats in real time. Detects session hijacking, cookie theft, fingerprinting, phishing, DNS inconsistencies, and more.

## Features

- **Session Hijack Detection** — monitors auth cookies on high-value domains (secure/httpOnly flags) and cross-references IP changes
- **Cookie Security** — detects auth cookie changes, missing secure flags, and insecure sameSite settings
- **Fingerprinting Detection** — hooks canvas, AudioContext, WebRTC APIs to detect fingerprinting attempts; monitors screen/timezone/UA for changes
- **Phishing Detection** — checks URLs against OpenPhish and PhishTank feeds
- **DNS Consistency Check** — compares DNS resolutions across Cloudflare, Google, and doh.li resolvers
- **Certificate Monitoring** — queries crt.sh for recent certificate transparency logs on high-value domains
- **Network Security** — monitors IP changes, VPN/proxy/TOR detection via IP geolocation
- **Extension Risk Scanning** — evaluates installed extensions for dangerous permissions
- **Security Headers** — checks HTTP responses for HSTS, CSP, XFO, XSS, Referrer-Policy, Permissions-Policy headers
- **Threat Intel** — checks domains against URLHaus and AlienVault OTX APIs
- **Anomaly Detection** — heuristic analysis of browsing patterns (unusual hours, tab spikes, new domain bursts)
- **Correlation Engine** — cross-correlates events across categories using pattern-matching rules
- **Tracker Detection** — identifies 78+ known tracker domains, tracking pixels, hidden elements, and storage tracking keys
- **URL Cleaner** — strips 35+ tracking parameters from URLs
- **Session Auto-Kill** — clears cookies and opens logout URLs for compromised services
- **Forensic Snapshots** — captures tabs, extensions, cookies, network state, and fingerprint during incidents
- **Weekly Digest** — timeline of security events with score trends and recommendations

## Installation

```bash
git clone https://github.com/simpletarun/session-guardian.git
cd session-guardian
npm install
npm run build
```

Load in Chrome: `chrome://extensions` → Developer mode → Load unpacked → select `dist/`

## Usage

Click the toolbar icon to open the popup. Seven category dashboards:

| Tab | What it shows |
|-----|--------------|
| Overview | Overall score, correlated incidents, timeline, weekly digests |
| Network | IP, VPN status, DNS results, cert checks, threat intel matches |
| Device | Browser fingerprint stats, anomaly events |
| Extensions | Installed extension risk levels |
| Passwords | Password strength indicators |
| Privacy | Trackers found, phishing results, security headers |
| Accounts | Tracked accounts, cookie changes, session events |

## Architecture

```
src/
├── background/          # Service worker
│   ├── index.ts         # Message router, alarms, lifecycle
│   ├── engine.ts        # Scoring engine (7 categories, 0-100)
│   ├── storage.ts       # Chrome storage state management
│   ├── notifications.ts # Chrome notification dispatcher
│   ├── badge.ts         # Toolbar badge (score / alert count)
│   └── monitors/        # 15 security monitors
├── content/             # Page scanners (trackers, fingerprinting, URL cleaner)
├── popup/               # React 18 SPA popup (520-600px)
├── types/               # TypeScript definitions
└── utils/               # Shared utilities
```

## Tech Stack

Chrome Extension MV3 · React 18 · TypeScript · Webpack 5

## License

MIT
