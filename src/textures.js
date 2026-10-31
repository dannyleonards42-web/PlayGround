import * as THREE from 'three'

const TAU = Math.PI * 2

export function seeded(seed = 1) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function canvasTexture(width, height, draw, { repeat = null, srgb = true } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  draw(ctx, width, height)
  const texture = new THREE.CanvasTexture(canvas)
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(repeat[0], repeat[1])
  }
  texture.needsUpdate = true
  return texture
}

function spacedText(ctx, text, x, y, spacing = 0) {
  const chars = [...text]
  const widths = chars.map((char) => ctx.measureText(char).width)
  const total = widths.reduce((sum, width) => sum + width, 0) + spacing * Math.max(0, chars.length - 1)
  let cursor = x - total / 2
  chars.forEach((char, index) => {
    ctx.fillText(char, cursor, y)
    cursor += widths[index] + spacing
  })
  return total
}

export function makeFloorTexture() {
  const random = seeded(51)
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    const base = ctx.createLinearGradient(0, 0, w, h)
    base.addColorStop(0, '#e9e5db')
    base.addColorStop(0.48, '#ded9ce')
    base.addColorStop(1, '#e6e1d7')
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)

    // Soft, oversized stone clouds.
    for (let i = 0; i < 28; i += 1) {
      const x = random() * w
      const y = random() * h
      const r = 70 + random() * 220
      const cloud = ctx.createRadialGradient(x, y, 0, x, y, r)
      cloud.addColorStop(0, `rgba(122, 119, 111, ${0.015 + random() * 0.022})`)
      cloud.addColorStop(1, 'rgba(122, 119, 111, 0)')
      ctx.fillStyle = cloud
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }

    // Fine mineral veins.
    for (let i = 0; i < 17; i += 1) {
      let x = random() * w
      let y = random() * h
      ctx.beginPath()
      ctx.moveTo(x, y)
      const segments = 3 + Math.floor(random() * 5)
      for (let j = 0; j < segments; j += 1) {
        const nx = x + (random() - 0.3) * 220
        const ny = y + (random() - 0.5) * 180
        ctx.quadraticCurveTo(x + (random() - 0.5) * 120, y + (random() - 0.5) * 120, nx, ny)
        x = nx
        y = ny
      }
      ctx.strokeStyle = `rgba(92, 88, 82, ${0.028 + random() * 0.05})`
      ctx.lineWidth = 0.4 + random() * 1.4
      ctx.stroke()
    }

    // Stone aggregate.
    ctx.save()
    for (let i = 0; i < 1800; i += 1) {
      const light = random() > 0.48
      ctx.fillStyle = light ? `rgba(255,255,255,${random() * 0.14})` : `rgba(30,30,28,${random() * 0.08})`
      const r = random() * 1.6 + 0.2
      ctx.beginPath()
      ctx.arc(random() * w, random() * h, r, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
  }, { repeat: [2.4, 1.7] })
}

export function makeFloorBrandTexture() {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    const cx = w / 2
    const cy = h / 2
    ctx.clearRect(0, 0, w, h)

    // Concentric brass inlay rings.
    const ring = (radius, color, width) => {
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, TAU)
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.stroke()
    }
    ring(472, 'rgba(124, 103, 68, 0.62)', 3)
    ring(454, 'rgba(124, 103, 68, 0.24)', 1)
    ring(336, 'rgba(74, 69, 60, 0.34)', 1.5)
    ring(322, 'rgba(176, 142, 84, 0.5)', 2)
    ring(142, 'rgba(124, 103, 68, 0.42)', 1.5)

    // Radial ticks.
    for (let i = 0; i < 24; i += 1) {
      const angle = (i / 24) * TAU
      const long = i % 3 === 0
      const inner = long ? 350 : 360
      const outer = 446
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner)
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer)
      ctx.strokeStyle = long ? 'rgba(124, 103, 68, 0.44)' : 'rgba(74, 69, 60, 0.18)'
      ctx.lineWidth = long ? 2 : 1
      ctx.stroke()
    }

    // Compass diamonds at the four axes.
    ctx.fillStyle = 'rgba(176, 142, 84, 0.55)'
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * TAU - Math.PI / 2
      const x = cx + Math.cos(angle) * 394
      const y = cy + Math.sin(angle) * 394
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(angle + Math.PI / 4)
      ctx.fillRect(-5, -5, 10, 10)
      ctx.restore()
    }

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(58, 53, 46, 0.8)'
    ctx.font = '400 94px "Instrument Serif", Georgia, serif'
    ctx.fillText('AGENT / HQ', cx, cy - 14)

    ctx.fillStyle = 'rgba(139, 111, 63, 0.82)'
    ctx.font = '600 21px Manrope, sans-serif'
    spacedText(ctx, 'FLOOR 05  ·  ORCHESTRATION', cx, cy + 72, 5.5)

    ctx.strokeStyle = 'rgba(124, 103, 68, 0.36)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx - 168, cy + 39)
    ctx.lineTo(cx + 168, cy + 39)
    ctx.stroke()
  })
}

