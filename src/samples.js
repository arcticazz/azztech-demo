// Drawn sample "photos" so the demo works without a camera. Fictional.
const scenes = {
  unit: `
    <rect x="0" y="0" width="640" height="480" fill="#5b6470"/>
    <rect x="0" y="360" width="640" height="120" fill="#3d434b"/>
    <rect x="110" y="120" width="420" height="250" rx="10" fill="#d9dde2" stroke="#9aa3ad" stroke-width="4"/>
    <circle cx="230" cy="245" r="85" fill="#2f353c"/><circle cx="230" cy="245" r="70" fill="none" stroke="#7d8790" stroke-width="3"/>
    <path d="M230 245 L230 180 M230 245 L286 278 M230 245 L174 278" stroke="#aab3bc" stroke-width="10" stroke-linecap="round"/>
    <circle cx="410" cy="245" r="85" fill="#2f353c"/><circle cx="410" cy="245" r="70" fill="none" stroke="#7d8790" stroke-width="3"/>
    <path d="M410 245 L410 180 M410 245 L466 278 M410 245 L354 278" stroke="#aab3bc" stroke-width="10" stroke-linecap="round"/>
    <path d="M530 300 C580 300 580 380 620 380" stroke="#b87333" stroke-width="12" fill="none"/>
    <path d="M530 330 C565 330 565 400 620 400" stroke="#b87333" stroke-width="7" fill="none"/>`,
  terminal: `
    <rect x="0" y="0" width="640" height="480" fill="#c9ccd0"/>
    <rect x="160" y="80" width="320" height="320" rx="12" fill="#2d3238"/>
    <rect x="200" y="120" width="240" height="70" rx="6" fill="#4b525a"/>
    <circle cx="250" cy="155" r="18" fill="#c0c5ca"/><circle cx="320" cy="155" r="18" fill="#c0c5ca"/><circle cx="390" cy="155" r="18" fill="#c0c5ca"/>
    <circle cx="320" cy="155" r="34" fill="none" stroke="#7a4b1d" stroke-width="10" opacity="0.85"/>
    <path d="M250 175 L250 330 M320 175 L320 330 M390 175 L390 330" stroke="#8b2f2f" stroke-width="12"/>
    <path d="M320 175 L320 330" stroke="#3b2a1a" stroke-width="12"/>
    <circle cx="320" cy="155" r="48" fill="none" stroke="#ef4444" stroke-width="5" stroke-dasharray="10 8"/>`,
  ice: `
    <rect x="0" y="0" width="640" height="480" fill="#e8edf2"/>
    <rect x="120" y="40" width="400" height="400" rx="14" fill="#f8fafc" stroke="#aab4be" stroke-width="5"/>
    <rect x="160" y="80" width="320" height="140" rx="6" fill="#cbd5df"/>
    <path d="M170 90 h300 M170 110 h300 M170 130 h300 M170 150 h300 M170 170 h300 M170 190 h300" stroke="#9fb0c0" stroke-width="5"/>
    <path d="M160 80 q40 40 80 0 q40 50 80 0 q40 45 80 0 q40 40 80 0 v140 h-320z" fill="#ffffff" opacity="0.85"/>
    <rect x="230" y="300" width="180" height="70" rx="8" fill="#111827"/>
    <text x="320" y="350" font-family="monospace" font-size="44" fill="#f87171" text-anchor="middle">-2°C</text>`,
  valve: `
    <rect x="0" y="0" width="640" height="480" fill="#6b7280"/>
    <path d="M0 260 H640" stroke="#b87333" stroke-width="40"/>
    <rect x="280" y="150" width="80" height="110" rx="8" fill="#c9a227"/>
    <rect x="292" y="110" width="56" height="50" rx="6" fill="#d4af37"/>
    <path d="M300 130 h40" stroke="#8a6d1a" stroke-width="5"/>
    <circle cx="320" cy="200" r="90" fill="none" stroke="#22c55e" stroke-width="5" stroke-dasharray="10 8"/>`,
}

export function samplePhoto(kind, caption) {
  const scene = scenes[kind] || scenes.unit
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">${scene}
    <rect x="0" y="430" width="640" height="50" fill="rgba(0,0,0,0.6)"/>
    <text x="16" y="462" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#fff">SAMPLE PHOTO · ${String(caption).replace(/[<&>]/g, '')}</text>
  </svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function downscaleImage(file, max = 1280) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const w = img.naturalWidth
        const h = img.naturalHeight
        const k = Math.min(1, max / Math.max(w, h))
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round(w * k))
        c.height = Math.max(1, Math.round(h * k))
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
        URL.revokeObjectURL(url)
        resolve(c.toDataURL('image/jpeg', 0.82))
      } catch (err) {
        URL.revokeObjectURL(url)
        reject(err)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      const fr = new FileReader()
      fr.onload = () => resolve(String(fr.result))
      fr.onerror = () => reject(fr.error)
      fr.readAsDataURL(file)
    }
    img.src = url
  })
}
