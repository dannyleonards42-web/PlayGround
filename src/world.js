import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { AGENT_SEEDS } from './simulation.js'
import {
  makeArtTexture,
  makeAwardTexture,
  makeBoardroomTexture,
  makeBrandSignTexture,
  makeCoffeeMenuTexture,
  makeFloorBrandTexture,
  makeFloorTexture,
  makeKeyboardTexture,
  makeRugTexture,
  makeScreenTexture,
  makeShadowTexture,
  makeTabletTexture,
  makeWallClockTexture,
  makeWhiteboardTexture,
} from './textures.js'

const TAU = Math.PI * 2
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const UNIT_CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 20)
const UNIT_SPHERE = new THREE.SphereGeometry(1, 20, 14)

function mesh(parent, geometry, material, position = [0, 0, 0], options = {}) {
  const item = new THREE.Mesh(geometry, material)
  item.position.set(position[0], position[1], position[2])
  if (options.rotation) item.rotation.set(options.rotation[0], options.rotation[1], options.rotation[2])
  if (options.scale) item.scale.set(options.scale[0], options.scale[1], options.scale[2])
  item.castShadow = options.castShadow ?? true
  item.receiveShadow = options.receiveShadow ?? true
  if (options.renderOrder !== undefined) item.renderOrder = options.renderOrder
  if (options.name) item.name = options.name
  parent.add(item)
  return item
}

function box(parent, size, position, material, options = {}) {
  const item = mesh(parent, UNIT_BOX, material, position, {
    ...options,
    scale: size,
  })
  return item
}

function cylinder(parent, radiusTop, radiusBottom, height, position, material, options = {}) {
  let geometry = UNIT_CYLINDER
  if (radiusTop !== radiusBottom) {
    geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, 1, options.segments || 20)
  }
  const item = mesh(parent, geometry, material, position, {
    ...options,
    scale: radiusTop === radiusBottom ? [radiusTop, height, radiusTop] : [1, height, 1],
  })
  return item
}

function sphere(parent, radius, position, material, options = {}) {
  return mesh(parent, UNIT_SPHERE, material, position, { ...options, scale: [radius, radius, radius] })
}

function capsule(parent, radius, length, position, material, options = {}) {
  const geometry = new THREE.CapsuleGeometry(radius, length, 5, 12)
  return mesh(parent, geometry, material, position, options)
}

function boxRound(parent, size, position, material, radius = 0.04, options = {}) {
  const geometry = new RoundedBoxGeometry(size[0], size[1], size[2], 3, radius)
  return mesh(parent, geometry, material, position, options)
}

function createMaterials(renderer) {
  const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  const floorMap = makeFloorTexture()
  floorMap.anisotropy = maxAnisotropy

  const materials = {
    floor: new THREE.MeshStandardMaterial({
      color: 0xd0c8b9,
      map: floorMap,
      roughness: 0.53,
      metalness: 0.04,
      envMapIntensity: 0.55,
    }),
    plinth: new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.42, metalness: 0.52 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x151617, roughness: 0.74, metalness: 0.08 }),
    wallSoft: new THREE.MeshStandardMaterial({ color: 0x1c1d1e, roughness: 0.88, metalness: 0.02 }),
    slat: new THREE.MeshStandardMaterial({ color: 0x24211c, roughness: 0.5, metalness: 0.16 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x101113, roughness: 0.38, metalness: 0.34 }),
    blackGloss: new THREE.MeshStandardMaterial({ color: 0x090a0b, roughness: 0.17, metalness: 0.58 }),
    graphite: new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.48, metalness: 0.28 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xcba35f, roughness: 0.23, metalness: 0.9, envMapIntensity: 1.1 }),
    goldSoft: new THREE.MeshStandardMaterial({ color: 0xa9864c, roughness: 0.4, metalness: 0.7 }),
    white: new THREE.MeshStandardMaterial({ color: 0xdfdbd1, roughness: 0.46, metalness: 0.03 }),
    ivory: new THREE.MeshStandardMaterial({ color: 0xc9c3b8, roughness: 0.82, metalness: 0.01 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0xbcb6aa, roughness: 0.92, metalness: 0 }),
    fabricDark: new THREE.MeshStandardMaterial({ color: 0x262728, roughness: 0.9, metalness: 0.02 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xd8e5e5,
      roughness: 0.06,
      metalness: 0.05,
      transparent: true,
      opacity: 0.13,
      side: THREE.DoubleSide,
      depthWrite: false,
      envMapIntensity: 1.3,
      clearcoat: 0.7,
      clearcoatRoughness: 0.04,
    }),
    glassEdge: new THREE.MeshStandardMaterial({ color: 0x8b9697, roughness: 0.18, metalness: 0.6 }),
    screenBack: new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.19, metalness: 0.58 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffe9c1, toneMapped: false }),
    glowSoft: new THREE.MeshBasicMaterial({ color: 0xcfa76b, transparent: true, opacity: 0.36, toneMapped: false, depthWrite: false }),
    warmPanel: new THREE.MeshStandardMaterial({
      color: 0xd4b579,
      emissive: 0xd3a660,
      emissiveIntensity: 1.8,
      roughness: 0.3,
      metalness: 0.18,
    }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x354037, roughness: 0.7, metalness: 0.02 }),
    leafAlt: new THREE.MeshStandardMaterial({ color: 0x465148, roughness: 0.74, metalness: 0.01 }),
    terracotta: new THREE.MeshStandardMaterial({ color: 0x2b2a27, roughness: 0.6, metalness: 0.16 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xe6e0d4, roughness: 0.9, metalness: 0 }),
    carpet: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: makeRugTexture('#d6d0c4'),
      roughness: 0.95,
      metalness: 0,
    }),
    carpetDark: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: makeRugTexture('#1a1b1c', '#050607'),
      roughness: 0.96,
      metalness: 0,
    }),
    runner: new THREE.MeshStandardMaterial({
      color: 0x6f675a,
      roughness: 0.9,
      metalness: 0.03,
    }),
    screen: null,
  }

  materials.shell = new THREE.MeshPhysicalMaterial({
    color: 0xe8e3d8,
    roughness: 0.26,
    metalness: 0.08,
    clearcoat: 0.7,
    clearcoatRoughness: 0.22,
    envMapIntensity: 1.1,
  })
  materials.shellWarm = new THREE.MeshPhysicalMaterial({
    color: 0xd8d0bf,
    roughness: 0.3,
    metalness: 0.1,
    clearcoat: 0.55,
    clearcoatRoughness: 0.3,
    envMapIntensity: 1,
  })
  materials.visor = new THREE.MeshBasicMaterial({ color: 0xfff0ce, toneMapped: false })
  materials.visorGold = new THREE.MeshBasicMaterial({ color: 0xe8bd79, toneMapped: false })
  materials.robotDark = new THREE.MeshPhysicalMaterial({
    color: 0x0b0c0d,
    roughness: 0.2,
    metalness: 0.55,
    clearcoat: 0.8,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.4,
  })
  materials.shadow = new THREE.MeshBasicMaterial({
    map: makeShadowTexture(),
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    toneMapped: false,
  })
  materials.selection = new THREE.MeshBasicMaterial({
    color: 0xd4a85d,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
  materials.keyboard = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: makeKeyboardTexture(),
    roughness: 0.58,
    metalness: 0.22,
  })
  return materials
}

function addInlayLine(parent, width, depth, y, material = null) {
  const mats = material || null
  return { width, depth, y, mats }
}

