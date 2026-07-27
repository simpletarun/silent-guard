<div align="center">

# 🛡️ Session Guardian

**Real-time browser security monitoring for Chrome**

![Version](https://img.shields.io/badge/version-1.0.0-00A8FF?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-00E676?style=flat-square)
![Chrome](https://img.shields.io/badge/chrome-MV3-071A2E?style=flat-square)
![React](https://img.shields.io/badge/react-18-00E5FF?style=flat-square)
![TypeScript](https://img.shields.io/badge/typescript-5-00A8FF?style=flat-square)

---

Detects session hijacking, cookie theft, fingerprinting, phishing, DNS inconsistencies, and more — all inside your browser.

</div>

## ✨ Features

| Category | Detection |
|----------|-----------|
| **Session Hijack** | Monitors auth cookies on 25 high-value domains; cross-references IP changes within 24h |
| **Cookie Security** | Detects auth cookie changes, missing `secure`/`httpOnly` flags, insecure `sameSite` |
| **Fingerprinting** | Hooks canvas, AudioContext, WebRTC APIs; monitors screen/UA/timezone changes |
| **Phishing** | Checks URLs against OpenPhish and PhishTank feeds |
| **DNS** | Compares resolutions across Cloudflare, Google, and doh.li resolvers |
| **Certificates** | Queries crt.sh for recent CT logs on monitored domains |
| **Network** | IP change alerts, VPN/proxy/TOR detection via geolocation |
| **Extensions** | Scans installed extensions for dangerous permissions |
| **Security Headers** | Audits HSTS, CSP, XFO, XSS, Referrer-Policy, Permissions-Policy |
| **Threat Intel** | Checks domains against URLHaus and AlienVault OTX |
| **Anomalies** | Heuristic analysis: unusual hours, tab spikes, new domain bursts |
| **Correlation** | Pattern-matches events across categories into correlated incidents |
| **Trackers** | Identifies 78+ tracker domains, tracking pixels, hidden elements, storage keys |
| **URL Cleaner** | Strips 35+ tracking parameters from URLs |
| **Auto-Kill** | Clears cookies + opens logout URLs for compromised services |
| **Forensics** | Captures tabs, extensions, cookies, network, fingerprint on incidents |
| **Weekly Digest** | Timeline with score trends, top threats, recommendations |

## 🚀 Getting Started

```bash
git clone https://github.com/simpletarun/session-guardian.git
cd session-guardian
npm install
npm run build
```

Load in Chrome:
1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` folder

## 📱 Usage

Click the Session Guardian icon in the toolbar. Seven dashboards:

| Tab | Monitors |
|-----|----------|
| **Overview** | Overall score, correlated incidents, timeline, weekly digests |
| **Network** | IP, VPN status, DNS results, cert checks, threat intel |
| **Device** | Fingerprint stats, anomaly events |
| **Extensions** | Installed extension risk levels |
| **Passwords** | Password strength indicators |
| **Privacy** | Trackers, phishing results, security headers |
| **Accounts** | Tracked accounts, cookie changes, session events |

## 🏗️ Architecture

```
src/
├── background/              # Service worker
│   ├── index.ts             # Message router, alarms, lifecycle
│   ├── engine.ts            # 7-category scoring engine (0-100)
│   ├── storage.ts           # Chrome storage state management
│   ├── notifications.ts     # Chrome notification dispatcher
│   ├── badge.ts             # Toolbar badge (score / alert count)
│   └── monitors/            # 15 security monitors
│       ├── sessionHijackMonitor.ts
│       ├── cookieMonitor.ts
│       ├── browserMonitor.ts
│       ├── phishingMonitor.ts
│       ├── dnsMonitor.ts
│       ├── certMonitor.ts
│       ├── networkMonitor.ts
│       ├── passwordStrengthMonitor.ts
│       ├── extensionMonitor.ts
│       ├── headersMonitor.ts
│       ├── threatIntelMonitor.ts
│       ├── anomalyMonitor.ts
│       ├── correlationEngine.ts
│       ├── accountMonitor.ts
│       ├── autoResponse.ts
│       └── timelineDigest.ts
├── content/                 # Content scripts
│   ├── index.ts             # Tracker detection, fingerprinting hooks
│   ├── urlCleaner.ts        # URL tracking parameter stripping
│   └── permissionMonitor.ts # Sensor API monitoring
├── popup/                   # React 18 SPA (520-600px)
│   ├── components/          # Dashboard per category
│   ├── hooks/               # Security engine bindings
│   └── utils/               # Password generation, helpers
├── types/                   # TypeScript definitions
└── utils/                   # Shared utilities
```

## 🧰 Tech Stack

```
Extension     Chrome MV3 (Manifest V3, service worker)
Frontend      React 18, TypeScript, Webpack 5
Icons         Sharp (PNG generation)
```

## 📄 License

[MIT](LICENSE)
