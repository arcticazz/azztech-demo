import { useEffect, useRef, useState } from 'react'
import { samplePhoto, downscaleImage } from './samples.js'
import { formatNow } from './Report.jsx'

export function IconBack() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  )
}

export function NumberPad({ item, initial, onClose, onSave }) {
  const [value, setValue] = useState(initial ?? '')
  const push = (ch) => {
    setValue((cur) => {
      if (ch === '-') return cur.startsWith('-') ? cur.slice(1) : `-${cur}`
      if (ch === '.' && cur.includes('.')) return cur
      if (cur.replace('-', '').replace('.', '').length >= 6) return cur
      return cur === '0' && ch !== '.' ? ch : cur + ch
    })
  }
  return (
    <div className="sheet" onClick={onClose} role="presentation">
      <div className="sheet-card" onClick={(e) => e.stopPropagation()} data-testid="numpad">
        <p className="tiny">Reading</p>
        <h2 style={{ marginTop: 4 }}>{item.label}</h2>
        <p className="hint">{item.typical} · {item.unit}</p>
        <div className="pad-display">{value || '0'} <span style={{ fontSize: 18, color: '#a1a1aa' }}>{item.unit}</span></div>
        <div className="pad-grid">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '0', '.'].map((ch) => (
            <button key={ch} type="button" data-testid={`key-${ch}`} onClick={() => push(ch)}>{ch === '-' ? '±' : ch}</button>
          ))}
        </div>
        <div className="seg" style={{ marginTop: 8 }}>
          <button type="button" onClick={() => setValue((c) => c.slice(0, -1))}>Delete</button>
          <button type="button" onClick={() => setValue('')}>Clear</button>
        </div>
        <button
          type="button" className="primary" style={{ marginTop: 10 }} data-testid="pad-save"
          disabled={value === '' || value === '-' || value === '.' || value === '-.'}
          onClick={() => onSave(value)}
        >
          Save reading
        </button>
        <button type="button" className="ghost" style={{ width: '100%' }} onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

export function SignPad({ title, who, onCancel, onSign }) {
  const ref = useRef(null)
  const drawing = useRef(false)
  const last = useRef(null)
  const [empty, setEmpty] = useState(true)

  const prepare = () => {
    const c = ref.current
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
    const r = c.getBoundingClientRect()
    c.width = Math.max(1, Math.round(r.width * dpr))
    c.height = Math.max(1, Math.round(r.height * dpr))
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.strokeStyle = '#0b1f33'
    ctx.fillStyle = '#0b1f33'
    ctx.lineWidth = 2.6 * dpr
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    setEmpty(true)
  }

  useEffect(() => {
    const c = ref.current
    prepare()
    // iOS Safari: React touch listeners are passive, so block page scroll natively while signing.
    const stop = (e) => e.preventDefault()
    c.addEventListener('touchstart', stop, { passive: false })
    c.addEventListener('touchmove', stop, { passive: false })
    return () => {
      c.removeEventListener('touchstart', stop)
      c.removeEventListener('touchmove', stop)
    }
  }, [])

  const pos = (e) => {
    const c = ref.current
    const r = c.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height }
  }
  const down = (e) => {
    e.preventDefault()
    try { ref.current.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    drawing.current = true
    const p = pos(e)
    last.current = p
    const ctx = ref.current.getContext('2d')
    ctx.beginPath()
    ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2)
    ctx.fill()
    setEmpty(false)
  }
  const move = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = ref.current.getContext('2d')
    const native = e.nativeEvent
    const events = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : []
    const pts = (events.length ? events : [e]).map(pos)
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    for (const p of pts) ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = pts[pts.length - 1]
  }
  const up = () => { drawing.current = false }

  return (
    <div className="sheet" role="presentation">
      <div className="sheet-card" data-testid="signpad">
        <p className="tiny">Signature</p>
        <h2 style={{ marginTop: 4 }}>{title}</h2>
        <p className="hint">{who} · sign with a finger in the white box.</p>
        <canvas
          ref={ref}
          className="sign-canvas"
          data-testid="sign-canvas"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        <div className="seg" style={{ marginTop: 10 }}>
          <button type="button" onClick={prepare} data-testid="sign-clear">Clear</button>
          <button type="button" onClick={onCancel}>Cancel</button>
        </div>
        <button
          type="button" className="primary" style={{ marginTop: 10 }} disabled={empty} data-testid="sign-accept"
          onClick={() => onSign(ref.current.toDataURL('image/png'))}
        >
          Accept signature
        </button>
      </div>
    </div>
  )
}

export function PhotoField({ item, assetCode, photo, onChange }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  return (
    <div className="photo-field">
      {photo ? (
        <div className="photo-thumb-wrap">
          <img className="photo-thumb" src={photo.src} alt={`Photo: ${item.label}`} />
          <span className="photo-tag">{photo.sample ? 'Sample photo' : 'Your photo'} · {photo.at}</span>
        </div>
      ) : (
        <p className="hint">{item.photoRequired ? 'Photo required.' : 'Photo optional.'} Use the camera, or the sample photo.</p>
      )}
      <div className="seg">
        <label className="file-btn" data-testid={`photo-take-${item.id}`}>
          {busy ? 'Loading…' : photo ? '📷 Retake' : '📷 Take photo'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              setBusy(true)
              setErr('')
              try {
                const src = await downscaleImage(file)
                onChange({ src, sample: false, at: formatNow() })
              } catch {
                setErr('Could not read that photo. Try again or use the sample.')
              } finally {
                setBusy(false)
              }
            }}
          />
        </label>
        <button
          type="button"
          data-testid={`photo-sample-${item.id}`}
          onClick={() => onChange({ src: samplePhoto(item.sample || 'unit', `${assetCode} · ${item.label}`), sample: true, at: formatNow() })}
        >
          Use sample
        </button>
      </div>
      {photo && <button type="button" className="ghost" style={{ width: '100%' }} onClick={() => onChange(null)}>Remove photo</button>}
      {err && <p className="hint" style={{ color: '#fda4af' }}>{err}</p>}
    </div>
  )
}