function buildPlatform(scene, materials) {
  const group = new THREE.Group()
  group.name = 'floor-platform'
  box(group, [24.4, 0.52, 17.2], [0, -0.28, 0], materials.plinth, { castShadow: false })
  box(group, [23.2, 0.08, 16.0], [0, -0.01, 0], materials.floor, { castShadow: false })
  box(group, [23.24, 0.035, 0.026], [0, 0.036, 7.96], materials.gold, { castShadow: false })
  box(group, [23.24, 0.035, 0.026], [0, 0.036, -7.96], materials.gold, { castShadow: false })
  box(group, [0.026, 0.035, 15.94], [11.58, 0.036, 0], materials.gold, { castShadow: false })
  box(group, [0.026, 0.035, 15.94], [-11.58, 0.036, 0], materials.gold, { castShadow: false })

  // Darkstone perimeter inlay.
  const inlay = new THREE.MeshBasicMaterial({ color: 0x1a1917, transparent: true, opacity: 0.7, toneMapped: false })
  box(group, [22.6, 0.012, 0.055], [0, 0.034, 7.2], inlay, { castShadow: false })
  box(group, [22.6, 0.012, 0.055], [0, 0.034, -7.2], inlay, { castShadow: false })
  box(group, [0.055, 0.012, 14.4], [10.85, 0.034, 0], inlay, { castShadow: false })
  box(group, [0.055, 0.012, 14.4], [-10.85, 0.034, 0], inlay, { castShadow: false })
  scene.add(group)
  return group
}

function buildShell(scene, materials) {
  const group = new THREE.Group()
  group.name = 'architectural-shell'

  // Back wall
  box(group, [23.2, 4.7, 0.28], [0, 2.35, -7.86], materials.wall)
  // Slatted timber section
  const slatGeometry = new THREE.BoxGeometry(0.065, 3.72, 0.13)
  const slats = new THREE.InstancedMesh(slatGeometry, materials.slat, 39)
  const matrix = new THREE.Matrix4()
  for (let i = 0; i < 39; i += 1) {
    matrix.makeTranslation(-10.65 + i * 0.56, 2.16, -7.66)
    slats.setMatrixAt(i, matrix)
  }
  slats.castShadow = true
  slats.receiveShadow = true
  group.add(slats)

  // Vertical gold reveal and trim
  box(group, [23.2, 0.035, 0.03], [0, 3.98, -7.63], materials.goldSoft, { castShadow: false })
  box(group, [23.2, 0.06, 0.08], [0, 0.09, -7.64], materials.gold) // baseboard
  box(group, [23.2, 0.15, 0.22], [0, 4.48, -7.68], materials.blackGloss)

  // Wall-wash glow strips
  box(group, [8.8, 0.025, 0.02], [-3.2, 4.15, -7.6], materials.warmPanel, { castShadow: false })

  // Left wall
  box(group, [0.28, 4.7, 15.9], [-11.55, 2.35, 0], materials.wall)
  box(group, [0.26, 0.14, 15.9], [-11.4, 4.46, 0], materials.blackGloss)
  box(group, [0.035, 0.035, 15.9], [-11.37, 3.94, 0], materials.goldSoft, { castShadow: false })
  box(group, [0.035, 0.06, 15.9], [-11.38, 0.09, 0], materials.gold)

  // Right wall only behind boardroom
  box(group, [0.28, 4.7, 8.2], [11.55, 2.35, -3.8], materials.wall)
  box(group, [0.035, 0.035, 8.2], [11.37, 3.94, -3.8], materials.goldSoft, { castShadow: false })

  // Main brand sign
  const signTexture = makeBrandSignTexture()
  const sign = mesh(group, new THREE.PlaneGeometry(5.6, 1.54), new THREE.MeshBasicMaterial({
    map: signTexture,
    transparent: true,
    toneMapped: false,
  }), [-1.1, 3.05, -7.6], { castShadow: false, receiveShadow: false })
  sign.name = 'brand-sign'

  // Whiteboard behind the strategy desk.
  const wb = new THREE.Group()
  wb.position.set(-8.55, 2.48, -7.67)
  const wbTexture = makeWhiteboardTexture()
  mesh(wb, new THREE.PlaneGeometry(2.16, 1.2), new THREE.MeshBasicMaterial({ map: wbTexture, toneMapped: false }), [0, 0, 0.03], { castShadow: false })
  box(wb, [2.28, 0.035, 0.055], [0, 0.62, 0.035], materials.dark, { castShadow: false })
  box(wb, [2.28, 0.035, 0.055], [0, -0.62, 0.035], materials.dark, { castShadow: false })
  box(wb, [0.035, 1.25, 0.055], [-1.14, 0, 0.035], materials.dark, { castShadow: false })
  box(wb, [0.035, 1.25, 0.055], [1.14, 0, 0.035], materials.dark, { castShadow: false })
  group.add(wb)

  // Wall clock.
  const clock = mesh(group, new THREE.CircleGeometry(0.44, 48), new THREE.MeshBasicMaterial({
    map: makeWallClockTexture(),
    toneMapped: false,
  }), [4.05, 3.1, -7.66], { castShadow: false, receiveShadow: false })
  clock.name = 'wall-clock'
  cylinder(group, 0.03, 0.03, 0.12, [4.05, 3.1, -7.62], materials.gold, { rotation: [Math.PI / 2, 0, 0], castShadow: false })

  // Art on left wall.
  const art = new THREE.Group()
  art.position.set(-11.36, 2.36, 4.85)
  art.rotation.y = Math.PI / 2
  const artTexture = makeArtTexture(0)
  mesh(art, new THREE.PlaneGeometry(1.35, 1.72), new THREE.MeshBasicMaterial({ map: artTexture, toneMapped: false }), [0, 0, 0.02], { castShadow: false })
  box(art, [1.51, 0.045, 0.055], [0, 0.9, 0.035], materials.dark, { castShadow: false })
  box(art, [1.51, 0.045, 0.055], [0, -0.9, 0.035], materials.dark, { castShadow: false })
  box(art, [0.045, 1.82, 0.055], [-0.75, 0, 0.035], materials.dark, { castShadow: false })
  box(art, [0.045, 1.82, 0.055], [0.75, 0, 0.035], materials.dark, { castShadow: false })
  group.add(art)

  // A single sculptural wall panel.
  const panel = new THREE.Group()
  panel.position.set(-11.32, 1.9, 0.3)
  panel.rotation.y = Math.PI / 2
  box(panel, [2.1, 1.65, 0.06], [0, 0, 0], materials.blackGloss, { castShadow: false })
  for (let i = 0; i < 10; i += 1) {
    box(panel, [0.018, 1.38, 0.018], [-0.87 + i * 0.193, 0, 0.045], materials.goldSoft, { castShadow: false })
  }
  group.add(panel)

  // Pendant rails and luminaires.
  const makePendant = (x, z, length, rotation = 0, y = 3.72) => {
    const pendant = new THREE.Group()
    pendant.position.set(x, y, z)
    pendant.rotation.y = rotation
    box(pendant, [length, 0.09, 0.1], [0, 0, 0], materials.blackGloss, { castShadow: false })
    box(pendant, [length - 0.08, 0.012, 0.06], [0, -0.055, 0], materials.warmPanel, { castShadow: false })
    box(pendant, [0.015, 1.5, 0.015], [-length * 0.36, 0.75, 0], materials.dark, { castShadow: false })
    box(pendant, [0.015, 1.5, 0.015], [length * 0.36, 0.75, 0], materials.dark, { castShadow: false })
    group.add(pendant)
  }
  makePendant(-2.55, -3.68, 6.6)
  makePendant(-8.15, 0.4, 3.3, Math.PI / 2, 3.64)
  makePendant(7.8, -4.15, 3.9, 0, 3.62)

  // Circular executive pendant.
  const execPendant = new THREE.Group()
  execPendant.position.set(-2.45, 3.85, -0.95)
  const ring = mesh(execPendant, new THREE.TorusGeometry(0.58, 0.025, 8, 64), materials.gold, [0, 0, 0], { rotation: [Math.PI / 2, 0, 0], castShadow: false })
  const disc = mesh(execPendant, new THREE.CircleGeometry(0.53, 48), new THREE.MeshBasicMaterial({
    color: 0xffe6ba,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    toneMapped: false,
  }), [0, -0.015, 0], { rotation: [Math.PI / 2, 0, 0], castShadow: false })
  ring.name = 'executive-pendant-ring'
  disc.name = 'executive-pendant-disc'
  box(execPendant, [0.015, 1.1, 0.015], [0.38, 0.6, 0], materials.dark, { castShadow: false })
  group.add(execPendant)

  scene.add(group)
  return group
}

