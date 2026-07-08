import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HUB } from '../data/tuning.js'
import {
  AVATAR_SLOTS, AVATAR_STYLES, SLOT_FIELDS,
  colorList, findStyle, normalizeAvatar, randomAvatar,
} from '../data/avatarManifest.js'
import { ensureComposite, getComposite, descriptorKey } from '../engine/avatarComposite.js'
import { getAvatar, setAvatar, getOrigin } from '../data/saves.js'
import './AvatarScreen.css'

// Basic avatar customization. The look is a plain descriptor; the preview and
// the hub both render it through the palette-swap compositor. Style arrows come
// from the manifest, color swatches from the generated ramp data — no
// hardcoded filenames or colors here.

const SLOT_LABELS = { body: 'Skin', outfit: 'Outfit', hair: 'Hair', hat: 'Hat' }

export default function AvatarScreen() {
  const navigate = useNavigate()
  const returnTo = getOrigin() // reload-proof origin (defaults to the hub)

  const [descriptor, setDescriptor] = useState(() => normalizeAvatar(getAvatar()))
  const descriptorRef = useRef(descriptor)
  const previewCanvasRef = useRef(null)
  const facingRef = useRef(0) // index into HUB.avatar.facingOrder

  // Mirror the latest descriptor into a ref the preview rAF loop reads (the
  // loop is set up once; updating the ref avoids re-subscribing per change).
  useEffect(() => { descriptorRef.current = descriptor }, [descriptor])

  // Live walking preview: composite-on-change (cached), auto-cycle facings,
  // tap to rotate. One rAF loop for the life of the screen.
  useEffect(() => {
    const canvas = previewCanvasRef.current
    const ctx = canvas.getContext('2d')
    const A = HUB.avatar
    const S = HUB.sprite
    let W = 0
    let H = 0
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = canvas.clientWidth
      H = canvas.clientHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    let lastKey = null
    let animFrame = 0
    let animTime = 0
    let facingTime = 0
    let last = performance.now()
    let raf = 0

    function loop(now) {
      const dt = Math.min(now - last, 50)
      last = now
      const desc = descriptorRef.current
      const key = descriptorKey(desc)
      if (key !== lastKey) { lastKey = key; ensureComposite(desc) }

      animTime += dt
      while (animTime >= A.previewAnimFrameMs) { animTime -= A.previewAnimFrameMs; animFrame = (animFrame + 1) % S.walkFrames }
      facingTime += dt
      if (facingTime >= A.facingCycleMs) { facingTime -= A.facingCycleMs; facingRef.current = (facingRef.current + 1) % A.facingOrder.length }

      ctx.clearRect(0, 0, W, H)
      const sheet = getComposite(desc)
      if (sheet) {
        const facing = A.facingOrder[facingRef.current]
        const row = S.walkRow[facing]
        const sx = animFrame * S.frameSize
        const sy = row * S.frameSize
        const dw = S.frameSize * A.previewScale
        const dh = dw
        const dx = (W - dw) / 2
        const dy = H - dh
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(sheet, sx, sy, S.frameSize, S.frameSize, dx, dy, dw, dh)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  function currentStyleId(slot) {
    const field = SLOT_FIELDS[slot].style
    return field ? descriptor[field] : AVATAR_STYLES[slot][0].id
  }

  function cycleStyle(slot, dir) {
    const styles = AVATAR_STYLES[slot]
    if (styles.length < 2) return
    const field = SLOT_FIELDS[slot].style
    const idx = styles.findIndex((s) => s.id === descriptor[field])
    const next = styles[(idx + dir + styles.length) % styles.length]
    const colorField = SLOT_FIELDS[slot].color
    const colors = colorList(slot, next.id)
    const keepColor = colors.some((c) => c.id === descriptor[colorField])
    setDescriptor((d) => ({
      ...d,
      [field]: next.id,
      [colorField]: keepColor ? d[colorField] : (colors[0]?.id || 'c00'),
    }))
  }

  function setColor(slot, colorId) {
    setDescriptor((d) => ({ ...d, [SLOT_FIELDS[slot].color]: colorId }))
  }

  function onSave() {
    setAvatar(descriptor)
    navigate(returnTo)
  }
  function onCancel() {
    navigate(returnTo)
  }

  function rotatePreview() {
    facingRef.current = (facingRef.current + 1) % HUB.avatar.facingOrder.length
  }

  return (
    <div className="avatar-screen">
      <div className="avatar-card">
        <h1 className="avatar-title">Your Look</h1>

        <div className="avatar-preview-wrap">
          <canvas
            ref={previewCanvasRef}
            className="avatar-preview"
            onClick={rotatePreview}
            title="Tap to turn"
          />
        </div>

        <div className="avatar-rows">
          {AVATAR_SLOTS.map((slot) => {
            const styles = AVATAR_STYLES[slot]
            const styleId = currentStyleId(slot)
            const style = findStyle(slot, styleId)
            const colors = colorList(slot, styleId)
            const colorField = SLOT_FIELDS[slot].color
            const multiStyle = styles.length > 1
            return (
              <div className="avatar-row" key={slot}>
                <div className="avatar-row-head">
                  <span className="avatar-slot-label">{SLOT_LABELS[slot]}</span>
                  <div className="avatar-style-pick">
                    <button
                      type="button"
                      className="avatar-arrow"
                      onClick={() => cycleStyle(slot, -1)}
                      disabled={!multiStyle}
                      aria-label={`Previous ${SLOT_LABELS[slot]} style`}
                    >
                      &#9664;
                    </button>
                    <span className="avatar-style-name">{style.name}</span>
                    <button
                      type="button"
                      className="avatar-arrow"
                      onClick={() => cycleStyle(slot, 1)}
                      disabled={!multiStyle}
                      aria-label={`Next ${SLOT_LABELS[slot]} style`}
                    >
                      &#9654;
                    </button>
                  </div>
                </div>
                <div className="avatar-swatches" role="group" aria-label={`${SLOT_LABELS[slot]} color`}>
                  {colors.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`avatar-swatch${c.id === descriptor[colorField] ? ' is-selected' : ''}`}
                      style={{ background: c.swatch }}
                      onClick={() => setColor(slot, c.id)}
                      aria-pressed={c.id === descriptor[colorField]}
                      aria-label={`${SLOT_LABELS[slot]} color ${c.id}`}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="avatar-actions">
          <button type="button" className="avatar-btn avatar-randomize" onClick={() => setDescriptor(randomAvatar())}>
            Randomize
          </button>
          <button type="button" className="avatar-btn avatar-save" onClick={onSave}>
            Save &amp; Back
          </button>
          <button type="button" className="avatar-btn avatar-cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
