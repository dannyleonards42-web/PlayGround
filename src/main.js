import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createWorld } from './world.js'
import { Simulation } from './simulation.js'
import { ShiftGame } from './game.js'
import { UI } from './ui.js'

const canvas = document.querySelector('#scene')
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const coarsePointer = window.matchMedia('(pointer: coarse)').matches
const deviceMemory = Number(navigator.deviceMemory || 8)
const lowPower = coarsePointer || deviceMemory <= 6
// Keep the 3D floor above the compact bottom sheets on tablets as well as phones.
const COMPACT_LAYOUT = 1024

const simulation = new Simulation()
const shiftGame = new ShiftGame(simulation)
const ui = new UI(simulation, shiftGame)

let renderer
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: !lowPower,
    powerPreference: 'high-performance',
    stencil: false,
  })
} catch (error) {
  ui.setBootProgress(100, 'WEBGL UNAVAILABLE')
  document.querySelector('.boot-meta').innerHTML = '<span>This browser does not expose WebGL.</span><span>TRY A MODERN BROWSER</span>'
  throw error
}

const pixelRatioCap = lowPower ? 1.12 : 1.75
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.9
renderer.shadowMap.enabled = true
renderer.shadowMap.type = lowPower ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap
renderer.shadowMap.autoUpdate = false
renderer.shadowMap.needsUpdate = true

const scene = new THREE.Scene()

const VIEWS = {
  iso: {
    position: new THREE.Vector3(17.6, 16.4, 21.0),
    target: new THREE.Vector3(1.55, 0.6, -0.7),
    fov: 36,
  },
  top: {
    position: new THREE.Vector3(1.55, 34.5, 1.35),
    target: new THREE.Vector3(1.55, 0, -0.55),
    fov: 36,
  },
  'iso-portrait': {
    position: new THREE.Vector3(18.0, 24.0, 24.0),
    target: new THREE.Vector3(1.0, 0.0, -1.0),
    fov: 50,
  },
  'top-portrait': {
    position: new THREE.Vector3(1.3, 50.0, 2.0),
    target: new THREE.Vector3(1.3, 0.0, -0.6),
    fov: 50,
  },
}

function isPortrait() {
  return window.innerHeight > window.innerWidth * 1.28
}

function viewPreset(name) {
  return VIEWS[isPortrait() ? `${name}-portrait` : name] || VIEWS[name]
}

// The office bounds are deliberately slightly tighter than the plinth so the
// camera frames the architecture, workstations, boardroom and lounge without
// wasting screen space on the outer floor trim.
const OFFICE_BOUNDS = new THREE.Box3(
  new THREE.Vector3(-11.9, 0, -8.1),
  new THREE.Vector3(11.9, 4.85, 8.1),
)

// The boardroom gets its own tighter bounds so a stand-up cutaway frames the
// table, glass walls and seated agents instead of zooming into a wall.
const BOARDROOM_BOUNDS = new THREE.Box3(
  new THREE.Vector3(5.15, 0, -6.45),
  new THREE.Vector3(10.55, 3.7, -1.95),
)

function elementRect(selector) {
  const element = document.querySelector(selector)
  if (!element) return null
  const style = window.getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden') return null
  const rect = element.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return null
  return rect
}

