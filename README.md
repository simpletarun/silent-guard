# Session Guardian 🔒

A Chrome extension that monitors browser sessions for security threats in real time. Detects session hijacking, cookie theft, fingerprinting, phishing, DNS poisoning, and more — all powered by an AI-driven correlation engine.

## Features

- **Session Hijack Detection** — monitors login forms, credential fields, and session indicators
- **Cookie Security** — detects auth cookie changes, insecure cookies, and suspicious cookie access
- **Fingerprinting Protection** — detects canvas, AudioContext, and WebRTC fingerprinting attempts
- **Phishing Detection** — checks URLs against OpenPhish and PhishTank feeds
- **DNS Poisoning Check** — compares DNS resolutions across multiple resolvers
- **Certificate Monitoring** — validates TLS certificate chains for visited domains
- **Network Security** — monitors WebRequest patterns, IP changes, and connection anomalies
- **Password Strength** — analyzes form passwords for weakness
- **Extension Monitoring** — detects dangerous or excessive permissions in installed extensions
- **Header Security** — checks for missing security headers (CSP, HSTS, XFO, etc.)
- **Threat Intel** — checks visited domains against known threat databases
- **Anomaly Detection** — ML-based behavioral analysis of browsing patterns
- **Correlation Engine** — cross-correlates events across all security categories
- **Auto-Response** — optionally kills sessions or rotates credentials on critical alerts
- **Forensic Snapshots** — captures page state during security incidents

## Installation

### From Chrome Web Store

*(Coming soon)*

### From Source

```bash
git clone https://github.com/simpletarun/session-guardian.git
cd session-guardian
npm install
npm run build
```

Then load the extension in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder

## Usage

Click the Session Guardian icon in the toolbar to open the popup. The dashboard shows:

- **Overview** — overall security score with correlated incident timeline
- **Network** — IP, DNS, certificate, and WebRequest security
- **Device** — browser fingerprint status and anomaly scores
- **Extensions** — risk assessment of installed extensions
- **Passwords** — password strength analysis and generation
- **Privacy** — tracker detection, phishing results, and header security
- **Accounts** — credential monitoring and session management

Each category displays a score (0–100), recent events, and actionable recommendations.

## Architecture

```
session-guardian/
├── src/
│   ├── background/          # Service worker (persistent)
│   │   ├── index.ts         # Message router, alarms, lifecycle
│   │   ├── engine.ts        # Scoring engine
│   │   ├── storage.ts       # State management
│   │   ├── notifications.ts # Chrome notification dispatcher
│   │   ├── badge.ts         # Toolbar badge counter
│   │   └── monitors/
│   │       ├── sessionHijackMonitor.ts
│   │       ├── cookieMonitor.ts
│   │       ├── browserMonitor.ts
│   │       ├── phishingMonitor.ts
│   │       ├── dnsMonitor.ts
│   │       ├── certMonitor.ts
│   │       ├── networkMonitor.ts
│   │       ├── passwordStrengthMonitor.ts
│   │       ├── extensionMonitor.ts
│   │       ├── headersMonitor.ts
│   │       ├── threatIntelMonitor.ts
│   │       ├── anomalyMonitor.ts
│   │       ├── correlationEngine.ts
│   │       ├── accountMonitor.ts
│   │       ├── autoResponse.ts
│   │       └── timelineDigest.ts
│   ├── content/             # Content scripts
│   │   ├── index.ts         # Page scanner, fingerprint detection
│   │   ├── urlCleaner.ts    # URL sanitization
│   │   └── permissionMonitor.ts
│   ├── popup/               # React SPA popup
│   │   ├── index.tsx
│   │   ├── App.tsx
│   │   ├── App.css
│   │   ├── hooks/
│   │   ├── components/      # Dashboard components per category
│   │   └── utils/
│   ├── types/               # TypeScript type definitions
│   └── utils/               # Shared utilities
├── public/                  # Static assets
│   ├── manifest.json
│   ├── popup.html
│   └── icons/
├── scripts/                 # Build tooling
└── dist/                    # Built extension (gitignored)
```

## Development

```bash
npm run build       # production build
npm run watch       # watch mode with auto-rebuild
```

The extension uses:
- **Chrome Extension MV3** — Manifest V3 service worker architecture
- **React 18** — Popup UI
- **Webpack 5** — Bundler
- **TypeScript** — All source code
- **Sharp** — Icon generation

## Security

Session Guardian runs entirely in the browser. No data is sent externally except:
- DNS checks against public resolvers (Cloudflare, Google, Quad9)
- Phishing lookups against OpenPhish and PhishTank APIs
- Threat intel checks against public threat feeds

All analysis is local. No telemetry. No accounts.

## License

MIT
