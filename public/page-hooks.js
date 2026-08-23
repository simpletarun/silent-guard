(function () {
  // Runs in the PAGE world ("world": "MAIN") — the ONLY place where patches
  // are visible to website scripts. Isolated-world content-script patches
  // never see real page API calls. Reports every hit to the isolated
  // content script via postMessage; spoofable by hostile pages, which only
  // skews numbers on your own dashboard.
  if (window.__SG_PAGE_HOOKS__) return
  window.__SG_PAGE_HOOKS__ = true

  function report(msg) {
    try {
      msg.source = '__SG_PAGE_HOOKS__'
      window.postMessage(msg, window.location.origin)
    } catch (e) {}
  }

  // --- canvas fingerprinting ---
  // No getImageData hook: Chrome's Canvas2D readback hint fires inside the
  // native call and attributes the stack to the immediate caller — us. The
  // warning is site-caused, but dropping this one wrapper keeps SilentGuard
  // out of page consoles; toDataURL/toBlob still cover canvas fingerprinting.
  try {
    var origToBlob = HTMLCanvasElement.prototype.toBlob
    HTMLCanvasElement.prototype.toBlob = function () {
      report({ kind: 'fp', api: 'canvas' })
      return origToBlob.apply(this, arguments)
    }
  } catch (e) {}

  // --- audio fingerprinting ---
  try {
    var AC = window.AudioContext || window.webkitAudioContext
    if (AC) {
      var ACProxy = function () {
        report({ kind: 'fp', api: 'audio' })
        return new AC(...arguments)
      }
      ACProxy.prototype = AC.prototype
      window.AudioContext = ACProxy
      if (window.webkitAudioContext) window.webkitAudioContext = ACProxy
    }
  } catch (e) {}

  // --- beacon / tracking pings ---
  try {
    var origBeacon = navigator.sendBeacon
    if (origBeacon) {
      navigator.sendBeacon = function (url, data) {
        report({ kind: 'fp', api: 'beacon' })
        return origBeacon.call(navigator, url, data)
      }
    }
  } catch (e) {}

  // --- WebRTC (leak vector, not fingerprinting) ---
  try {
    var OrigRTC = window.RTCPeerConnection || window.webkitRTCPeerConnection
    if (OrigRTC) {
      var RTCProxy = function () {
        report({ kind: 'rtc' })
        return new OrigRTC(...arguments)
      }
      RTCProxy.prototype = OrigRTC.prototype
      window.RTCPeerConnection = RTCProxy
      if (window.webkitRTCPeerConnection) window.webkitRTCPeerConnection = RTCProxy
    }
  } catch (e) {}

  // --- device sensors (camera/mic/clipboard/location) ---
  try {
    var gum = navigator.mediaDevices && navigator.mediaDevices.getUserMedia
    if (gum) {
      var origGUM = gum.bind(navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = function (c) {
        report({ kind: 'sensor', api: 'camera_mic' })
        return origGUM(c)
      }
    }
  } catch (e) {}
  try {
    var cr = navigator.clipboard && navigator.clipboard.read
    if (cr) {
      navigator.clipboard.read = function () {
        report({ kind: 'sensor', api: 'clipboard_read' })
        return cr.apply(navigator.clipboard, arguments)
      }
    }
  } catch (e) {}
  try {
    var cw = navigator.clipboard && navigator.clipboard.write
    if (cw) {
      navigator.clipboard.write = function (d) {
        report({ kind: 'sensor', api: 'clipboard_write' })
        return cw.call(navigator.clipboard, d)
      }
    }
  } catch (e) {}
  try {
    var geo = navigator.geolocation && navigator.geolocation.getCurrentPosition
    if (geo) {
      navigator.geolocation.getCurrentPosition = function (s, e2, o) {
        report({ kind: 'sensor', api: 'geolocation' })
        return geo.call(navigator.geolocation, s, e2, o)
      }
    }
  } catch (e) {}
})()