// Reserve the area not covered by the HUD rails. This is what prevents the
// office from disappearing behind the roster, feed and selected-agent cards.
function getSafeViewport() {
  const margin = 16
  const hud = elementRect('.hud-bar')
  const shiftHud = elementRect('.shift-hud')
  const leftRail = elementRect('.left-rail')
  const rightRail = elementRect('.right-rail')
  const operations = elementRect('.operations-bar')
  const mobile = window.innerWidth <= COMPACT_LAYOUT

  let left = margin
  let right = window.innerWidth - margin
  let top = Math.max((hud ? hud.bottom : 0) + 10, (shiftHud ? shiftHud.bottom : 0) + 8)
  let bottom = window.innerHeight - margin

  if (mobile) {
    // On portrait/tablet layouts the rails are bottom sheets. Keep the 3D
    // floor above the roster and the operations bar.
    if (rightRail) bottom = Math.min(bottom, rightRail.top - 10)
    if (operations) bottom = Math.min(bottom, operations.top - 10)
  } else {
    // Let the outer floor trim tuck under the translucent rails. This keeps
    // the five agents, executive desk and boardroom large and readable while
    // still preventing the important content from being hidden.
    const railOverlap = 88
    if (leftRail) left = Math.max(left, leftRail.right - railOverlap)
    if (rightRail) right = Math.min(right, rightRail.left + railOverlap)
    if (operations) bottom = Math.min(bottom, operations.top - 12)
  }

  if (right - left < 240) {
    left = 12
    right = window.innerWidth - 12
  }
  if (bottom - top < 240) {
    top = 70
    bottom = window.innerHeight - 80
  }

  const width = right - left
  const height = bottom - top
  return {
    left,
    right,
    top,
    bottom,
    width,
    height,
    cx: (left + right) / 2,
    cy: top + height * 0.5,
  }
}

function computeFittedFraming(bounds, direction, fov, { centerY = null, minDistance = 8, maxDistance = 86 } = {}) {
  const safe = getSafeViewport()
  const width = window.innerWidth
  const height = window.innerHeight
  const center = bounds.getCenter(new THREE.Vector3())
  if (centerY !== null) center.y = centerY

  const safeNdc = {
    left: (safe.left / width) * 2 - 1,
    right: (safe.right / width) * 2 - 1,
    top: 1 - (safe.top / height) * 2,
    bottom: 1 - (safe.bottom / height) * 2,
  }

  const corners = []
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        corners.push(new THREE.Vector3(x, y, z))
      }
    }
  }

  const probe = new THREE.PerspectiveCamera(fov, width / height, 0.1, 160)
  const target = center.clone()
  let distance = 30

  for (let pass = 0; pass < 4; pass += 1) {
    probe.position.copy(target).addScaledVector(direction, distance)
    probe.lookAt(target)
    probe.updateMatrixWorld()

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const corner of corners) {
      const projected = corner.clone().project(probe)
      minX = Math.min(minX, projected.x)
      maxX = Math.max(maxX, projected.x)
      minY = Math.min(minY, projected.y)
      maxY = Math.max(maxY, projected.y)
    }

    const requiredWidth = safeNdc.right - safeNdc.left
    const requiredHeight = safeNdc.top - safeNdc.bottom
    const scale = Math.max((maxX - minX) / requiredWidth, (maxY - minY) / requiredHeight)
    distance = THREE.MathUtils.clamp(distance * scale, minDistance, maxDistance)
  }

  // Keep the orbit pivot on the subject. The composition is shifted with a
  // lens offset instead of panning the pivot into empty space.
  return {
    position: target.clone().addScaledVector(direction, distance),
    target: target.clone(),
    fov,
    distance,
    offsetX: safe.cx - width / 2,
    offsetY: safe.cy - height / 2,
  }
}

function computeFittedView(viewName) {
  const preset = viewPreset(viewName)
  if (!preset) return null
  const direction = preset.position.clone().sub(preset.target).normalize()
  return computeFittedFraming(OFFICE_BOUNDS, direction, preset.fov, { centerY: 1.55, minDistance: 12 })
}

function applyViewFraming(view) {
  camera.fov = view.fov
  if (Math.abs(view.offsetX) > 0.5 || Math.abs(view.offsetY) > 0.5) {
    camera.setViewOffset(
      window.innerWidth,
      window.innerHeight,
      -view.offsetX,
      -view.offsetY,
      window.innerWidth,
      window.innerHeight,
    )
  } else {
    camera.clearViewOffset()
  }
  camera.updateProjectionMatrix()
}

const initialView = viewPreset('iso')
const camera = new THREE.PerspectiveCamera(initialView.fov, window.innerWidth / window.innerHeight, 0.1, 90)
camera.position.copy(initialView.position)