export function makeRugTexture(base = '#d8d2c5', dark = '#0c0d0e') {
  return canvasTexture(768, 768, (ctx, w, h) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = dark
    ctx.lineWidth = 28
    ctx.strokeRect(15, 15, w - 30, h - 30)
    ctx.strokeStyle = 'rgba(185, 151, 90, 0.65)'
    ctx.lineWidth = 2
    ctx.strokeRect(44, 44, w - 88, h - 88)
    ctx.strokeStyle = 'rgba(20, 20, 19, 0.06)'
    ctx.lineWidth = 1
    for (let i = 0; i < 80; i += 1) {
      const y = 60 + (i / 80) * (h - 120)
      ctx.beginPath()
      ctx.moveTo(55, y)
      ctx.lineTo(w - 55, y + Math.sin(i) * 2)
      ctx.stroke()
    }
  })
}

export function makeShadowTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2)
    gradient.addColorStop(0, 'rgba(0,0,0,0.46)')
    gradient.addColorStop(0.35, 'rgba(0,0,0,0.26)')
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)
  }, { srgb: false })
}

export function makeKeyboardTexture() {
  return canvasTexture(512, 160, (ctx, w, h) => {
    ctx.fillStyle = '#151618'
    ctx.fillRect(0, 0, w, h)
    const cols = 18
    const rows = 5
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const keyW = w / cols - 5
        const keyH = h / rows - 6
        const x = col * (w / cols) + 2.5
        const y = row * (h / rows) + 3
        ctx.fillStyle = row === 4 && col > 3 && col < 14 ? '#b79a62' : '#222428'
        ctx.fillRect(x, y, keyW, keyH)
      }
    }
  })
}

export function makeScreenTexture(agent) {
  return canvasTexture(768, 432, (ctx, w, h) => {
    ctx.fillStyle = '#0a0b0d'
    ctx.fillRect(0, 0, w, h)

    const wash = ctx.createRadialGradient(w * 0.65, h * 0.2, 0, w * 0.65, h * 0.2, w * 0.8)
    wash.addColorStop(0, 'rgba(207, 171, 105, 0.12)')
    wash.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = wash
    ctx.fillRect(0, 0, w, h)

    ctx.strokeStyle = 'rgba(255,255,255,0.055)'
    ctx.lineWidth = 1
    for (let x = 0; x < w; x += 64) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
    for (let y = 0; y < h; y += 54) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }

    ctx.fillStyle = '#d9cfbb'
    ctx.font = '500 20px Manrope, sans-serif'
    ctx.fillText('AGENT HQ', 34, 42)
    ctx.font = '400 12px Manrope, sans-serif'
    ctx.fillStyle = 'rgba(224,218,206,0.42)'
    ctx.fillText(`LIVE WORKSPACE / ${agent.id.toUpperCase()}`, 34, 64)

    ctx.fillStyle = '#f0ece2'
    ctx.font = '500 44px "Instrument Serif", serif'
    ctx.fillText(agent.name, 34, 120)

    ctx.fillStyle = '#caa45f'
    ctx.font = '600 13px Manrope, sans-serif'
    ctx.fillText(agent.role.toUpperCase(), 34, 144)

    ctx.strokeStyle = 'rgba(255,255,255,0.11)'
    ctx.beginPath()
    ctx.moveTo(34, 165)
    ctx.lineTo(w - 34, 165)
    ctx.stroke()

    ctx.fillStyle = 'rgba(235,230,219,0.42)'
    ctx.font = '500 11px Manrope, sans-serif'
    ctx.fillText('ACTIVE THREAD / 04', 34, 194)
    ctx.fillStyle = 'rgba(245,241,233,0.86)'
    ctx.font = '400 17px Manrope, sans-serif'
    ctx.fillText(agent.tasks[agent.taskIndex]?.label || 'Executive synthesis', 34, 222)

    // Chart
    const chartX = 34
    const chartY = 275
    const chartW = w - 280
    const chartH = 105
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.strokeRect(chartX, chartY, chartW, chartH)
    ctx.strokeStyle = '#caa45f'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    const points = 12
    for (let i = 0; i < points; i += 1) {
      const px = chartX + (i / (points - 1)) * chartW
      const py = chartY + chartH - (0.15 + Math.sin(i * 0.7 + agent.seed) * 0.12 + (i / points) * 0.55) * chartH
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()

    ctx.fillStyle = 'rgba(202,164,95,0.12)'
    ctx.lineTo(chartX + chartW, chartY + chartH)
    ctx.lineTo(chartX, chartY + chartH)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = 'rgba(235,230,219,0.42)'
    ctx.font = '500 10px Manrope, sans-serif'
    ctx.fillText('OUTPUT VELOCITY', chartX, chartY - 12)

    // Side stats
    const stats = [
      ['FOCUS', `${agent.metrics.focus}%`],
      ['SYNC', '12ms'],
      ['TOKENS', agent.metrics.tokens],
    ]
    stats.forEach(([label, value], index) => {
      const y = 282 + index * 55
      ctx.fillStyle = 'rgba(235,230,219,0.38)'
      ctx.font = '500 10px Manrope, sans-serif'
      ctx.fillText(label, w - 220, y)
      ctx.fillStyle = '#e4ded2'
      ctx.font = '500 22px Manrope, sans-serif'
      ctx.fillText(value, w - 220, y + 25)
    })

    ctx.fillStyle = '#caa45f'
    ctx.beginPath()
    ctx.arc(w - 42, 42, 5, 0, TAU)
    ctx.fill()
  })
}

