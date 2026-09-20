## What's Changed

### Features
- **Extension Search**: Added search box to All Installed Extensions dashboard for quick filtering by extension name
- **ASN Display**: Network info now shows Autonomous System Number for better cloud/CDN identification

### Bug Fixes
- **Network Metrics Location**: Fixed "Unknown" ISP/Location display by:
  - Increasing geolocation API timeout from 8s to 15s for MV3 reliability
  - Consolidating ipapi.co fallback to properly set ISP when ipwho.is returns incomplete data
  - Adding debug logging for API failures

### UI Improvements
- Shows 'Cloud/Proxy location limited' instead of just 'Unknown' when VPN/proxy location data unavailable
- Search input with real-time filtering in Extensions tab

### Version
- Updated to v1.1.2