const controls = new OrbitControls(camera, canvas)
controls.target.copy(initialView.target)
controls.enableDamping = true
controls.dampingFactor = 0.075
controls.enablePan = true
controls.screenSpacePanning = true
controls.minDistance = 8
controls.maxDistance = isPortrait() ? 60 : 44
controls.minPolarAngle = 0.075
controls.maxPolarAngle = Math.PI * 0.485
controls.rotateSpeed = 0.62
controls.zoomSpeed = 0.76
controls.panSpeed = 0.78
controls.touches.ONE = THREE.TOUCH.ROTATE
controls.touches.TWO = THREE.TOUCH.DOLLY_PAN
controls.update()
ui.setView('iso')

let world = null
let cameraTween = null
let hoveredId = null
let selectedId = null
let selectedType = null
let focusedAgentId = null
let lastOverviewView = 'iso'
let lastTagUpdate = 0
let lastTime = performance.now()
let firstFrame = true
let portraitMode = isPortrait()

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const pointerState = { down: false, x: 0, y: 0, moved: false }

const clamp = THREE.MathUtils.clamp

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function shortestAngle(from, to) {
  let delta = (to - from) % (Math.PI * 2)
  if (delta > Math.PI) delta -= Math.PI * 2
  if (delta < -Math.PI) delta += Math.PI * 2
  return delta
}

function dampAngle(from, to, lambda, dt) {
  return from + shortestAngle(from, to) * (1 - Math.exp(-lambda * dt))
}

function cancelCameraTween() {
  if (!cameraTween) return
  cameraTween = null
  controls.enabled = true
}

function tweenCamera(position, target, duration = 900) {
  cancelCameraTween()
  cameraTween = {
    fromPosition: camera.position.clone(),
    toPosition: position.clone(),
    fromTarget: controls.target.clone(),
    toTarget: target.clone(),
    start: performance.now(),
    duration,
  }
  controls.enabled = false
}

function setView(viewName, { animate = true } = {}) {
  const view = computeFittedView(viewName)
  if (!view) return
  if (viewName === 'iso' || viewName === 'top') lastOverviewView = viewName
  focusedAgentId = null
  ui.setView(viewName)
  applyViewFraming(view)
  controls.maxDistance = Math.max(isPortrait() ? 60 : 44, view.distance * 1.45)
  if (animate && !reduceMotion) {
    tweenCamera(view.position, view.target, 950)
  } else {
    cancelCameraTween()
    camera.position.copy(view.position)
    controls.target.copy(view.target)
    camera.lookAt(view.target)
    controls.update()
  }
}

function resetCamera() {
  setView('iso')
}

function focusAgent(id) {
  const agent = simulation.getAgent(id)
  if (!agent) return
  focusedAgentId = id
  const direction = new THREE.Vector3(0.62, 0.54, 0.74).normalize()
  const target = new THREE.Vector3(agent.position.x, 0.5, agent.position.z)
  const focusDistance = window.innerWidth <= COMPACT_LAYOUT ? 14.5 : 10.8
  const position = target.clone().add(direction.multiplyScalar(focusDistance))
  camera.clearViewOffset()
  camera.fov = isPortrait() ? 50 : 40
  if (window.innerWidth <= COMPACT_LAYOUT) {
    // Lift the robot above the mobile selected-agent sheet with a lens shift
    // so the orbit pivot can stay exactly on the robot.
    const panel = document.querySelector('#agent-panel')?.getBoundingClientRect()
    const panelTop = panel && panel.height > 20 ? panel.top : window.innerHeight * 0.52
    const desiredY = Math.max(132, panelTop - 84)
    camera.setViewOffset(
      window.innerWidth,
      window.innerHeight,
      0,
      window.innerHeight / 2 - desiredY,
      window.innerWidth,
      window.innerHeight,
    )
  }
  camera.updateProjectionMatrix()
  ui.setFreeCamera()
  tweenCamera(position, target, 850)
}

function focusBoardroom() {
  const portrait = isPortrait()
  const direction = (portrait
    ? new THREE.Vector3(0.58, 1.25, 0.78)
    : new THREE.Vector3(0.55, 1.02, 0.72)).normalize()
  const view = computeFittedFraming(BOARDROOM_BOUNDS, direction, portrait ? 50 : 36, {
    centerY: 1.25,
    minDistance: 9,
    maxDistance: 58,
  })
  applyViewFraming(view)
  controls.maxDistance = Math.max(controls.maxDistance, view.distance * 1.5)
  ui.setCameraMode('BOARDROOM')
  tweenCamera(view.position, view.target, 1050)
}