export function makeTabletTexture(agent) {
  return canvasTexture(512, 320, (ctx, w, h) => {
    ctx.fillStyle = '#121315'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(202,164,95,0.8)'
    ctx.lineWidth = 3
    ctx.strokeRect(8, 8, w - 16, h - 16)
    ctx.fillStyle = '#d9d2c3'
    ctx.font = '500 18px Manrope, sans-serif'
    ctx.fillText('DIRECTIVE / 01', 28, 45)
    ctx.fillStyle = '#f1ede5'
    ctx.font = '400 42px "Instrument Serif", serif'
    ctx.fillText(agent.name, 28, 100)
    ctx.fillStyle = 'rgba(235,230,219,0.5)'
    ctx.font = '400 15px Manrope, sans-serif'
    ctx.fillText(agent.tasks[agent.taskIndex]?.short || 'Synthesizing signal', 28, 130)
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillRect(28, 160, w - 56, 7)
    ctx.fillStyle = '#caa45f'
    ctx.fillRect(28, 160, (w - 56) * Math.max(0.1, agent.progress), 7)
    ctx.fillStyle = 'rgba(235,230,219,0.38)'
    ctx.font = '500 11px Manrope, sans-serif'
    ctx.fillText('LIVE PROGRESS', 28, 194)
    ctx.fillStyle = '#cec6b7'
    ctx.font = '500 34px Manrope, sans-serif'
    ctx.fillText(`${Math.round(agent.progress * 100)}%`, 28, 234)
    ctx.fillStyle = '#caa45f'
    ctx.beginPath()
    ctx.arc(w - 42, 43, 6, 0, TAU)
    ctx.fill()
  })
}

export function makeBrandSignTexture() {
  return canvasTexture(1600, 440, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#eae5db'
    ctx.font = '400 208px "Instrument Serif", serif'
    ctx.textBaseline = 'middle'
    ctx.fillText('AGENT', 100, 195)
    ctx.fillStyle = '#c8a15a'
    ctx.font = '300 190px Manrope, sans-serif'
    ctx.fillText('/', 684, 184)
    ctx.fillStyle = '#eae5db'
    ctx.font = '400 208px "Instrument Serif", serif'
    ctx.fillText('HQ', 790, 195)

    ctx.fillStyle = 'rgba(234,229,219,0.48)'
    ctx.font = '500 27px Manrope, sans-serif'
    ctx.fillText('I N T E L L I G E N C E   ·   O R C H E S T R A T E D', 105, 355)
    ctx.fillStyle = 'rgba(200,161,90,0.9)'
    ctx.fillRect(105, 306, 88, 3)
    ctx.fillRect(w - 196, 306, 88, 3)
  })
}