function buildWorkstation(agent, materials) {
  const root = new THREE.Group()
  root.position.set(agent.home.x, 0, agent.home.z)
  root.rotation.y = agent.home.rotation
  root.name = `workstation-${agent.id}`

  // Desk top + edge and legs.
  boxRound(root, [2.25, 0.07, 1.08], [0, 0.77, 0.67], materials.blackGloss, 0.045)
  box(root, [2.27, 0.016, 0.018], [0, 0.805, 1.205], materials.goldSoft, { castShadow: false })
  box(root, [2.0, 0.32, 0.04], [0, 0.54, 0.19], materials.graphite)
  ;[-0.98, 0.98].forEach((x) => {
    box(root, [0.045, 0.72, 0.68], [x, 0.37, 0.65], materials.graphite)
    box(root, [0.055, 0.055, 1.0], [x, 0.03, 0.65], materials.dark, { castShadow: false })
  })

  // Monitor, rear detail and floating light.
  const monitor = new THREE.Group()
  monitor.position.set(0.2, 0.85, 0.99)
  cylinder(monitor, 0.2, 0.25, 0.025, [0, 0.025, 0], materials.dark, { castShadow: false })
  box(monitor, [0.035, 0.36, 0.035], [0, 0.2, 0], materials.dark)
  boxRound(monitor, [1.03, 0.58, 0.05], [0, 0.57, 0], materials.screenBack, 0.035)
  box(monitor, [0.96, 0.015, 0.018], [0, 0.275, 0.03], materials.goldSoft, { castShadow: false })
  const rearLogo = mesh(monitor, new THREE.TorusGeometry(0.085, 0.008, 6, 28), materials.gold, [0, 0.57, 0.029], { castShadow: false })
  rearLogo.name = 'monitor-emblem'
  const rearGlow = mesh(monitor, new THREE.PlaneGeometry(0.74, 0.44), new THREE.MeshBasicMaterial({
    color: 0x071014,
    transparent: true,
    opacity: 0.12,
    toneMapped: false,
  }), [0, 0.57, 0.027], { castShadow: false })
  rearGlow.name = 'monitor-rear-display'
  root.add(monitor)

  // A small outward-facing status tablet makes each workstation feel alive.
  const tablet = new THREE.Group()
  tablet.position.set(0.64, 0.825, 0.35)
  tablet.rotation.x = -0.18
  const tabletBack = boxRound(tablet, [0.5, 0.32, 0.025], [0, 0.12, 0], materials.screenBack, 0.018)
  const tabletTexture = makeTabletTexture(agent)
  const tabletFace = mesh(tablet, new THREE.PlaneGeometry(0.46, 0.28), new THREE.MeshBasicMaterial({
    map: tabletTexture,
    toneMapped: false,
  }), [0, 0.12, 0.015], { castShadow: false, receiveShadow: false })
  tabletFace.name = `tablet-${agent.id}`
  box(tablet, [0.12, 0.035, 0.1], [0, -0.04, 0], materials.graphite, { castShadow: false })
  root.add(tablet)

  // Keyboard, mouse, mug and desk items.
  box(root, [0.72, 0.022, 0.23], [-0.05, 0.813, 0.53], materials.keyboard, { castShadow: false })
  boxRound(root, [0.12, 0.025, 0.18], [0.46, 0.817, 0.51], materials.graphite, 0.03, { castShadow: false })
  cylinder(root, 0.06, 0.052, 0.09, [-0.78, 0.855, 0.55], materials.white, { castShadow: false })
  cylinder(root, 0.063, 0.063, 0.012, [-0.78, 0.906, 0.55], materials.gold, { castShadow: false })
  cylinder(root, 0.028, 0.028, 0.008, [-0.78, 0.913, 0.55], materials.graphite, { castShadow: false })
  box(root, [0.3, 0.012, 0.22], [-0.9, 0.814, 0.92], materials.paper, { castShadow: false, rotation: [0, -0.17, 0] })
  box(root, [0.012, 0.008, 0.22], [-0.9, 0.824, 0.92], materials.goldSoft, { castShadow: false, rotation: [0, -0.17, 0] })

  // Small desk lamp.
  const lamp = new THREE.Group()
  lamp.position.set(-0.98, 0.82, 1.0)
  cylinder(lamp, 0.14, 0.17, 0.03, [0, 0, 0], materials.dark, { castShadow: false })
  cylinder(lamp, 0.018, 0.018, 0.54, [0, 0.28, 0], materials.goldSoft, { castShadow: false, rotation: [0, 0, 0.12] })
  const shade = mesh(lamp, new THREE.ConeGeometry(0.13, 0.16, 20, 1, true), materials.graphite, [0.02, 0.58, 0], { castShadow: false })
  shade.rotation.x = Math.PI
  const bulb = sphere(lamp, 0.037, [0.02, 0.5, 0], materials.glow, { castShadow: false })
  bulb.name = 'desk-bulb'
  root.add(lamp)

  // Tiny potted plant.
  const plant = new THREE.Group()
  plant.position.set(0.94, 0.82, 0.95)
  cylinder(plant, 0.075, 0.06, 0.12, [0, 0.06, 0], materials.terracotta, { castShadow: false })
  const leafGeo = new THREE.SphereGeometry(0.1, 10, 7)
  for (let i = 0; i < 5; i += 1) {
    const leaf = mesh(plant, leafGeo, i % 2 ? materials.leafAlt : materials.leaf, [
      Math.cos(i * 1.25) * 0.08,
      0.17 + (i % 3) * 0.035,
      Math.sin(i * 1.25) * 0.08,
    ], { castShadow: false, scale: [0.55, 1.4, 0.32] })
    leaf.rotation.z = Math.cos(i * 1.25) * 0.55
    leaf.rotation.x = Math.sin(i * 1.25) * 0.45
  }
  root.add(plant)

  // PC beneath the desk.
  box(root, [0.27, 0.36, 0.4], [0.78, 0.47, 0.82], materials.dark, { castShadow: false })
  box(root, [0.015, 0.02, 0.28], [0.64, 0.6, 0.82], materials.glowSoft, { castShadow: false })
  cylinder(root, 0.07, 0.07, 0.015, [0.78, 0.47, 1.02], materials.gold, { castShadow: false, rotation: [Math.PI / 2, 0, 0] })

  // Chair.
  const chair = new THREE.Group()
  chair.position.set(0, 0, -0.14)
  chair.rotation.y = -0.06
  boxRound(chair, [0.56, 0.08, 0.55], [0, 0.48, 0], materials.fabric, 0.065)
  const back = boxRound(chair, [0.55, 0.62, 0.075], [0, 0.82, -0.27], materials.fabric, 0.06)
  back.rotation.x = -0.1
  ;[-0.28, 0.28].forEach((x) => box(chair, [0.025, 0.08, 0.5], [x, 0.61, 0], materials.graphite, { castShadow: false }))
  cylinder(chair, 0.035, 0.035, 0.27, [0, 0.32, 0], materials.graphite, { castShadow: false })
  cylinder(chair, 0.025, 0.025, 0.04, [0, 0.19, 0], materials.gold)
  ;[0, 1, 2, 3, 4].forEach((i) => {
    const angle = (i / 5) * TAU
    const spoke = box(chair, [0.3, 0.022, 0.03], [Math.cos(angle) * 0.13, 0.16, Math.sin(angle) * 0.13], materials.graphite, { castShadow: false })
    spoke.rotation.y = -angle
    cylinder(chair, 0.035, 0.035, 0.045, [Math.cos(angle) * 0.25, 0.08, Math.sin(angle) * 0.25], materials.dark, { castShadow: false })
  })
  root.add(chair)

  return root
}