function zoomCamera(direction) {
  const offset = camera.position.clone().sub(controls.target)
  const distance = offset.length()
  const nextDistance = clamp(distance * (direction > 0 ? 1.17 : 0.85), controls.minDistance, controls.maxDistance)
  offset.setLength(nextDistance)
  const target = controls.target.clone()
  tweenCamera(target.clone().add(offset), target, 300)
}

function selectAgent(id, { focus = false } = {}) {
  const agent = simulation.getAgent(id)
  if (!agent) return
  selectedId = id
  selectedType = 'agent'
  ui.showAgent(agent)
  if (focus || window.innerWidth <= COMPACT_LAYOUT) focusAgent(id)
}

function showExecutiveConsole() {
  selectedId = null
  selectedType = 'executive'
  ui.showConsole()
}

function clearSelection({ restoreView = true } = {}) {
  const restoreOverview = restoreView && window.innerWidth <= COMPACT_LAYOUT && focusedAgentId !== null && focusedAgentId === selectedId
  selectedId = null
  selectedType = null
  ui.clearSelection()
  // On phones the agent sheet opens with an automatic close-up. Closing that
  // sheet should return to the floor overview, not strand the user in a crop.
  if (restoreOverview) setView(lastOverviewView)
}

function conveneStandup({ focus = true } = {}) {
  const started = simulation.conveneStandup()
  if (started) {
    if (window.innerWidth <= COMPACT_LAYOUT && selectedType) clearSelection({ restoreView: false })
    ui.toast(
      shiftGame.active
        ? 'Stand-up convened · shift clock paused until agents return'
        : 'Executive stand-up convened in the boardroom',
      3200,
    )
    ui.updateShiftHud()
    if (focus) focusBoardroom()
  }
}

function togglePause() {
  simulation.togglePause()
}

function cycleSpeed() {
  simulation.setSpeed(simulation.speed === 1 ? 2 : 1)
}

function handleConsoleAction(action) {
  if (action === 'standup') conveneStandup({ focus: true })
  if (action === 'pause') togglePause()
  if (action === 'top') setView('top')
}

function getPick(event) {
  const rect = canvas.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(world?.pickables || [], false)
  return hits.length ? hits[0].object.userData.interactive : null
}

function handlePick(interactive) {
  if (!interactive) return
  if (interactive.action === 'select') {
    selectAgent(interactive.id)
    return
  }
  if (interactive.action === 'console') {
    showExecutiveConsole()
    return
  }
  if (interactive.action === 'standup') {
    conveneStandup({ focus: true })
    return
  }
  if (interactive.action === 'coffee') {
    const agent = simulation.coffee()
    ui.toast(`${agent.name} is recharging at The Brief`, 2800)
  }
}

function updateHover(event) {
  if (event.pointerType === 'touch') return
  const interactive = getPick(event)
  const nextHoveredId = interactive?.action === 'select' ? interactive.id : null
  if (nextHoveredId !== hoveredId) hoveredId = nextHoveredId
  canvas.style.cursor = interactive ? 'pointer' : 'grab'
  if (!interactive) {
    ui.hideTooltip()
    return
  }
  const x = clamp(event.clientX, 130, window.innerWidth - 130)
  const y = clamp(event.clientY, 115, window.innerHeight - 22)
  ui.showTooltip(interactive, x, y)
}