export function makeBoardroomTexture() {
  return canvasTexture(1280, 720, (ctx, w, h) => {
    ctx.fillStyle = '#0b0c0e'
    ctx.fillRect(0, 0, w, h)
    const wash = ctx.createRadialGradient(w * 0.72, h * 0.3, 10, w * 0.72, h * 0.3, w * 0.8)
    wash.addColorStop(0, 'rgba(202,164,95,0.15)')
    wash.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = wash
    ctx.fillRect(0, 0, w, h)

    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    for (let x = 0; x < w; x += 88) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
    for (let y = 0; y < h; y += 74) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }

    ctx.fillStyle = '#d8d0c0'
    ctx.font = '500 22px Manrope, sans-serif'
    ctx.fillText('AGENT HQ / EXECUTIVE INTELLIGENCE', 64, 70)
    ctx.fillStyle = '#f0ece3'
    ctx.font = '400 90px "Instrument Serif", serif'
    ctx.fillText('Quarterly', 64, 190)
    ctx.fillStyle = '#c9a25c'
    ctx.font = '400 90px "Instrument Serif", serif'
    ctx.fillText('operating review', 64, 278)
    ctx.fillStyle = 'rgba(235,230,219,0.42)'
    ctx.font = '400 24px Manrope, sans-serif'
    ctx.fillText('FLOOR 05  /  ORCHESTRATION & STRATEGY', 68, 328)

    const chartX = 64
    const chartY = 410
    const chartW = w - 128
    const chartH = 210
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
    ctx.strokeRect(chartX, chartY, chartW, chartH)
    ctx.strokeStyle = '#caa45f'
    ctx.lineWidth = 4
    ctx.beginPath()
    for (let i = 0; i < 18; i += 1) {
      const x = chartX + (i / 17) * chartW
      const y = chartY + chartH - (0.17 + i * 0.034 + Math.sin(i * 0.8) * 0.04) * chartH
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.fillStyle = 'rgba(235,230,219,0.36)'
    ctx.font = '500 16px Manrope, sans-serif'
    ctx.fillText('CUMULATIVE DECISION THROUGHPUT', chartX, chartY - 18)
  })
}

export function makeArtTexture(variant = 0) {
  const random = seeded(33 + variant * 7)
  return canvasTexture(640, 820, (ctx, w, h) => {
    ctx.fillStyle = variant === 0 ? '#e6e0d3' : '#d4cec1'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#1a1b1c'
    ctx.lineWidth = 2
    ctx.strokeRect(32, 32, w - 64, h - 64)

    if (variant === 0) {
      ctx.fillStyle = '#171819'
      ctx.beginPath()
      ctx.arc(w * 0.48, h * 0.42, w * 0.28, Math.PI * 1.05, Math.PI * 1.86)
      ctx.lineTo(w * 0.48, h * 0.42)
      ctx.fill()
      ctx.fillStyle = '#c8a15a'
      ctx.beginPath()
      ctx.arc(w * 0.58, h * 0.55, w * 0.15, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = '#151617'
      ctx.lineWidth = 1
      for (let i = 1; i < 7; i += 1) {
        ctx.beginPath()
        ctx.moveTo(34, 120 + i * 92)
        ctx.lineTo(w - 34, 120 + i * 92)
        ctx.stroke()
      }
    } else {
      for (let i = 0; i < 70; i += 1) {
        ctx.fillStyle = i % 3 === 0 ? 'rgba(202,164,95,0.72)' : 'rgba(20,21,22,0.84)'
        const r = 2 + random() * 22
        ctx.beginPath()
        ctx.arc(100 + random() * (w - 200), 120 + random() * (h - 240), r, 0, TAU)
        ctx.fill()
      }
      ctx.strokeStyle = '#c8a15a'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(70, h - 110)
      ctx.lineTo(w - 70, h - 110)
      ctx.stroke()
    }
  })
}

export function makeCoffeeMenuTexture() {
  return canvasTexture(520, 320, (ctx, w, h) => {
    ctx.fillStyle = '#0e0f10'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(202,164,95,0.45)'
    ctx.strokeRect(14, 14, w - 28, h - 28)
    ctx.fillStyle = '#e9e4d9'
    ctx.font = '400 52px "Instrument Serif", serif'
    ctx.fillText('The Brief', 38, 95)
    ctx.fillStyle = 'rgba(233,228,217,0.45)'
    ctx.font = '500 13px Manrope, sans-serif'
    ctx.fillText('ESPRESSO / FILTER / QUIET AMBITION', 40, 124)
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
    ctx.beginPath()
    ctx.moveTo(40, 150)
    ctx.lineTo(w - 40, 150)
    ctx.stroke()
    const items = [['ESPRESSO', '02'], ['FLAT WHITE', '03'], ['MATCHA', '04']]
    items.forEach(([name, price], i) => {
      ctx.fillStyle = '#d8d1c3'
      ctx.font = '500 17px Manrope, sans-serif'
      ctx.fillText(name, 40, 195 + i * 34)
      ctx.fillStyle = '#c8a15a'
      ctx.fillText(price, w - 74, 195 + i * 34)
    })
  })
}

export function makeWallClockTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#101112'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#d8d2c7'
    ctx.lineWidth = 8
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, 196, 0, TAU)
    ctx.stroke()
    ctx.fillStyle = '#d8d2c7'
    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * TAU
      const r1 = 168
      const r2 = i % 3 === 0 ? 145 : 156
      ctx.beginPath()
      ctx.moveTo(w / 2 + Math.cos(angle) * r1, h / 2 + Math.sin(angle) * r1)
      ctx.lineTo(w / 2 + Math.cos(angle) * r2, h / 2 + Math.sin(angle) * r2)
      ctx.lineWidth = i % 3 === 0 ? 5 : 2
      ctx.strokeStyle = i % 3 === 0 ? '#c8a15a' : '#d8d2c7'
      ctx.stroke()
    }
    const now = new Date()
    const hour = ((now.getHours() % 12) + now.getMinutes() / 60) / 12 * TAU - Math.PI / 2
    const minute = (now.getMinutes() / 60) * TAU - Math.PI / 2
    ctx.strokeStyle = '#eae5db'
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.moveTo(w / 2, h / 2)
    ctx.lineTo(w / 2 + Math.cos(hour) * 100, h / 2 + Math.sin(hour) * 100)
    ctx.stroke()
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(w / 2, h / 2)
    ctx.lineTo(w / 2 + Math.cos(minute) * 150, h / 2 + Math.sin(minute) * 150)
    ctx.stroke()
    ctx.fillStyle = '#c8a15a'
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, 8, 0, TAU)
    ctx.fill()
  })
}