function createRobot(agent, materials) {
  const root = new THREE.Group()
  root.position.set(agent.home.x, 0, agent.home.z)
  root.rotation.y = agent.home.rotation
  root.name = `robot-${agent.id}`

  const bob = new THREE.Group()
  root.add(bob)

  // Hips, legs and feet.
  boxRound(bob, [0.29, 0.15, 0.22], [0, 0.65, 0], materials.robotDark, 0.055, { castShadow: false })
  cylinder(bob, 0.13, 0.15, 0.13, [0, 0.72, 0], materials.graphite, { castShadow: false })

  const legs = []
  ;[-0.085, 0.085].forEach((x) => {
    const hip = new THREE.Group()
    hip.position.set(x, 0.62, 0)
    const upper = capsule(hip, 0.066, 0.17, [0, -0.13, 0], materials.shellWarm, { castShadow: false })
    const joint = sphere(hip, 0.058, [0, -0.265, 0], materials.robotDark, { castShadow: false })
    const lower = capsule(hip, 0.052, 0.15, [0, -0.38, 0.012], materials.robotDark, { castShadow: false })
    const foot = boxRound(hip, [0.13, 0.08, 0.22], [0, -0.51, 0.055], materials.robotDark, 0.035, { castShadow: false })
    hip.userData.parts = { upper, joint, lower, foot }
    bob.add(hip)
    legs.push(hip)
  })

  // Torso shell.
  boxRound(bob, [0.43, 0.5, 0.29], [0, 1.03, 0], materials.shell, 0.13, { castShadow: false })
  boxRound(bob, [0.34, 0.3, 0.045], [0, 1.04, 0.16], materials.robotDark, 0.06, { castShadow: false })
  box(bob, [0.18, 0.012, 0.012], [0, 0.94, 0.19], materials.gold, { castShadow: false })
  box(bob, [0.01, 0.055, 0.012], [0, 1.08, 0.19], materials.goldSoft, { castShadow: false })
  sphere(bob, 0.021, [0, 1.12, 0.192], materials.visorGold, { castShadow: false })
  box(bob, [0.022, 0.36, 0.01], [0, 1.03, -0.152], materials.goldSoft, { castShadow: false })
  sphere(bob, 0.035, [0, 1.305, 0], materials.robotDark, { castShadow: false })

  // Shoulders and articulated arms.
  const arms = []
  ;[-0.265, 0.265].forEach((x) => {
    sphere(bob, 0.074, [x, 1.16, 0], materials.robotDark, { castShadow: false })
    cylinder(bob, 0.062, 0.062, 0.016, [x === 0 ? 0 : x * 1.03, 1.16, 0], materials.gold, {
      castShadow: false,
      rotation: [0, 0, Math.PI / 2],
    })
    const shoulder = new THREE.Group()
    shoulder.position.set(x, 1.14, 0)
    capsule(shoulder, 0.047, 0.13, [0, -0.09, 0], materials.shell, { castShadow: false })
    const elbow = new THREE.Group()
    elbow.position.set(0, -0.2, 0)
    capsule(elbow, 0.039, 0.1, [0, -0.08, 0], materials.robotDark, { castShadow: false })
    sphere(elbow, 0.046, [0, -0.17, 0.01], materials.shell, { castShadow: false })
    shoulder.add(elbow)
    bob.add(shoulder)
    arms.push({ shoulder, elbow })
  })

  // Head.
  const head = new THREE.Group()
  head.position.set(0, 1.4, 0)
  const skull = boxRound(head, [0.36, 0.31, 0.29], [0, 0, 0], materials.robotDark, 0.105, { castShadow: false })
  boxRound(head, [0.31, 0.075, 0.25], [0, 0.155, -0.01], materials.shell, 0.035, { castShadow: false })
  box(head, [0.25, 0.032, 0.018], [0, 0.092, 0.145], materials.goldSoft, { castShadow: false })
  const visor = capsule(head, 0.043, 0.145, [0, -0.005, 0.163], materials.visor, {
    rotation: [0, 0, Math.PI / 2],
    castShadow: false,
  })
  visor.name = `visor-${agent.id}`
  ;[-0.188, 0.188].forEach((x) => {
    cylinder(head, 0.047, 0.047, 0.027, [x, 0, 0], materials.shell, {
      castShadow: false,
      rotation: [0, 0, Math.PI / 2],
    })
    cylinder(head, 0.021, 0.021, 0.031, [x, 0, 0], materials.gold, {
      castShadow: false,
      rotation: [0, 0, Math.PI / 2],
    })
  })
  cylinder(head, 0.008, 0.008, 0.14, [0.06, 0.23, -0.01], materials.goldSoft, { castShadow: false })
  sphere(head, 0.021, [0.06, 0.305, -0.01], materials.gold, { castShadow: false })
  bob.add(head)

  // Floating identity ring.
  const ringMat = materials.selection.clone()
  ringMat.opacity = 0
  const ring = mesh(root, new THREE.RingGeometry(0.42, 0.485, 48), ringMat, [0, 0.022, 0], {
    rotation: [-Math.PI / 2, 0, 0],
    castShadow: false,
    receiveShadow: false,
  })
  ring.name = `selection-ring-${agent.id}`

  // Contact shadow.
  const shadow = mesh(root, new THREE.PlaneGeometry(0.86, 0.86), materials.shadow, [0, 0.012, 0], {
    rotation: [-Math.PI / 2, 0, 0],
    castShadow: false,
    receiveShadow: false,
  })
  shadow.name = `shadow-${agent.id}`

  return {
    root,
    bob,
    head,
    arms,
    legs,
    visor,
    ring,
    shadow,
    headBaseY: 1.4,
  }
}