ui
  .on('select-agent', (id) => selectAgent(id))
  .on('clear', () => clearSelection())
  .on('focus-agent', (id) => focusAgent(id))
  .on('directive', (id, directive) => {
    const agent = simulation.getAgent(id)
    if (!agent) return
    if (agent.mode !== 'desk') {
      ui.toast(`${agent.name} is ${simulation.statusOf(agent).toLowerCase()} — directives resume at the desk`, 3000)
      return
    }
    const activeBrief = shiftGame.requestForAgent(id)
    simulation.prioritize(id, directive)
    shiftGame.dispatch(id, directive)
    const labels = { analyze: 'Deep analysis', review: 'Peer review', sync: 'Agent synchronization' }
    if (!activeBrief) ui.toast(`${agent.name} accepted directive · ${labels[directive]}`, 2800)
    ui.showAgent(agent)
    ui.updateShiftHud()
  })
  .on('brief-select', (requestId) => {
    const request = shiftGame.requestById(requestId)
    if (!request) return
    const agent = simulation.getAgent(request.agentId)
    if (!agent) return
    selectAgent(agent.id)
    ui.toast(`${agent.name.toUpperCase()} selected · issue ${request.directiveLabel}`, 2600)
  })
  .on('shift-start', () => {
    shiftGame.start()
    ui.toast('New operations shift started · clear the priority briefs', 3000)
  })
  .on('toggle-pause', () => togglePause())
  .on('speed', () => cycleSpeed())
  .on('standup', () => conveneStandup({ focus: true }))
  .on('zoom', (direction) => zoomCamera(direction))
  .on('reset-camera', () => resetCamera())
  .on('view', (view) => {
    // On narrow screens the selected-agent sheet covers the floor plan.
    // Switching views is an overview action, so dismiss the sheet first.
    if (window.innerWidth <= COMPACT_LAYOUT && selectedType) clearSelection()
    setView(view)
  })
  .on('console-action', (action) => handleConsoleAction(action))

simulation.onChange((type, payload) => {
  if (type === 'feed') ui.addFeed(payload)
  if (type === 'pause') ui.setPaused(payload.paused)
  if (type === 'speed') ui.setSpeed(payload.speed)
  if (type === 'meeting') ui.setMeeting(payload.active)
  if (type === 'notice') ui.toast(payload.message)
  if (type === 'agent' && selectedId && payload.agentId === selectedId) {
    const agent = simulation.getAgent(selectedId)
    if (agent) ui.showAgent(agent)
  }
})

shiftGame.onChange((type, payload) => {
  if (type === 'state' || type === 'start' || type === 'requests') {
    ui.updateShiftHud()
  }
  if (type === 'resolve') {
    const agent = simulation.getAgent(payload.request.agentId)
    ui.toast(`${agent?.name || 'Agent'} cleared “${payload.request.title}” · +${payload.points}`, 2800)
    ui.updateShiftHud()
    if (selectedId) {
      const selectedAgent = simulation.getAgent(selectedId)
      if (selectedAgent) ui.showAgent(selectedAgent)
    }
  }
  if (type === 'expire') {
    const agent = simulation.getAgent(payload.request.agentId)
    ui.toast(`Brief expired · ${agent?.name || 'Agent'} missed “${payload.request.title}” · −12 confidence`, 3200)
    ui.updateShiftHud()
  }
  if (type === 'wrong') {
    const agent = simulation.getAgent(payload.agentId)
    ui.toast(`Wrong protocol · ${agent?.name || 'Agent'} needs ${payload.requested.toUpperCase()} · −6 confidence`, 3200)
    ui.updateShiftHud()
  }
  if (type === 'end') {
    ui.updateShiftHud()
    ui.showShiftReport(payload)
  }
})

document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const digit = Number(event.key)
  if (digit >= 1 && digit <= 5) selectAgent(simulation.agents[digit - 1].id)
  if (event.key.toLowerCase() === 'i') setView('iso')
  if (event.key.toLowerCase() === 't') setView('top')
  if (event.key.toLowerCase() === 'r') resetCamera()
  if (event.key === 'Escape') {
    if (ui.el.helpDialog.open) return
    clearSelection()
  }
  if (event.code === 'Space') {
    event.preventDefault()
    togglePause()
  }
})

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  cancelCameraTween()
  pointerState.down = true
  pointerState.moved = false
  pointerState.x = event.clientX
  pointerState.y = event.clientY
  ui.hideTooltip()
})

canvas.addEventListener('pointermove', (event) => {
  if (pointerState.down) {
    if (Math.hypot(event.clientX - pointerState.x, event.clientY - pointerState.y) > 5) pointerState.moved = true
  } else {
    updateHover(event)
  }
})

