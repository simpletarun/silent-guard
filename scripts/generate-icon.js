const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const outDir = path.join('C:\\Users\\hp\\Downloads\\new idea\\session-guardian\\public\\icons')
fs.mkdirSync(outDir, { recursive: true })

function svg(s) {
  const c = s / 2
  const cr = Math.round(s * 0.22)
  const sw = Math.max(5, Math.round(s * 0.044))
  const dotR = Math.max(2.5, Math.round(s * 0.028))
  const hipR = Math.max(1, Math.round(s * 0.012))

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
  <defs>
    <radialGradient id="bg" cx="40%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#0E2A4A"/>
      <stop offset="60%" stop-color="#071A2E"/>
      <stop offset="100%" stop-color="#020812"/>
    </radialGradient>
    <linearGradient id="armL" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#00E5FF"/>
      <stop offset="60%" stop-color="#00A8FF"/>
      <stop offset="100%" stop-color="#0066AA"/>
    </linearGradient>
    <linearGradient id="armR" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#00A8FF"/>
      <stop offset="60%" stop-color="#0088DD"/>
      <stop offset="100%" stop-color="#005588"/>
    </linearGradient>
    <radialGradient id="spark" cx="45%" cy="40%" r="55%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="40%" stop-color="#00E5FF"/>
      <stop offset="100%" stop-color="#00A8FF"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${s}" height="${s}" rx="${cr}" fill="url(#bg)"/>

  <path d="M${c} ${Math.round(s * 0.16)}
    C${Math.round(c - s * 0.28)} ${Math.round(s * 0.16)}
    ${Math.round(c - s * 0.38)} ${Math.round(s * 0.38)}
    ${Math.round(c - s * 0.34)} ${Math.round(s * 0.62)}
    C${Math.round(c - s * 0.30)} ${Math.round(s * 0.80)}
    ${Math.round(c - s * 0.15)} ${Math.round(s * 0.88)}
    ${Math.round(c + s * 0.02)} ${Math.round(s * 0.88)}"
    fill="none" stroke="url(#armL)" stroke-width="${sw}" stroke-linecap="round"/>

  <path d="M${c} ${Math.round(s * 0.16)}
    C${Math.round(c + s * 0.28)} ${Math.round(s * 0.16)}
    ${Math.round(c + s * 0.38)} ${Math.round(s * 0.38)}
    ${Math.round(c + s * 0.34)} ${Math.round(s * 0.62)}
    C${Math.round(c + s * 0.30)} ${Math.round(s * 0.80)}
    ${Math.round(c + s * 0.15)} ${Math.round(s * 0.88)}
    ${Math.round(c - s * 0.02)} ${Math.round(s * 0.88)}"
    fill="none" stroke="url(#armR)" stroke-width="${sw}" stroke-linecap="round"/>

  <circle cx="${c}" cy="${Math.round(s * 0.20)}" r="${dotR}" fill="url(#spark)"/>
  <circle cx="${c}" cy="${Math.round(s * 0.20)}" r="${hipR}" fill="#FFFFFF"/>
</svg>`
}

async function run() {
  for (const s of [16, 32, 48, 64, 128, 256, 512, 1024]) {
    const buf = await sharp(Buffer.from(svg(s))).png().toBuffer()
    fs.writeFileSync(path.join(outDir, `icon${s}.png`), buf)
    console.log(`  ${s}x${s}`)
  }
  console.log('Done')
}
run().catch(console.error)
