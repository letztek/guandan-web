import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MToonMaterialLoaderPlugin } from '@pixiv/three-vrm-materials-mtoon'
import { assetPath } from './assets.ts'
import { partners, standingFrame } from './partner-roster.ts'
import { createPartnerPerformance } from './partner-performance.ts'

export type PartnerPreview = {
  select(index: number): void
  dispose(): void
}

type Stage = {
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  rect: THREE.Vector4
  actor?: ReturnType<typeof createPartnerPerformance>
  painted: boolean
}

function stage(): Stage {
  const scene = new THREE.Scene()
  const key = new THREE.DirectionalLight(0xffe6cf, 1.18)
  key.position.set(-2, 3, 3)
  const rim = new THREE.DirectionalLight(0xffd5a0, .64)
  rim.position.set(2, 2, -1)
  scene.add(new THREE.HemisphereLight(0xfff4e8, 0x836977, .96), key, rim)
  const camera = new THREE.OrthographicCamera(-1, 1, 2, -.15, .1, 10)
  camera.position.z = 4
  return {scene, camera, rect: new THREE.Vector4(), painted: false}
}

// Frame the full greeting at rest so the shoes stay fixed in a narrow card.
export function framePartner(camera: THREE.OrthographicCamera, index: number, aspect: number) {
  if (aspect <= 0) return
  const resting = standingFrame.height * aspect
  const actionWidth = partners[index].minimumFrameWidth
  const width = Math.max(resting, actionWidth)
  const margin = THREE.MathUtils.clamp((actionWidth + .38 - resting) / .38, 0, 1)
  // Hana's boots straddle x=0. Reserve space on both sides for the sleeve.
  const offset = index === 2 ? .045 * margin : 0
  camera.left = offset - width / 2
  camera.right = offset + width / 2
  const height = width / aspect
  camera.bottom = -height * standingFrame.belowFloor / standingFrame.height
  camera.top = height + camera.bottom
  camera.updateProjectionMatrix()
}

export function createPartnerPreview(
  canvas: HTMLCanvasElement,
  slots: readonly HTMLElement[],
  onReady: (index: number, ready: boolean) => void,
): PartnerPreview {
  const context = canvas.getContext('webgl2', {alpha: true, antialias: true})
  if (!context) throw new Error('WebGL 2 unavailable')
  const renderer = new THREE.WebGLRenderer({canvas, context, alpha: true, antialias: true})
  renderer.setClearColor(0, 0)
  renderer.autoClear = false
  const stages = slots.map(stage)
  const loader = new GLTFLoader().register(parser => new MToonMaterialLoaderPlugin(parser))
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  let disposed = false, lost = false, inView = true, frame = 0, lastFrame = 0, elapsed = 0
  let active: number | null = null, greetingStart: number | null | 'still' = null

  function setPainted(slot: Stage, index: number, value: boolean) {
    if (value === slot.painted) return
    slot.painted = value
    onReady(index, value)
  }

  function schedule() {
    if (!frame && !disposed && !lost && inView && !document.hidden) frame = requestAnimationFrame(render)
  }

  function render(now: number) {
    frame = 0
    if (disposed || lost || !inView || document.hidden) return
    if (!reduced.matches && lastFrame && now - lastFrame < 32) {
      schedule()
      return
    }
    // Don't skip an entire greeting during the first shader compile or after a stalled frame.
    const step = lastFrame ? Math.min((now - lastFrame) / 1000, .1) : 0
    elapsed += step
    lastFrame = now
    renderer.setScissorTest(false)
    renderer.clear()
    renderer.setScissorTest(true)
    for (const [i, slot] of stages.entries()) {
      if (!slot.actor || !slot.rect.z || !slot.rect.w) continue
      try {
        if (i === active && greetingStart === null) greetingStart = elapsed
        const age = i === active && typeof greetingStart === 'number' ? elapsed - greetingStart : null
        const faceAge = reduced.matches && i === active ? 0 : age
        slot.actor.pose(reduced.matches ? 0 : elapsed, faceAge, reduced.matches)
        renderer.setViewport(slot.rect)
        renderer.setScissor(slot.rect)
        renderer.render(slot.scene, slot.camera)
        setPainted(slot, i, true)
      } catch {
        // Keep the other seats live when only one rig cannot render on this device.
        slot.scene.remove(slot.actor.group)
        slot.actor.dispose()
        slot.actor = undefined
        setPainted(slot, i, false)
      }
    }
    if (!reduced.matches && stages.some(slot => slot.actor)) schedule()
  }

  function resize() {
    const area = canvas.getBoundingClientRect()
    if (!area.width || !area.height || disposed || lost) return
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(1_600_000 / (area.width * area.height)))
    renderer.setDrawingBufferSize(Math.round(area.width), Math.round(area.height), ratio)
    for (const [i, slot] of stages.entries()) {
      const box = slots[i].getBoundingClientRect()
      const width = Math.round(box.width), height = Math.round(box.height)
      slot.rect.set(Math.round(box.left - area.left), Math.round(area.bottom - box.bottom), width, height)
      if (!height) continue
      framePartner(slot.camera, i, width / height)
    }
    schedule()
  }

  function resume() {
    cancelAnimationFrame(frame)
    frame = 0
    lastFrame = 0
    if (reduced.matches && active !== null) greetingStart = 'still'
    schedule()
  }
  function contextLost(event: Event) {
    event.preventDefault()
    lost = true
    stages.forEach((s,i) => setPainted(s, i, false))
    resume()
  }
  function contextRestored() {lost = false; resize(); resume()}

  const sizes = new ResizeObserver(resize)
  sizes.observe(canvas)
  slots.forEach(slot => sizes.observe(slot))
  const visibility = new IntersectionObserver(entries => {
    const showing = entries[entries.length - 1].isIntersecting
    if (inView !== showing) {inView = showing; resume()}
  })
  visibility.observe(canvas)
  document.addEventListener('visibilitychange', resume)
  reduced.addEventListener('change', resume)
  canvas.addEventListener('webglcontextlost', contextLost)
  canvas.addEventListener('webglcontextrestored', contextRestored)
  resize()
  for (const [index, slot] of stages.entries()) {
    void loader.loadAsync(assetPath(partners[index].model)).then(gltf => {
      const actor = createPartnerPerformance(gltf, index, partners[index].selectionGreeting)
      if (disposed) {actor.dispose(); return}
      slot.actor = actor
      slot.scene.add(actor.group)
      schedule()
    }).catch(() => { /* The full-length portrait stays interactive while this seat is offline. */ })
  }

  return {
    select(index) {
      active = index
      // A selection made with reduced motion gets a still face immediately.
      // Restoring motion later should wait for the next deliberate selection.
      greetingStart = reduced.matches ? 'still' : null
      schedule()
    },
    dispose() {
      disposed = true
      cancelAnimationFrame(frame)
      visibility.disconnect()
      sizes.disconnect()
      document.removeEventListener('visibilitychange', resume)
      reduced.removeEventListener('change', resume)
      canvas.removeEventListener('webglcontextlost', contextLost)
      canvas.removeEventListener('webglcontextrestored', contextRestored)
      for (const slot of stages) {slot.actor?.dispose(); slot.scene.clear()}
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
