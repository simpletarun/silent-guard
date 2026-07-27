(function() {
  var report = function(api, details) {
    window.postMessage({ source: '__SG_SENSOR__', api: api, details: details, url: location.href, time: Date.now() }, '*');
  };
  try {
    var m = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    if (m) {
      var origGetUM = m.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = function(c) { report('camera_mic', Object.keys(c || {})); return origGetUM(c); };
    }
  } catch(e) {}
  try {
    var r = navigator.clipboard && navigator.clipboard.read;
    if (r) {
      var origR = r.bind(navigator.clipboard);
      navigator.clipboard.read = function() { report('clipboard_read'); return origR(); };
    }
  } catch(e) {}
  try {
    var w = navigator.clipboard && navigator.clipboard.write;
    if (w) {
      var origW = w.bind(navigator.clipboard);
      navigator.clipboard.write = function(d) { report('clipboard_write'); return origW(d); };
    }
  } catch(e) {}
  try {
    var g = navigator.geolocation && navigator.geolocation.getCurrentPosition;
    if (g) {
      var origG = g.bind(navigator.geolocation);
      navigator.geolocation.getCurrentPosition = function(s, e, o) { report('geolocation'); return origG(s, e, o); };
    }
  } catch(e) {}
})();