function buildBoardroom(scene, materials) {
  const group = new THREE.Group()
  group.name = 'boardroom'
  const roomX = 7.9
  const roomZ = -4.18

  // Floor rug, slightly inset.
  box(group, [5.45, 0.018, 4.9], [roomX + 0.2, 0.043, roomZ], materials.carpetDark, { castShadow: false })
  box(group, [5.25, 0.006, 0.04], [roomX + 0.2, 0.055, roomZ + 2.4], materials.goldSoft, { castShadow: false })

  // Glass walls.
  const glass = materials.glass
  box(group, [5.8, 3.15, 0.025], [7.95, 1.62, -1.0], glass, { castShadow: false, receiveShadow: false })
  box(group, [0.025, 3.15, 6.45], [4.93, 1.62, -4.2], glass, { castShadow: false, receiveShadow: false })
  // Sliding door slightly ajar.
  const door = box(group, [1.44, 3.0, 0.025], [6.37, 1.54, -0.96], glass, { castShadow: false, receiveShadow: false })
  door.rotation.y = -0.13
  // Frames.
  const frame = materials.dark
  ;[5.05, 6.1, 7.55, 8.95, 10.82].forEach((x) => {
    box(group, [0.035, 3.18, 0.05], [x, 1.62, -1.0], frame, { castShadow: false })
  })
  box(group, [5.8, 0.05, 0.05], [7.95, 3.2, -1.0], frame, { castShadow: false })
  box(group, [5.8, 0.016, 0.055], [7.95, 0.055, -1.0], materials.gold, { castShadow: false })
  box(group, [0.05, 0.05, 6.45], [4.93, 3.2, -4.2], frame, { castShadow: false })
  box(group, [0.05, 0.05, 6.45], [10.82, 3.2, -4.2], frame, { castShadow: false })
  box(group, [0.05, 0.05, 6.45], [4.93, 0.055, -4.2], materials.gold, { castShadow: false })
  box(group, [0.05, 0.05, 6.45], [10.82, 0.055, -4.2], materials.gold, { castShadow: false })

  // Door handle.
  cylinder(group, 0.014, 0.014, 0.52, [5.94, 1.22, -0.9], materials.gold, { castShadow: false, rotation: [0, 0, 0.02] })
  // Glass manifestation line.
  box(group, [1.33, 0.012, 0.01], [6.35, 1.8, -0.98], materials.goldSoft, { castShadow: false, rotation: [0, -0.13, 0] })

  // Boardroom table.
  boxRound(group, [3.5, 0.075, 1.25], [7.9, 0.78, -4.16], materials.blackGloss, 0.09)
  box(group, [3.35, 0.012, 0.018], [7.9, 0.826, -3.53], materials.gold, { castShadow: false })
  cylinder(group, 1.05, 1.05, 0.03, [7.9, 0.09, -4.16], materials.dark, { castShadow: false })
  cylinder(group, 0.14, 0.28, 0.66, [7.9, 0.39, -4.16], materials.graphite)
  // Table details.
  box(group, [0.3, 0.035, 0.16], [6.95, 0.84, -4.05], materials.graphite, { castShadow: false })
  box(group, [0.3, 0.035, 0.16], [8.85, 0.84, -4.05], materials.graphite, { castShadow: false })
  cylinder(group, 0.026, 0.026, 0.11, [7.35, 0.86, -4.24], materials.gold, { castShadow: false })
  cylinder(group, 0.026, 0.026, 0.11, [8.45, 0.86, -4.24], materials.gold, { castShadow: false })
  // A slim central planter.
  cylinder(group, 0.11, 0.12, 0.17, [7.9, 0.88, -4.17], materials.terracotta, { castShadow: false })
  for (let i = 0; i < 7; i += 1) {
    const leaf = sphere(group, 0.08, [7.9 + Math.cos(i * 1.8) * 0.11, 1.01 + (i % 2) * 0.035, -4.17 + Math.sin(i * 1.8) * 0.11], materials.leaf, {
      castShadow: false,
      scale: [0.5, 1.4, 0.3],
      rotation: [0.3 * Math.sin(i), 0, 0.4 * Math.cos(i)],
    })
    leaf.name = 'boardroom-leaf'
  }

  // Conference chairs.
  const chairPositions = [
    [6.25, -3.82, -Math.PI / 2 + 0.1],
    [7.9, -3.7, Math.PI],
    [9.55, -3.82, Math.PI / 2 - 0.1],
    [6.25, -4.55, -Math.PI / 2 - 0.1],
    [7.9, -4.68, 0],
    [9.55, -4.55, Math.PI / 2 + 0.1],
  ]
  chairPositions.forEach(([x, z, rotation], index) => {
    const chair = new THREE.Group()
    chair.position.set(x, 0, z)
    chair.rotation.y = rotation
    boxRound(chair, [0.52, 0.065, 0.5], [0, 0.48, 0], index % 2 ? materials.fabricDark : materials.fabric, 0.05, { castShadow: true })
    const back = boxRound(chair, [0.52, 0.55, 0.07], [0, 0.76, -0.25], index % 2 ? materials.fabricDark : materials.fabric, 0.055)
    back.rotation.x = -0.08
    ;[-0.25, 0.25].forEach((armX) => {
      box(chair, [0.025, 0.05, 0.44], [armX, 0.63, -0.01], materials.graphite, { castShadow: false })
      box(chair, [0.025, 0.22, 0.025], [armX, 0.54, 0.18], materials.graphite, { castShadow: false })
    })
    cylinder(chair, 0.032, 0.032, 0.24, [0, 0.3, 0], materials.graphite, { castShadow: false })
    ;[0, 1, 2, 3].forEach((legIndex) => {
      const angle = (legIndex / 4) * TAU + Math.PI / 4
      const spoke = box(chair, [0.33, 0.02, 0.025], [Math.cos(angle) * 0.14, 0.17, Math.sin(angle) * 0.14], materials.graphite, { castShadow: false })
      spoke.rotation.y = -angle
    })
    group.add(chair)
  })

  // Presentation screen on the back wall.
  box(group, [2.55, 1.46, 0.05], [7.9, 2.64, -7.62], materials.blackGloss, { castShadow: false })
  const screen = mesh(group, new THREE.PlaneGeometry(2.41, 1.35), new THREE.MeshBasicMaterial({
    map: makeBoardroomTexture(),
    toneMapped: false,
  }), [7.9, 2.64, -7.584], { castShadow: false })
  screen.name = 'boardroom-presentation'
  box(group, [2.64, 0.025, 0.07], [7.9, 1.9, -7.59], materials.goldSoft, { castShadow: false })

  // Boardroom nameplate etched into the glass.
  const plaqueMat = new THREE.MeshBasicMaterial({ color: 0xe8dfcf, transparent: true, opacity: 0.78, toneMapped: false })
  const plaque = new THREE.Group()
  plaque.position.set(10.79, 2.38, -1.06)
  plaque.rotation.y = Math.PI / 2
  box(plaque, [1.35, 0.35, 0.015], [0, 0, 0], new THREE.MeshBasicMaterial({ color: 0x111213, transparent: true, opacity: 0.45, toneMapped: false }), { castShadow: false })
  const plaqueText = document.createElement('canvas')
  plaqueText.width = 512
  plaqueText.height = 128
  const pctx = plaqueText.getContext('2d')
  pctx.clearRect(0, 0, 512, 128)
  pctx.fillStyle = '#e7dfd0'
  pctx.font = '500 26px Manrope, sans-serif'
  pctx.textAlign = 'center'
  pctx.fillText('BOARDROOM', 256, 56)
  pctx.fillStyle = '#cba35f'
  pctx.font = '500 16px Manrope, sans-serif'
  pctx.fillText('FLOOR 05  /  PRIVATE', 256, 88)
  const plaqueTexture = new THREE.CanvasTexture(plaqueText)
  plaqueTexture.colorSpace = THREE.SRGBColorSpace
  mesh(plaque, new THREE.PlaneGeometry(1.35, 0.34), new THREE.MeshBasicMaterial({ map: plaqueTexture, transparent: true, toneMapped: false }), [0, 0, 0.012], { castShadow: false })
  group.add(plaque)

  // Glass, table, and meeting accessories are separate from the static merge only when needed.
  scene.add(group)
  return group
}