canvas.addEventListener('pointerup', (event) => {
  if (!pointerState.down || event.button !== 0) return
  const moved = pointerState.moved || Math.hypot(event.clientX - pointerState.x, event.clientY - pointerState.y) > 5
  pointerState.down = false
  if (moved) {
    ui.setFreeCamera()
    return
  }
  if (event.pointerType === 'touch') {
    const interactive = getPick(event)
    handlePick(interactive)
    return
  }
  handlePick(getPick(event))
})

canvas.addEventListener('pointercancel', () => {
  pointerState.down = false
})

canvas.addEventListener('pointerleave', () => {
  hoveredId = null
  ui.hideTooltip()
  canvas.style.cursor = 'grab'
  if (pointerState.down) pointerState.down = false
})

canvas.addEventListener('wheel', () => {
  ui.setFreeCamera()
}, { passive: true })

window.addEventListener('resize', () => {
  const width = window.innerWidth
  const height = window.innerHeight
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap))
  renderer.setSize(width, height)

  const nextPortrait = isPortrait()
  if (nextPortrait !== portraitMode) {
    portraitMode = nextPortrait
    controls.maxDistance = nextPortrait ? 60 : 44
  }
  if (ui.currentView === 'iso' || ui.currentView === 'top') {
    setView(ui.currentView, { animate: false })
  }
})

document.addEventListener('visibilitychange', () => {
  lastTime = performance.now()
})

function animateRobot(agent, robot, dt) {
  const state = agent
  const walk = state.mode === 'walking'
  const meeting = state.mode === 'meeting'
  const motionTime = simulation.paused ? 0 : simulation.elapsed
  const phase = motionTime * (walk ? 0 : 5.2) + agent.seed

  robot.root.position.x = state.position.x
  robot.root.position.z = state.position.z
  robot.root.rotation.y = dampAngle(robot.root.rotation.y, state.position.rotation, walk ? 9 : 6, dt)

  if (robot.hitbox) {
    robot.hitbox.position.x = state.position.x
    robot.hitbox.position.z = state.position.z
  }

  const selected = selectedId === agent.id
  const hovered = hoveredId === agent.id
  robot.ring.visible = selected || hovered
  const targetOpacity = selected ? 0.78 : hovered ? 0.32 : 0
  robot.ring.material.opacity += (targetOpacity - robot.ring.material.opacity) * Math.min(1, dt * 8)
  const ringPulse = selected ? 1 + Math.sin(motionTime * 2.7) * 0.025 : 1
  robot.ring.scale.set(ringPulse, ringPulse, 1)
  robot.ring.rotation.z += dt * (selected ? 0.08 : 0.02)

  robot.arms.forEach((arm, index) => {
    const side = index === 0 ? -1 : 1
    if (walk) {
      arm.shoulder.rotation.x = Math.sin(agent.walkPhase + index * Math.PI) * 0.42
      arm.shoulder.rotation.z = side * (0.08 + Math.cos(agent.walkPhase) * 0.03)
      arm.elbow.rotation.x = -0.16 + Math.max(0, Math.sin(agent.walkPhase + index * Math.PI)) * 0.22
    } else if (meeting) {
      arm.shoulder.rotation.x = 0.06 + Math.sin(phase * 0.34 + index) * 0.025
      arm.shoulder.rotation.z = side * 0.055
      arm.elbow.rotation.x = -0.12
    } else {
      const typing = simulation.paused ? 0 : 1
      arm.shoulder.rotation.x = -0.69 + Math.sin(phase + index * 2.1) * 0.04 * typing
      arm.shoulder.rotation.z = side * 0.055
      arm.elbow.rotation.x = -0.18 + Math.cos(phase * 1.17 + index) * 0.075 * typing
    }
  })

  robot.legs.forEach((leg, index) => {
    const side = index === 0 ? -1 : 1
    if (walk) {
      leg.rotation.x = Math.sin(agent.walkPhase + index * Math.PI) * 0.55
      leg.rotation.z = side * 0.012
    } else {
      leg.rotation.x += (0 - leg.rotation.x) * Math.min(1, dt * 10)
      leg.rotation.z = side * 0.012
    }
  })

  const bobAmount = walk ? Math.abs(Math.sin(agent.walkPhase)) * 0.035 : meeting ? 0.008 : 0.004
  robot.bob.position.y = Math.sin(phase * (walk ? 1 : 0.8)) * bobAmount
  robot.root.position.y = walk ? Math.abs(Math.sin(agent.walkPhase)) * 0.02 : 0

  let headYaw = Math.sin(phase * 0.31) * 0.09
  if (walk) headYaw = Math.sin(agent.walkPhase * 0.5) * 0.04
  if (meeting) headYaw = Math.sin(phase * 0.22 + agent.index) * 0.14
  if (selected || hovered) {
    const towardCamera = Math.atan2(camera.position.x - state.position.x, camera.position.z - state.position.z) - state.position.rotation
    headYaw += Math.sin(towardCamera) * 0.18
  }
  robot.head.rotation.y += (headYaw - robot.head.rotation.y) * Math.min(1, dt * 3.2)
  robot.head.rotation.z = walk ? Math.sin(agent.walkPhase * 0.5) * 0.025 : Math.sin(phase * 0.2) * 0.012

  const shadowScale = walk ? 0.9 + Math.abs(Math.sin(agent.walkPhase)) * 0.12 : 1
  robot.shadow.scale.set(shadowScale, shadowScale, 1)
}