export function makeAwardTexture() {
  return canvasTexture(700, 900, (ctx, w, h) => {
    ctx.fillStyle = '#0b0c0d'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(202,164,95,0.65)'
    ctx.lineWidth = 2
    ctx.strokeRect(38, 38, w - 76, h - 76)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#c8a15a'
    ctx.font = '400 120px "Instrument Serif", serif'
    ctx.fillText('A', w / 2, 250)
    ctx.fillStyle = '#eae5db'
    ctx.font = '500 26px Manrope, sans-serif'
    ctx.fillText('AGENT HQ', w / 2, 390)
    ctx.fillStyle = 'rgba(234,229,219,0.45)'
    ctx.font = '500 14px Manrope, sans-serif'
    ctx.fillText('EXCELLENCE IN', w / 2, 450)
    ctx.fillText('AUTONOMOUS OPERATIONS', w / 2, 476)
    ctx.strokeStyle = 'rgba(234,229,219,0.24)'
    ctx.beginPath()
    ctx.moveTo(140, 530)
    ctx.lineTo(w - 140, 530)
    ctx.stroke()
    ctx.fillStyle = '#c8a15a'
    ctx.font = '400 75px "Instrument Serif", serif'
    ctx.fillText('2026', w / 2, 650)
  })
}

export function makeWhiteboardTexture() {
  return canvasTexture(1000, 560, (ctx, w, h) => {
    ctx.fillStyle = '#e7e3d9'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#171819'
    ctx.font = '500 24px Manrope, sans-serif'
    ctx.fillText('Q4 / ORCHESTRATION MAP', 50, 70)
    ctx.strokeStyle = '#c8a15a'
    ctx.lineWidth = 3
    const nodes = [
      [180, 230, 90, 38, 'INTENT'],
      [410, 160, 100, 38, 'PLAN'],
      [640, 210, 110, 38, 'AGENTS'],
      [790, 370, 95, 38, 'SHIP'],
      [440, 400, 130, 38, 'EVALUATE'],
    ]
    nodes.forEach(([x, y, nw, nh, label]) => {
      ctx.strokeRect(x - nw / 2, y - nh / 2, nw, nh)
      ctx.fillStyle = '#171819'
      ctx.font = '600 14px Manrope, sans-serif'
      ctx.fillText(label, x - nw / 2 + 12, y + 5)
    })
    ctx.strokeStyle = 'rgba(23,24,25,0.4)'
    ctx.lineWidth = 2
    const links = [[0, 1], [1, 2], [2, 3], [2, 4], [4, 3]]
    links.forEach(([a, b]) => {
      ctx.beginPath()
      ctx.moveTo(nodes[a][0], nodes[a][1])
      ctx.lineTo(nodes[b][0], nodes[b][1])
      ctx.stroke()
    })
    ctx.fillStyle = '#c8a15a'
    ctx.beginPath()
    ctx.arc(640, 210, 7, 0, TAU)
    ctx.fill()
    ctx.fillStyle = 'rgba(23,24,25,0.54)'
    ctx.font = '400 15px Manrope, sans-serif'
    ctx.fillText('Every decision leaves a trace.', 50, h - 48)
  })
}