function buildExecutiveDesk(scene, materials) {
  const group = new THREE.Group()
  group.name = 'executive-desk'
  group.position.set(-2.45, 0, -0.84)

  // Rug under the executive island.
  box(group, [4.7, 0.017, 3.0], [0, 0.042, 0.3], materials.carpet, { castShadow: false })
  box(group, [4.55, 0.008, 0.032], [0, 0.052, 1.78], materials.goldSoft, { castShadow: false })

  // Desk top.
  boxRound(group, [3.3, 0.085, 1.24], [0, 0.78, 0.63], materials.blackGloss, 0.07)
  box(group, [3.16, 0.012, 0.018], [0, 0.831, 1.22], materials.gold, { castShadow: false })
  box(group, [3.0, 0.012, 0.018], [0, 0.831, 0.05], materials.goldSoft, { castShadow: false })
  ;[-1.42, 1.42].forEach((x) => {
    box(group, [0.07, 0.75, 0.9], [x, 0.38, 0.63], materials.graphite)
    box(group, [0.85, 0.045, 0.08], [x * 0.94, 0.035, 0.63], materials.dark, { castShadow: false })
  })
  box(group, [2.7, 0.3, 0.04], [0, 0.51, 0.18], materials.graphite)

  // High-back executive chair.
  const chair = new THREE.Group()
  chair.position.set(0, 0, -0.18)
  boxRound(chair, [0.75, 0.12, 0.72], [0, 0.57, 0], materials.fabricDark, 0.085)
  const back = boxRound(chair, [0.78, 1.2, 0.13], [0, 1.03, -0.4], materials.fabricDark, 0.08)
  back.rotation.x = -0.09
  box(chair, [0.018, 1.0, 0.018], [0, 1.04, -0.46], materials.gold, { castShadow: false })
  ;[-0.4, 0.4].forEach((x) => {
    box(chair, [0.06, 0.14, 0.62], [x, 0.68, 0], materials.graphite, { castShadow: false })
  })
  cylinder(chair, 0.06, 0.06, 0.38, [0, 0.32, 0], materials.graphite, { castShadow: false })
  cylinder(chair, 0.055, 0.055, 0.03, [0, 0.11, 0], materials.gold, { castShadow: false })
  ;[0, 1, 2, 3, 4].forEach((i) => {
    const angle = (i / 5) * TAU
    const spoke = box(chair, [0.45, 0.025, 0.035], [Math.cos(angle) * 0.2, 0.1, Math.sin(angle) * 0.2], materials.graphite, { castShadow: false })
    spoke.rotation.y = -angle
  })
  group.add(chair)

  // Twin monitors, turned slightly so the room can read their edge-lit hardware.
  ;[-0.53, 0.53].forEach((x, index) => {
    const monitor = new THREE.Group()
    monitor.position.set(x, 0.86, 0.86)
    cylinder(monitor, 0.2, 0.24, 0.025, [0, 0.025, 0], materials.dark, { castShadow: false })
    box(monitor, [0.035, 0.33, 0.035], [0, 0.18, 0], materials.dark)
    boxRound(monitor, [1.0, 0.56, 0.05], [0, 0.53, 0], materials.screenBack, 0.03)
    box(monitor, [0.92, 0.012, 0.018], [0, 0.255, 0.03], materials.goldSoft, { castShadow: false })
    const emblem = mesh(monitor, new THREE.TorusGeometry(0.07, 0.007, 6, 24), materials.gold, [0, 0.53, 0.028], { castShadow: false })
    emblem.rotation.z = index ? 0.2 : -0.2
    monitor.rotation.y = index ? -0.12 : 0.12
    group.add(monitor)
  })

  // Laptop with a closed-lid brushed finish, nameplate, lamp, notebook and orchid.
  boxRound(group, [0.72, 0.025, 0.46], [0, 0.84, 0.43], materials.graphite, 0.03)
  box(group, [0.74, 0.012, 0.49], [0, 0.855, 0.43], materials.blackGloss, { castShadow: false })
  const nameplate = new THREE.Group()
  nameplate.position.set(1.08, 0.84, 0.33)
  nameplate.rotation.y = -0.15
  box(nameplate, [0.52, 0.13, 0.09], [0, 0, 0], materials.gold, { castShadow: false })
  box(nameplate, [0.5, 0.11, 0.012], [0, 0, 0.05], materials.blackGloss, { castShadow: false })
  group.add(nameplate)

  const lamp = new THREE.Group()
  lamp.position.set(-1.35, 0.83, 0.98)
  cylinder(lamp, 0.15, 0.18, 0.03, [0, 0, 0], materials.dark, { castShadow: false })
  cylinder(lamp, 0.014, 0.014, 0.58, [0, 0.3, 0], materials.gold, { castShadow: false, rotation: [0, 0, 0.14] })
  const shade = mesh(lamp, new THREE.ConeGeometry(0.16, 0.18, 24, 1, true), materials.graphite, [0.08, 0.58, 0], { castShadow: false })
  shade.rotation.x = Math.PI
  sphere(lamp, 0.045, [0.08, 0.49, 0], materials.glow, { castShadow: false })
  group.add(lamp)

  const orchid = new THREE.Group()
  orchid.position.set(1.3, 0.84, 0.95)
  cylinder(orchid, 0.1, 0.075, 0.18, [0, 0.09, 0], materials.terracotta, { castShadow: false })
  cylinder(orchid, 0.008, 0.008, 0.55, [0.02, 0.35, 0], materials.leaf, { castShadow: false, rotation: [0, 0, -0.08] })
  for (let i = 0; i < 5; i += 1) {
    const flower = sphere(orchid, 0.045, [0.03 + Math.sin(i) * 0.045, 0.4 + i * 0.055, Math.cos(i) * 0.03], materials.paper, {
      castShadow: false,
      scale: [1.3, 0.55, 1],
    })
    flower.rotation.z = i * 0.6
  }
  group.add(orchid)

  // Holographic executive core.
  const hologram = new THREE.Group()
  hologram.position.set(-0.05, 1.3, 0.42)
  hologram.name = 'executive-hologram'
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xd7ad68,
    wireframe: true,
    transparent: true,
    opacity: 0.42,
    toneMapped: false,
  })
  const core = mesh(hologram, new THREE.IcosahedronGeometry(0.28, 1), coreMat, [0, 0, 0], { castShadow: false, receiveShadow: false })
  core.name = 'executive-core'
  const halo = mesh(hologram, new THREE.TorusGeometry(0.42, 0.005, 6, 64), new THREE.MeshBasicMaterial({
    color: 0xe4be7e,
    transparent: true,
    opacity: 0.55,
    toneMapped: false,
  }), [0, 0, 0], { rotation: [Math.PI / 2, 0, 0], castShadow: false })
  halo.name = 'executive-halo'
  const light = new THREE.PointLight(0xf1bf75, 7, 4.2, 2)
  light.position.set(0, 0.25, 0)
  hologram.add(light)
  group.add(hologram)

  scene.add(group)
  return { group, hologram, core, halo }
}

function buildLounge(scene, materials) {
  const group = new THREE.Group()
  group.name = 'lounge'
  box(group, [4.9, 0.02, 4.0], [8.0, 0.042, 3.58], materials.carpet, { castShadow: false })

  // Sofa.
  const sofa = new THREE.Group()
  sofa.position.set(9.2, 0, 3.52)
  sofa.rotation.y = -Math.PI / 2
  boxRound(sofa, [2.75, 0.24, 0.9], [0, 0.33, 0], materials.fabric, 0.11)
  boxRound(sofa, [2.65, 0.26, 0.23], [0, 0.52, -0.38], materials.fabric, 0.08)
  const back = boxRound(sofa, [2.75, 0.74, 0.2], [0, 0.69, -0.49], materials.fabric, 0.09)
  back.rotation.x = -0.08
  ;[-1.1, 1.1].forEach((x) => {
    boxRound(sofa, [0.18, 0.46, 0.78], [x, 0.5, 0], materials.fabric, 0.08)
  })
  ;[-0.58, 0.58].forEach((x, i) => {
    const cushion = boxRound(sofa, [0.46, 0.46, 0.16], [x, 0.79, -0.35], i ? materials.ivory : materials.fabricDark, 0.06)
    cushion.rotation.x = -0.16
    cushion.rotation.z = i ? -0.12 : 0.1
  })
  ;[-1.1, 1.1].forEach((x) => {
    box(sofa, [0.035, 0.17, 0.035], [x, 0.12, 0], materials.gold, { castShadow: false })
  })
  group.add(sofa)

  // Coffee table.
  const table = new THREE.Group()
  table.position.set(6.65, 0, 3.48)
  boxRound(table, [1.75, 0.075, 0.92], [0, 0.45, 0], materials.blackGloss, 0.07)
  box(table, [1.66, 0.012, 0.018], [0, 0.495, 0.36], materials.gold, { castShadow: false })
  cylinder(table, 0.035, 0.05, 0.4, [0, 0.22, 0], materials.goldSoft, { castShadow: false })
  cylinder(table, 0.44, 0.44, 0.025, [0, 0.035, 0], materials.dark, { castShadow: false })
  box(table, [0.3, 0.05, 0.22], [0.32, 0.52, 0.04], materials.paper, { castShadow: false, rotation: [0, 0.2, 0] })
  box(table, [0.27, 0.045, 0.2], [0.32, 0.56, 0.04], materials.blackGloss, { castShadow: false, rotation: [0, 0.05, 0] })
  sphere(table, 0.1, [-0.42, 0.54, 0], materials.ivory, { castShadow: false, scale: [1, 0.42, 1] })
  group.add(table)

  // Floor lamp.
  const floorLamp = new THREE.Group()
  floorLamp.position.set(10.25, 0, 5.42)
  cylinder(floorLamp, 0.22, 0.26, 0.04, [0, 0.02, 0], materials.dark, { castShadow: false })
  cylinder(floorLamp, 0.018, 0.018, 1.9, [0, 0.97, 0], materials.goldSoft, { castShadow: false })
  const lampShade = mesh(floorLamp, new THREE.ConeGeometry(0.34, 0.38, 24, 1, true), materials.graphite, [0, 1.94, 0], { castShadow: false })
  lampShade.rotation.x = Math.PI
  sphere(floorLamp, 0.095, [0, 1.85, 0], materials.glow, { castShadow: false })
  group.add(floorLamp)

  // Lounge plant.
  const plant = new THREE.Group()
  plant.position.set(5.35, 0, 5.62)
  cylinder(plant, 0.36, 0.28, 0.62, [0, 0.31, 0], materials.terracotta)
  plantLeaves(plant, materials, 2.15, 17)
  group.add(plant)

  // Large corporate award, hung on the right wall.
  const award = new THREE.Group()
  award.position.set(11.36, 2.2, 4.7)
  award.rotation.y = -Math.PI / 2
  box(award, [0.98, 1.24, 0.04], [0, 0, 0], materials.dark, { castShadow: false })
  mesh(award, new THREE.PlaneGeometry(0.86, 1.12), new THREE.MeshBasicMaterial({ map: makeAwardTexture(), toneMapped: false }), [0, 0, 0.026], { castShadow: false })
  group.add(award)

  scene.add(group)
  return group
}