function updateAgentTag(now) {
  if (now - lastTagUpdate < 65) return
  lastTagUpdate = now
  if (!selectedId) {
    ui.updateAgentTagPosition(0, 0, false)
    return
  }
  const agent = simulation.getAgent(selectedId)
  const robot = world?.robots[selectedId]
  if (!agent || !robot) return
  const position = new THREE.Vector3(robot.root.position.x, 1.82, robot.root.position.z)
  position.project(camera)
  const visible = position.z > -1 && position.z < 1 && position.x > -1.1 && position.x < 1.1
  const x = (position.x * 0.5 + 0.5) * window.innerWidth
  const y = (-position.y * 0.5 + 0.5) * window.innerHeight
  ui.updateAgentTagPosition(x, y - 4, visible)
}

function animateAmbient(now, dt) {
  if (!world) return
  const t = now * 0.001
  const pausedFactor = simulation.paused ? 0.2 : 1
  if (world.exec?.hologram) {
    world.exec.hologram.rotation.y += dt * 0.25 * pausedFactor
    world.exec.hologram.position.y = 1.3 + Math.sin(t * 0.9) * 0.035
    world.exec.halo.rotation.z += dt * 0.16 * pausedFactor
    world.exec.core.rotation.x += dt * 0.09 * pausedFactor
    world.exec.core.rotation.z -= dt * 0.06 * pausedFactor
  }
  if (world.motes) {
    world.motes.rotation.y += dt * 0.006 * pausedFactor
    world.motes.position.y = Math.sin(t * 0.12) * 0.02
  }
  if (world.lights) {
    world.lights.executiveLight.intensity = 14 + Math.sin(t * 1.3) * 0.5
    world.lights.meetingLight.intensity = 15 + Math.sin(t * 1.07 + 1.2) * 0.4
    world.lights.loungeLight.intensity = 9 + Math.sin(t * 0.8 + 2.1) * 0.35
  }
}

function frame(now) {
  const rawDelta = (now - lastTime) / 1000
  lastTime = now
  const dt = Math.min(rawDelta, 0.1)

  if (!document.hidden) {
    if (!simulation.paused) {
      simulation.update(dt)
      // Agents cannot accept directives during stand-up, so hold the shift
      // clock and brief timers until everyone is back at their desks.
      if (!simulation.meeting) shiftGame.update(dt * simulation.speed)
    }
    controls.update()

    if (cameraTween) {
      const elapsed = performance.now() - cameraTween.start
      const progress = clamp(elapsed / cameraTween.duration, 0, 1)
      const eased = easeInOutCubic(progress)
      camera.position.lerpVectors(cameraTween.fromPosition, cameraTween.toPosition, eased)
      controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, eased)
      camera.lookAt(controls.target)
      if (progress >= 1) {
        cameraTween = null
        controls.enabled = true
        controls.update()
      }
    }

    if (world) {
      for (const agent of simulation.agents) {
        const robot = world.robots[agent.id]
        if (robot) animateRobot(agent, robot, dt)
      }
      animateAmbient(now, dt)
      updateAgentTag(now)
    }

    renderer.render(scene, camera)
    if (firstFrame) {
      firstFrame = false
      renderer.shadowMap.needsUpdate = false
      requestAnimationFrame(() => {
        ui.finishBoot()
        document.body.dataset.ready = 'true'
        window.__AGENT_HQ_READY__ = true
      })
    }
  }
}

