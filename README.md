<div align="center">

# 🛡️ SilentGuard

**Real-time browser security monitoring for Chromium browsers**

![Version](https://img.shields.io/badge/version-1.1.0-00A8FF?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-00E676?style=flat-square)
![Chrome](https://img.shields.io/badge/chrome-MV3-071A2E?style=flat-square) ![Edge](https://img.shields.io/badge/edge-supported-00E676?style=flat-square) ![Brave](https://img.shields.io/badge/brave-supported-FF6B35?style=flat-square)
![React](https://img.shields.io/badge/react-18-00E5FF?style=flat-square)
![TypeScript](https://img.shields.io/badge/typescript-5-00A8FF?style=flat-square)

---

Detects cookie theft, fingerprinting, phishing, DNS inconsistencies, and more — all inside your browser.

</div>

## ✨ Features

| Category | Detection |
|----------|-----------|
| **Cookie Security** | Detects auth cookie changes, missing `secure`/`httpOnly` flags, insecure `sameSite` |
| **Fingerprinting** | Hooks canvas, AudioContext, WebRTC APIs; monitors screen/UA/timezone changes |
| **Certificates** | Queries crt.sh for recent CT logs on monitored domains |
| **Network** | IP change alerts
| **Extensions** | Scans installed extensions for dangerous permissions |
| **Security Headers** | Audits HSTS, CSP, XFO, XSS, Referrer-Policy, Permissions-Policy |
| **Trackers** | Identifies 78+ tracker domains, tracking pixels, hidden elements, storage keys |
| **Auto-Kill** | Clears cookies + opens logout URLs for compromised services |
| **Panic Mode** | `Ctrl+Shift+9` instantly blocks all web requests via declarativeNetRequest |
| **Policy Analyzer** | Scores privacy policies: dangerous clauses, retention, user rights, transparency |

## 🆕 What's New in 1.1.0

- **Panic lockdown actually blocks**: rebuilt on `declarativeNetRequest` session rules (MV3 `webRequest.cancel` is a no-op) — arm, auto-expire, and recover all enforced; hotkey works from cold start
- **Fingerprinting detection fixed**: page scans now re-run after hook activity instead of snapshotting counters before fingerprinting scripts ran
- **Download verdicts**: Chrome's async malware flag now re-scores downloads (was swallowed by a dedupe guard); trusted-domain discount no longer overrides "dangerous" verdicts
- **Data races eliminated**: DNS/cert/cookie/account writes moved inside the storage mutex so Clear-All-Data can't be partially resurrected
- **Popup polish**: speed test timeouts + abort cleanup, silent failure toasts, tab scroll reset, badge colors

## 🚀 Getting Started

### Download
Grab the latest build from [Releases](https://github.com/simpletarun/silent-guard/releases) — download the ZIP, unzip, and load in your browser.

### Load in Chrome / Edge / Brave
1. Open `chrome://extensions` (Chrome), `edge://extensions` (Edge), or `brave://extensions` (Brave)
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` folder

## 📱 Usage

Click the SilentGuard icon in the toolbar. Seven dashboards:

| Tab | Monitors |
|-----|----------|
| **Overview** | Overall score, correlated incidents, timeline, weekly digests |
| **Network** | IP, VPN status, DNS results, cert checks, threat intel |
| **Device** | Fingerprint stats, anomaly events |
| **Extensions** | Installed extension risk levels |
| **Passwords** | Password strength indicators |
| **Privacy** | Trackers, phishing results, security headers |
| **Accounts** | Tracked accounts, cookie changes, account activity |


## 🌐 Supported Browsers

| Browser | Support |
|---------|---------|
| Google Chrome | ✅ Full (MV3) |
| Microsoft Edge | ✅ Full |
| Brave | ✅ Full |
| Opera | ✅ Full |
| Vivaldi | ✅ Full |
| Arc | ✅ Full |
| Mozilla Firefox | ❌ Not supported (MV2 only) |


## 📄 License

[MIT](LICENSE)