function plantLeaves(parent, materials, height = 1.5, count = 13) {
  const leafGeometry = new THREE.SphereGeometry(0.25, 12, 8)
  for (let i = 0; i < count; i += 1) {
    const angle = i * 2.399
    const radius = 0.08 + (i / count) * 0.44
    const y = 0.48 + (i / count) * (height - 0.6)
    const leaf = mesh(parent, leafGeometry, i % 3 === 0 ? materials.leafAlt : materials.leaf, [
      Math.cos(angle) * radius,
      y,
      Math.sin(angle) * radius,
    ], {
      scale: [0.55, 1.45, 0.24],
      castShadow: false,
    })
    leaf.rotation.z = Math.cos(angle) * 0.8
    leaf.rotation.x = Math.sin(angle) * 0.8
    leaf.rotation.y = angle
  }
}

function buildCoffeeBar(scene, materials) {
  const group = new THREE.Group()
  group.name = 'coffee-bar'
  group.position.set(-11.18, 0, 3.16)
  group.rotation.y = Math.PI / 2

  boxRound(group, [2.95, 0.86, 0.58], [0, 0.43, 0], materials.blackGloss, 0.045)
  box(group, [2.99, 0.02, 0.6], [0, 0.88, 0], materials.goldSoft, { castShadow: false })
  box(group, [2.78, 0.55, 0.02], [0, 0.4, 0.3], materials.graphite, { castShadow: false })
  ;[-1.25, 1.25].forEach((x) => box(group, [0.05, 0.77, 0.48], [x, 0.38, 0], materials.dark, { castShadow: false }))

  // Built-in espresso machine.
  const machine = new THREE.Group()
  machine.position.set(-0.58, 0.9, 0.02)
  box(machine, [0.72, 0.36, 0.42], [0, 0.2, 0], materials.graphite, { castShadow: false })
  box(machine, [0.62, 0.08, 0.38], [0, 0.39, 0], materials.blackGloss, { castShadow: false })
  ;[-0.19, 0.19].forEach((x) => {
    cylinder(machine, 0.028, 0.028, 0.2, [x, 0.12, 0.22], materials.gold, { castShadow: false })
    cylinder(machine, 0.055, 0.04, 0.05, [x, 0.03, 0.22], materials.dark, { castShadow: false })
  })
  box(machine, [0.45, 0.02, 0.02], [0, 0.28, 0.215], materials.goldSoft, { castShadow: false })
  group.add(machine)

  // Cups and menu.
  ;[-1.2, -1.05, -0.9].forEach((x, i) => {
    cylinder(group, 0.045, 0.038, 0.07, [x, 0.95 + i * 0.025, 0.08], materials.paper, { castShadow: false })
  })
  const menuTexture = makeCoffeeMenuTexture()
  const menu = mesh(group, new THREE.PlaneGeometry(0.75, 0.47), new THREE.MeshBasicMaterial({ map: menuTexture, toneMapped: false }), [0.75, 1.22, 0.31], { castShadow: false })
  menu.rotation.x = -0.08
  box(group, [0.82, 0.53, 0.03], [0.75, 1.22, 0.28], materials.dark, { castShadow: false })
  // Under-counter gold glow.
  box(group, [2.8, 0.012, 0.018], [0, 0.06, 0.31], materials.warmPanel, { castShadow: false })

  scene.add(group)
  return group
}

function buildDetails(scene, materials) {
  const group = new THREE.Group()
  group.name = 'office-details'

  // Charcoal runner leading from the workstation aisle to the boardroom door.
  box(group, [13.0, 0.018, 1.18], [-1.1, 0.043, -2.68], materials.runner, { castShadow: false })
  box(group, [13.0, 0.008, 0.022], [-1.1, 0.054, -2.105], materials.goldSoft, { castShadow: false })
  box(group, [13.0, 0.008, 0.022], [-1.1, 0.054, -3.255], materials.goldSoft, { castShadow: false })

  // Inlaid floor crest in the open collaboration area.
  const crest = mesh(group, new THREE.PlaneGeometry(4.7, 4.7), new THREE.MeshBasicMaterial({
    map: makeFloorBrandTexture(),
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    toneMapped: false,
  }), [1.8, 0.058, 4.3], {
    rotation: [-Math.PI / 2, 0, 0],
    castShadow: false,
    receiveShadow: false,
    renderOrder: 1,
  })
  crest.name = 'floor-crest'

  // Tall planters / greenery.
  const plantSpots = [
    [-10.35, 6.68, 1.9, 0.8],
    [3.45, 6.55, 1.7, 0.9],
    [10.2, -0.12, 1.45, 0.72],
    [-4.3, 6.75, 1.35, 0.66],
  ]
  plantSpots.forEach(([x, z, h, r]) => {
    const plant = new THREE.Group()
    plant.position.set(x, 0, z)
    cylinder(plant, r * 0.44, r * 0.34, h * 0.42, [0, h * 0.21, 0], materials.terracotta)
    plantLeaves(plant, materials, h, 15)
    group.add(plant)
  })

  // Low storage console on the back wall.
  const consoleGroup = new THREE.Group()
  consoleGroup.position.set(-9.2, 0, -7.16)
  boxRound(consoleGroup, [2.35, 0.68, 0.52], [0, 0.34, 0], materials.blackGloss, 0.04)
  box(consoleGroup, [2.38, 0.018, 0.56], [0, 0.69, 0], materials.goldSoft, { castShadow: false })
  for (let i = 0; i < 3; i += 1) {
    box(consoleGroup, [0.7, 0.5, 0.02], [-0.78 + i * 0.78, 0.34, 0.265], materials.graphite, { castShadow: false })
    sphere(consoleGroup, 0.018, [-0.78 + i * 0.78, 0.34, 0.28], materials.gold, { castShadow: false })
  }
  group.add(consoleGroup)

  // Books on the console.
  const bookColors = [materials.ivory, materials.paper, materials.fabricDark, materials.goldSoft]
  for (let i = 0; i < 9; i += 1) {
    box(group, [0.075, 0.25 - (i % 3) * 0.025, 0.2], [-10.02 + i * 0.095, 0.83, -7.15], bookColors[i % bookColors.length], {
      castShadow: false,
      rotation: [0, 0, i % 4 === 0 ? 0.12 : 0],
    })
  }
  // Small sculpture on console.
  const sculpture = mesh(group, new THREE.TorusKnotGeometry(0.15, 0.028, 64, 8), materials.gold, [-8.0, 0.92, -7.14], { castShadow: false })
  sculpture.rotation.x = Math.PI / 2

  // Waste baskets, tucked away.
  ;[[-6.4, -3.2], [1.15, -3.2], [-7.6, 3.2]].forEach(([x, z]) => {
    cylinder(group, 0.16, 0.13, 0.3, [x, 0.15, z], materials.graphite, { castShadow: false })
    cylinder(group, 0.17, 0.17, 0.015, [x, 0.3, z], materials.goldSoft, { castShadow: false })
  })

  // Cabling details under the front edge of the back-wall desks.
  ;[-6.1, -3.1, 0.75].forEach((x) => {
    box(group, [0.9, 0.02, 0.03], [x, 0.035, -3.25], materials.graphite, { castShadow: false })
  })

  // A discreet floor-level gold line around the central island.
  box(group, [4.72, 0.008, 0.02], [-2.45, 0.062, 1.76], materials.goldSoft, { castShadow: false })
  box(group, [0.02, 0.008, 2.86], [0.02, 0.062, 0.32], materials.goldSoft, { castShadow: false })

  scene.add(group)
  return group
}