async function boot() {
  if (reduceMotion) {
    ui.setBootProgress(100, 'READY')
    ui.finishBoot()
  }
  ui.setBootProgress(10, 'LOADING TYPEFACES')
  try {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => window.setTimeout(resolve, 1800)),
    ])
  } catch {
    // The system fallback remains fully functional.
  }

  ui.setBootProgress(28, 'CALIBRATING OPTICS')
  const pmrem = new THREE.PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()
  const roomEnvironment = new RoomEnvironment()
  const environment = pmrem.fromScene(roomEnvironment, 0.035)
  scene.environment = environment.texture
  scene.environmentIntensity = 0.36
  roomEnvironment.dispose?.()
  pmrem.dispose()

  ui.setBootProgress(52, 'ASSEMBLING FLOOR 05')
  world = createWorld(scene, renderer, { lowPower })
  ui.setBootProgress(74, 'WAKING AGENT ROSTER')

  // Let the browser paint the boot state before the heavier final shader compile.
  await new Promise((resolve) => requestAnimationFrame(resolve))
  try {
    await renderer.compileAsync(scene, camera)
  } catch {
    // Compilation still occurs lazily on the first frame when this is unavailable.
  }

  ui.setBootProgress(93, 'SYNCING TELEMETRY')
  if (window.innerWidth > COMPACT_LAYOUT) selectAgent('nova')
  else ui.clearSelection()
  // Frame the office against the real HUD geometry once the rails and
  // selected-agent card have their final size.
  setView('iso', { animate: false })
  ui.updateClock()
  ui.setBootProgress(100, 'FLOOR 05 ONLINE')

  if (!reduceMotion) {
    window.setTimeout(() => ui.finishBoot(), 280)
  } else {
    ui.finishBoot()
  }

  window.setTimeout(() => {
    if (shiftGame.active) ui.toast('Shift live · open a priority brief, then issue the highlighted directive', 4200)
  }, 900)

  lastTime = performance.now()
  renderer.setAnimationLoop(frame)

  window.AGENT_HQ = {
    ready: true,
    simulation,
    shiftGame,
    ui,
    camera,
    controls,
    scene,
    renderer,
    world,
    views: VIEWS,
    selectAgent,
    clearSelection,
    showExecutiveConsole,
    conveneStandup,
    togglePause,
    setView,
    resetCamera,
    focusAgent,
    focusBoardroom,
    zoomCamera,
    projectAgent(id) {
      const agent = simulation.getAgent(id)
      if (!agent) return null
      const position = new THREE.Vector3(agent.position.x, 0.75, agent.position.z).project(camera)
      return {
        x: (position.x * 0.5 + 0.5) * window.innerWidth,
        y: (-position.y * 0.5 + 0.5) * window.innerHeight,
        visible: position.z > -1 && position.z < 1,
      }
    },
    projectWorld(x, y, z) {
      const position = new THREE.Vector3(x, y, z).project(camera)
      return {
        x: (position.x * 0.5 + 0.5) * window.innerWidth,
        y: (-position.y * 0.5 + 0.5) * window.innerHeight,
        visible: position.z > -1 && position.z < 1,
      }
    },
    getState() {
      return simulation.snapshot()
    },
    getMetrics() {
      return {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        pixelRatio: renderer.getPixelRatio(),
        memory: deviceMemory,
        lowPower,
      }
    },
  }
  document.dispatchEvent(new CustomEvent('agent-hq-ready'))
}

boot().catch((error) => {
  console.error(error)
  ui.setBootProgress(100, 'BOOT FAILURE')
  ui.toast('The floor could not initialize. Check the browser console.')
})
