import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MToonMaterialLoaderPlugin } from '@pixiv/three-vrm-materials-mtoon'
import { assetPath } from './assets.ts'
import { partners, type PartnerId } from './partner-roster.ts'
import { disposeFigure } from './standing-rig.ts'
import { createTutorialPerformance, type TutorialCast } from './tutorial-performance.ts'

export type TutorialShot = TutorialCast & {paired:boolean}
export type PaintedActors = {left:boolean;right:boolean}
const singleSide = ['left'] as const
const bothSides = ['left','right'] as const

function panel() {
  const scene = new THREE.Scene()
  const key = new THREE.DirectionalLight(0xfff1e5,1.23)
  key.position.set(-2,3,3)
  const edge = new THREE.DirectionalLight(0xffd9ac,.61)
  edge.position.set(2,2,-1)
  scene.add(new THREE.HemisphereLight(0xfff4e8,0xa09aa9,1.03),key,edge)
  const camera = new THREE.OrthographicCamera(-1,1,1.88,.72,.1,10)
  camera.position.z = 4
  return {camera,scene}
}

export function createTutorialRenderer(canvas:HTMLCanvasElement,onPaint:(actors:PaintedActors)=>void) {
  const renderer = new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'})
  renderer.autoClear = false
  renderer.setClearColor(0,0)
  const loader = new GLTFLoader().register(parser=>new MToonMaterialLoaderPlugin(parser))
  const loaded = new Map<PartnerId,ReturnType<typeof createTutorialPerformance>>()
  const loading = new Set<PartnerId>()
  const failed = new Set<PartnerId>()
  const panels = {left:panel(),right:panel()}
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  let state:TutorialShot|undefined, disposed=false, lost=false, visible=true
  let paintedLeft=false, paintedRight=false
  let frame=0, last=0, clock=0, cueStart=0, width=0, height=0

  function painted(left:boolean,right:boolean) {
    if (paintedLeft===left && paintedRight===right) return
    paintedLeft=left
    paintedRight=right
    onPaint({left,right})
  }
  function schedule() {
    if (!frame && !disposed && !lost && visible && !document.hidden) frame=requestAnimationFrame(render)
  }
  function render(now:number) {
    frame=0
    if (disposed || lost || !visible || document.hidden || !state || !width || !height) return
    if (last && now-last<32 && !reduced.matches) {schedule();return}
    clock+=last ? Math.min((now-last)/1000,.12) : 0
    last=now
    try {
      renderer.setScissorTest(false)
      renderer.clear()
      renderer.setScissorTest(true)
      const halfway=Math.round(width/2)
      for (const side of (state.paired?bothSides:singleSide)) {
        const actor=loaded.get(state[side])
        if (!actor) continue
        const {scene,camera}=panels[side]
        if (actor.group.parent!==scene) scene.add(actor.group)
        actor.pose(clock,clock-cueStart,state,side,reduced.matches)
        const x=side==='left'?0:halfway, w=side==='left'?halfway:width-halfway
        renderer.setViewport(x,0,w,height)
        renderer.setScissor(x,0,w,height)
        renderer.render(scene,camera)
      }
      painted(loaded.has(state.left),state.paired && loaded.has(state.right))
    } catch {
      painted(false,false)
      return
    }
    if (!reduced.matches && (paintedLeft || paintedRight)) schedule()
  }
  function resize() {
    if (disposed || lost) return
    width=canvas.clientWidth
    height=canvas.clientHeight
    if (!width || !height) return
    const dpr=Math.min(window.devicePixelRatio||1,1.6,Math.sqrt(1_100_000/(width*height)))
    renderer.setDrawingBufferSize(width,height,dpr)
    const aspect=width/(2*height)
    // Show the waist and hands, widening the view only when a narrow phone
    // panel would otherwise cut off Hana's sleeve or an outstretched hand.
    const vertical=Math.max(1.16,1.04/aspect)
    for (const {camera} of Object.values(panels)) {
      camera.top=1.875
      camera.bottom=camera.top-vertical
      camera.right=vertical*aspect/2
      camera.left=-camera.right
      camera.updateProjectionMatrix()
    }
    schedule()
  }
  async function load(id:PartnerId) {
    if (loaded.has(id) || loading.has(id) || failed.has(id)) return
    loading.add(id)
    try {
      const gltf=await loader.loadAsync(assetPath(partners.find(entry=>entry.id===id)!.model))
      if (disposed) {disposeFigure(gltf.scene);return}
      try {loaded.set(id,createTutorialPerformance(gltf.scene,id))}
      catch (error) {disposeFigure(gltf.scene);throw error}
      schedule()
    } catch {
      failed.add(id)
    } finally {loading.delete(id)}
  }
  function change(next:TutorialShot) {
    const newCast = !state || next.left!==state.left || next.right!==state.right
    if (newCast || next.paired!==state?.paired) {
      // The guide stays live while the invited partner's model is streaming.
      painted(state?.left===next.left && paintedLeft, Boolean(state?.paired && next.paired && state.right===next.right && paintedRight))
      for (const side of bothSides) {
        const previous=state && loaded.get(state[side])
        if (previous?.group.parent===panels[side].scene) previous.group.removeFromParent()
      }
    }
    state=next
    // Leave the guide's extended fingertips clear of the angled table edge.
    // Pan the solo camera without moving or rescaling the character.
    panels.left.camera.position.x=next.paired?0:.14
    cueStart=clock
    void load(next.left)
    if (next.paired) void load(next.right)
    schedule()
  }
  function resume() {
    cancelAnimationFrame(frame)
    frame=0;last=0
    schedule()
  }
  function contextLost(event:Event) {
    event.preventDefault()
    lost=true;painted(false,false);resume()
  }
  function contextRestored() {lost=false;resize();resume()}
  const sizes=new ResizeObserver(resize)
  sizes.observe(canvas)
  const visibility=new IntersectionObserver(entries=>{
    visible=entries[entries.length-1].isIntersecting
    resume()
  })
  visibility.observe(canvas)
  reduced.addEventListener('change',resume)
  document.addEventListener('visibilitychange',resume)
  canvas.addEventListener('webglcontextlost',contextLost)
  canvas.addEventListener('webglcontextrestored',contextRestored)
  resize()
  return {change,dispose() {
    disposed=true
    cancelAnimationFrame(frame)
    sizes.disconnect();visibility.disconnect()
    reduced.removeEventListener('change',resume)
    document.removeEventListener('visibilitychange',resume)
    canvas.removeEventListener('webglcontextlost',contextLost)
    canvas.removeEventListener('webglcontextrestored',contextRestored)
    for (const actor of loaded.values()) disposeFigure(actor.group)
    for (const {scene} of Object.values(panels)) scene.clear()
    loaded.clear()
    renderer.dispose();renderer.forceContextLoss()
  }}
}