function addLights(scene) {
  const hemisphere = new THREE.HemisphereLight(0xfff7eb, 0x121214, 0.78)
  scene.add(hemisphere)

  const key = new THREE.DirectionalLight(0xfff1dc, 2.05)
  key.position.set(-7, 15, 11)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.left = -14
  key.shadow.camera.right = 14
  key.shadow.camera.top = 13
  key.shadow.camera.bottom = -13
  key.shadow.camera.near = 1
  key.shadow.camera.far = 38
  key.shadow.bias = -0.00035
  key.shadow.normalBias = 0.025
  key.shadow.radius = 4
  scene.add(key)

  const rim = new THREE.DirectionalLight(0xb9cada, 0.7)
  rim.position.set(12, 10, -10)
  scene.add(rim)

  const meetingLight = new THREE.PointLight(0xffd9a2, 15, 9, 2)
  meetingLight.position.set(7.8, 3.1, -4.2)
  scene.add(meetingLight)

  const executiveLight = new THREE.PointLight(0xffc981, 14, 6.5, 2)
  executiveLight.position.set(-2.45, 2.7, -0.85)
  scene.add(executiveLight)

  const loungeLight = new THREE.PointLight(0xffd6a0, 9, 6, 2)
  loungeLight.position.set(8.2, 2.2, 3.7)
  scene.add(loungeLight)

  return { hemisphere, key, rim, meetingLight, executiveLight, loungeLight }
}

function addMotes(scene) {
  const count = 110
  const positions = new Float32Array(count * 3)
  const random = (() => {
    let seed = 99
    return () => {
      seed = (seed * 16807) % 2147483647
      return (seed - 1) / 2147483646
    }
  })()
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (random() * 2 - 1) * 10.4
    positions[i * 3 + 1] = 0.45 + random() * 3.5
    positions[i * 3 + 2] = (random() * 2 - 1) * 7.2
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color: 0xf1d7a3,
    size: 0.018,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  const points = new THREE.Points(geometry, material)
  points.name = 'air-motes'
  scene.add(points)
  return points
}

function mergeStaticMeshes(root) {
  root.updateMatrixWorld(true)
  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const buckets = new Map()
  const remove = []
  const meshList = []

  root.traverse((object) => {
    if (!object.isMesh || object.isInstancedMesh) return
    if (object.userData.keep) return
    if (Array.isArray(object.material)) return
    meshList.push(object)
  })

  meshList.forEach((object) => {
    if (!object.parent) return
    const material = object.material
    if (!material) return
    const key = material.uuid
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { material, geometries: [], castShadow: false, receiveShadow: false, renderOrder: object.renderOrder }
      buckets.set(key, bucket)
    }
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone()
    const matrix = new THREE.Matrix4().multiplyMatrices(rootInverse, object.matrixWorld)
    geometry.applyMatrix4(matrix)
    if (!geometry.attributes.uv && bucket.material.map) {
      // Keep textural materials out of the merge if they do not have UVs.
      geometry.dispose()
      return
    }
    bucket.geometries.push(geometry)
    bucket.castShadow ||= object.castShadow
    bucket.receiveShadow ||= object.receiveShadow
    remove.push(object)
  })

  remove.forEach((object) => {
    object.parent?.remove(object)
  })

  buckets.forEach((bucket) => {
    if (!bucket.geometries.length) return
    const merged = mergeGeometries(bucket.geometries, false)
    if (!merged) return
    const mergedMesh = new THREE.Mesh(merged, bucket.material)
    mergedMesh.castShadow = bucket.castShadow
    mergedMesh.receiveShadow = bucket.receiveShadow
    mergedMesh.renderOrder = bucket.renderOrder || 0
    mergedMesh.name = `merged-${bucket.material.uuid.slice(0, 5)}`
    root.add(mergedMesh)
    bucket.geometries.forEach((geometry) => geometry.dispose())
  })
}

function makePickBox(scene, config) {
  const geometry = new THREE.BoxGeometry(config.size[0], config.size[1], config.size[2])
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(config.position[0], config.position[1], config.position[2])
  if (config.rotation) mesh.rotation.y = config.rotation
  mesh.userData.interactive = {
    type: config.type,
    id: config.id,
    label: config.label,
    sublabel: config.sublabel,
    action: config.action,
  }
  mesh.name = `pick-${config.type}-${config.id}`
  scene.add(mesh)
  return mesh
}

export function createWorld(scene, renderer) {
  const materials = createMaterials(renderer)
  const staticRoot = new THREE.Group()
  staticRoot.name = 'static-office'
  scene.add(staticRoot)

  const platform = buildPlatform(staticRoot, materials)
  const shell = buildShell(staticRoot, materials)
  const workstations = []
  const robotParts = {}

  for (const agent of AGENT_SEEDS) {
    const station = buildWorkstation(agent, materials)
    staticRoot.add(station)
    workstations.push(station)

    const robot = createRobot(agent, materials)
    scene.add(robot.root)
    robotParts[agent.id] = robot
  }

  const boardroom = buildBoardroom(staticRoot, materials)
  const exec = buildExecutiveDesk(staticRoot, materials)
  const lounge = buildLounge(staticRoot, materials)
  const coffee = buildCoffeeBar(staticRoot, materials)
  const details = buildDetails(staticRoot, materials)

  // Exclude dynamic elements from the static merge.
  exec.hologram.traverse((object) => { object.userData.keep = true })
  coffee.traverse((object) => {
    if (object.name === 'coffee-machine-light') object.userData.keep = true
  })
  // Keep the boardroom logo/glass readable and screen material unique.
  boardroom.traverse((object) => {
    if (object.name === 'boardroom-presentation' || object.name === 'boardroom-leaf') object.userData.keep = true
  })

  mergeStaticMeshes(staticRoot)

  const lights = addLights(scene)
  const motes = addMotes(scene)

  // Transparent pick volumes. They are intentionally excluded from the merge.
  const pickables = []
  for (const agent of AGENT_SEEDS) {
    const robot = robotParts[agent.id]
    const hit = makePickBox(scene, {
      type: 'agent',
      id: agent.id,
      label: agent.name.toUpperCase(),
      sublabel: agent.role.toUpperCase(),
      action: 'select',
      size: [0.95, 1.75, 0.9],
      position: [agent.home.x, 0.92, agent.home.z],
    })
    hit.userData.follow = robot.root
    hit.userData.followOffset = [0, 0.92, 0]
    pickables.push(hit)
    robot.hitbox = hit

    const deskOffset = new THREE.Vector3(0, 0, 0.7).applyAxisAngle(new THREE.Vector3(0, 1, 0), agent.home.rotation)
    const deskHit = makePickBox(scene, {
      type: 'agent',
      id: agent.id,
      label: agent.name.toUpperCase(),
      sublabel: agent.role.toUpperCase(),
      action: 'select',
      size: [2.2, 1.2, 1.2],
      position: [agent.home.x + deskOffset.x, 0.55, agent.home.z + deskOffset.z],
      rotation: agent.home.rotation,
    })
    pickables.push(deskHit)
  }

  const execHit = makePickBox(scene, {
    type: 'exec',
    id: 'executive',
    label: 'EXECUTIVE CONSOLE',
    sublabel: 'OPEN OPERATIONS',
    action: 'console',
    size: [3.8, 2.4, 2.4],
    position: [-2.45, 0.8, -0.15],
  })
  pickables.push(execHit)

  const boardroomHit = makePickBox(scene, {
    type: 'boardroom',
    id: 'boardroom',
    label: 'BOARDROOM',
    sublabel: 'CONVENE STAND-UP',
    action: 'standup',
    size: [3.8, 1.6, 1.8],
    position: [7.9, 0.9, -4.16],
  })
  pickables.push(boardroomHit)

  const coffeeHit = makePickBox(scene, {
    type: 'coffee',
    id: 'coffee',
    label: 'THE BRIEF / COFFEE BAR',
    sublabel: 'POUR A CUP',
    action: 'coffee',
    size: [3.1, 1.8, 1.2],
    position: [-10.83, 0.85, 3.16],
  })
  pickables.push(coffeeHit)

  return {
    materials,
    workstations,
    boardroom,
    exec,
    lounge,
    coffee,
    details,
    platform,
    shell,
    lights,
    motes,
    robots: robotParts,
    pickables,
    interactive: {
      agents: pickables.filter((item) => item.userData.interactive.type === 'agent'),
      exec: execHit,
      boardroom: boardroomHit,
      coffee: coffeeHit,
    },
    staticRoot,
  }
}
