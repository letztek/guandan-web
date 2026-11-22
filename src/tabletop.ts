import * as THREE from 'three'
import { assetPath } from './assets'
import { cardFaceIndex } from './fez-deck'
import { createSeatActor, SEAT_RELEASE_MS, type SeatActor } from './character'
import { uid, type Card } from './rules'
import { tableSeatsFor } from './table-seats'
import { defaultPartnerId, type PartnerId } from './partner-roster'
import { createSeatCueQueue } from './seat-reactions'
import type { TableReaction } from './table-reactions'

const surfaceY = .76
const tableZ = .11
const cardWidth = .097
const cardHeight = .140
const point = (x:number, y:number, z:number) => new THREE.Vector3(x,y,z)
const clamp = THREE.MathUtils.clamp
const topRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,0))
const frontFromBack = new THREE.Quaternion().setFromAxisAngle(point(0,1,0),Math.PI)
const flatHalfTurn = new THREE.Quaternion().setFromAxisAngle(point(0,0,1),Math.PI)
const flightMs = 285

export function mountTable(canvas:HTMLCanvasElement, onSeat:(id:number, mode:'3d'|'portrait')=>void,
  onPosition:(seat:number,x:number,y:number)=>void, onError:()=>void, partnerId:PartnerId=defaultPartnerId) {
  const seats = tableSeatsFor(partnerId)
  const renderer = new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'})
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7))
  renderer.setClearColor(0,0)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(29,1,.06,16)
  const table = new THREE.Group()
  scene.add(table)
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  function geometry<G extends THREE.BufferGeometry>(g:G):G {geometries.add(g);return g}
  function material<M extends THREE.Material>(m:M):M {materials.add(m);return m}
  function surface(tint:string, roughness=.72, metallic=0) {
    return material(new THREE.MeshStandardMaterial({color:tint,roughness,metalness:metallic}))
  }
  function solid(g:THREE.BufferGeometry,m:THREE.Material|THREE.Material[],parent:THREE.Object3D=table){
    const mesh=new THREE.Mesh(g,m);mesh.receiveShadow=true;parent.add(mesh);return mesh
  }
  const lamp=new THREE.DirectionalLight('#ffecd3',1.9)
  lamp.position.set(-2.1,4.3,2.3);lamp.castShadow=true;lamp.shadow.mapSize.set(1024,1024)
  Object.assign(lamp.shadow.camera,{left:-2.15,right:2.15,top:2.15,bottom:-2.15,near:.1,far:10})
  lamp.shadow.normalBias=.008;lamp.shadow.bias=-.0002;scene.add(lamp)
  scene.add(new THREE.HemisphereLight('#fff4e9','#8a9b96',1.5))
  const rimLight=new THREE.DirectionalLight('#fbc38c',1.0);rimLight.position.set(1.3,2.7,-2);scene.add(rimLight)

  // Scanned surfaces from the room art wrap around the real table, including its front rail.
  const loader=new THREE.TextureLoader()
  function mapped(url:string, tint:string, repeat:number, rough:number) {
    const texture=loader.load(assetPath('art/'+url));texture.colorSpace=THREE.SRGBColorSpace
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(repeat,repeat)
    texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.add(texture)
    return material(new THREE.MeshStandardMaterial({map:texture,color:tint,roughness:rough}))
  }
  const felt=mapped('felt.jpg','#cfdbcf',3.25,.98)
  const walnut=mapped('walnut.jpg','#d4b397',2.5,.53)
  const brass=surface('#bf9965',.43,.47), darkWood=surface('#462f24',.75)
  const leather=surface('#2d4138',.68)
  function disk(rx:number,rz:number,h:number,y:number,m:THREE.Material){
    const mesh=solid(geometry(new THREE.CylinderGeometry(1,1,h,100)),m)
    mesh.scale.set(rx,1,rz);mesh.position.set(0,y,tableZ);mesh.castShadow=true;return mesh
  }
  const rx=1.17, rz=.83
  disk(rx+.028,rz+.027,.115,surfaceY-.080,darkWood)
  disk(rx+.032,rz+.031,.012,surfaceY-.062,brass)
  disk(rx+.026,rz+.024,.055,surfaceY-.028,walnut)
  disk(rx-.035,rz-.035,.007,surfaceY+.001,brass)
  disk(rx-.045,rz-.044,.009,surfaceY+.003,felt)

  // A printer's compass, fine woven accent and diamonds follow the felt plane.
  const design=document.createElement('canvas');design.width=1024;design.height=768
  const ink=design.getContext('2d')!
  ink.translate(512,384);ink.strokeStyle='rgba(211,184,121,.46)';ink.fillStyle='rgba(206,179,114,.54)'
  for(const inset of [0,4]){
    ink.lineWidth=inset?1:2.2;ink.beginPath();ink.ellipse(0,0,481-inset,350-inset,0,0,2*Math.PI);ink.stroke()
  }
  for(let i=0;i<16;i++){
    const t=i*Math.PI/8
    ink.save();ink.translate(464*Math.sin(t),334*Math.cos(t));ink.rotate(-t)
    ink.beginPath();ink.moveTo(0,-6);ink.lineTo(2,0);ink.lineTo(0,6);ink.lineTo(-2,0);ink.closePath();ink.fill();ink.restore()
  }
  ink.strokeStyle='rgba(200,180,124,.35)';ink.fillStyle='rgba(209,185,126,.32)';ink.lineWidth=1.6
  for(const rad of [51,55]){ink.beginPath();ink.arc(0,0,rad,0,Math.PI*2);ink.stroke()}
  for(let i=0;i<8;i++){
    const r=i%2?28:49;ink.save();ink.rotate(i*Math.PI/4);ink.beginPath();ink.moveTo(0,-r);ink.lineTo(5,-7);ink.lineTo(0,0);ink.lineTo(-5,-7);ink.closePath();ink.stroke()
    ink.beginPath();ink.moveTo(0,-r);ink.lineTo(5,-7);ink.lineTo(0,0);ink.closePath();ink.fill();ink.restore()
  }
  const inkTexture=new THREE.CanvasTexture(design);inkTexture.colorSpace=THREE.SRGBColorSpace;inkTexture.anisotropy=4;textures.add(inkTexture)
  const print=solid(geometry(new THREE.PlaneGeometry((rx-.044)*2,(rz-.042)*2)),material(new THREE.MeshBasicMaterial({map:inkTexture,transparent:true,depthWrite:false})))
  print.rotation.x=-Math.PI/2;print.position.set(0,surfaceY+.009,tableZ)

  // Real chairs occlude and turn with the actors. Keep their backs below the shoulders.
  const post=geometry(new THREE.CylinderGeometry(.014,.019,.62,10))
  const finial=geometry(new THREE.SphereGeometry(.025,12,8))
  const backShape=new THREE.Shape()
  backShape.moveTo(-.19,0);backShape.lineTo(.19,0);backShape.lineTo(.19,.32)
  backShape.quadraticCurveTo(.16,.45,0,.45);backShape.quadraticCurveTo(-.16,.45,-.19,.32);backShape.closePath()
  const chairBack=geometry(new THREE.ExtrudeGeometry(backShape,{depth:.03,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.008,bevelThickness:.01,curveSegments:16}))
  const seatsById=new Map<number,THREE.Group>()
  const positions=new Map<number,THREE.Vector3>()
  for(const seat of seats){
    const frame=new THREE.Group();frame.position.set(seat.x,0,seat.z);frame.rotation.y=seat.yaw
    table.add(frame);seatsById.set(seat.number,frame)
    const chair=solid(chairBack,walnut,frame);chair.position.set(0,.48,-.18);chair.castShadow=true
    const pad=solid(chairBack,leather,frame);pad.scale.set(.84,.85,.7);pad.position.set(0,.49,-.143)
    for(const sign of [-1,1]){
      const stick=solid(post,darkWood,frame);stick.position.set(sign*.187,.55,-.165);stick.castShadow=true
      const pin=solid(finial,brass,frame);pin.position.set(sign*.187,.874,-.165)
    }
    positions.set(seat.number,frame.localToWorld(point(0,surfaceY+.006,.32)))
  }
  let dead=false, broken=false, frameId=0, lastFrame=-100
  const actors=new Map<number,SeatActor>()
  const counts=[27,27,27,27]
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)')
  const releaseLandedAt=new Map<number,number>()
  type HeadCue=Parameters<SeatActor['react']>[0]
  const cueQueues=new Map<number,ReturnType<typeof createSeatCueQueue>>()
  for(const seat of seats)cueQueues.set(seat.number,createSeatCueQueue(seat.model))
  const stillPoses=new Map<number,HeadCue>()
  let activeMotionUntil=0
  function beginCue(actor:SeatActor,cue:HeadCue,at:number,animate:boolean){
    actor.react(cue,at,animate)
    if(animate)activeMotionUntil=Math.max(activeMotionUntil,at+(cue.kind==='pass'?2400:2200))
  }
  function showReactions(reactions:TableReaction[],animate=true){
    const now=performance.now()
    for(const reaction of reactions){
      const frame=seatsById.get(reaction.seat)
      if(!frame)continue
      const target=point(0,0,tableZ)
      if(typeof reaction.lookAt==='number'){
        const other=seatsById.get(reaction.lookAt)
        if(other)other.getWorldPosition(target)
        else target.set(0,0,1.05)
      }
      frame.worldToLocal(target)
      const lookYaw=reaction.lookAt==='hand'?0:Math.atan2(target.x,target.z)
      const cue={kind:reaction.kind,lookYaw}
      const outcome=['win','lose','matchWin','matchLose'].includes(cue.kind)
      if(cue.kind!=='idle'&&cue.kind!=='pass')stillPoses.set(reaction.seat,cue)
      else stillPoses.delete(reaction.seat)
      const actor=actors.get(reaction.seat),queue=cueQueues.get(reaction.seat)
      if(!actor||!queue)continue
      if(!animate){
        queue.clear()
        beginCue(actor,cue,now,false)
        continue
      }
      const handoff=outcome||cue.kind==='finish'?(releaseLandedAt.get(reaction.seat)??now):now
      queue.schedule(cue,now,handoff)
      queue.flush(now,(next,at)=>beginCue(actor,next,at,!reduced.matches))
    }
  }
  function resetReactions(){
    for(const queue of cueQueues.values())queue.clear()
    stillPoses.clear();releaseLandedAt.clear()
    activeMotionUntil=0
    for(const actor of actors.values())actor.reset()
  }
  for(const seat of seats)void createSeatActor(seat.model).then(actor=>{
    if(dead||broken){actor.dispose();return}
    seatsById.get(seat.number)!.add(actor.group);actors.set(seat.number,actor)
    actor.group.traverse(n=>{if(n instanceof THREE.Mesh){n.castShadow=true;n.receiveShadow=true}})
    actor.hold(counts[seat.number])
    const pose=stillPoses.get(seat.number)
    if(pose)actor.react(pose,performance.now(),false)
    onSeat(seat.number,'3d')
  }).catch(()=>{if(!dead)onSeat(seat.number,'portrait')})

  const atlas=loader.load(assetPath('fez-cards/deck.webp'),()=>{for(const mat of faceMaterials.values())if(mat.map)mat.map.needsUpdate=true})
  atlas.colorSpace=THREE.SRGBColorSpace;atlas.anisotropy=8;textures.add(atlas)
  const stock=surface('#d4c5a4',.85)
  const cardBack=surface('#30483c',.8)
  const faceMaterials=new Map<number,THREE.MeshStandardMaterial>()
  const cardBody=geometry(new THREE.BoxGeometry(cardWidth,cardHeight,.0018))
  cardBody.clearGroups();cardBody.addGroup(0,24,0);cardBody.addGroup(24,6,1);cardBody.addGroup(30,6,2)
  function faceFor(card:Card){
    const id=cardFaceIndex(card)
    if(!faceMaterials.has(id)){
      const tex=atlas.clone();tex.colorSpace=THREE.SRGBColorSpace
      tex.repeat.set(1/9,1/6);tex.offset.set(id%9/9,1-(1+Math.floor(id/9))/6)
      tex.needsUpdate=true;textures.add(tex)
      faceMaterials.set(id,material(new THREE.MeshStandardMaterial({map:tex,roughness:.88})))
    }
    return faceMaterials.get(id)!
  }
  const pile=new THREE.Group();table.add(pile)
  const firstPerson=new THREE.Group()
  firstPerson.position.set(.12,.845,1.03);firstPerson.rotation.set(-.12,-.09,-.025)
  table.add(firstPerson)
  const heldCards=new Map<string,THREE.Mesh>()
  function setHand(cards:Card[],selected:string[]){
    const inHand=new Set(cards.map(uid))
    for(const [id,mesh] of heldCards)if(!inHand.has(id)){firstPerson.remove(mesh);heldCards.delete(id)}
    const step=Math.min(.039,.41/Math.max(cards.length-1,1))
    const tilt=Math.min(.118,.93/Math.max(cards.length-1,1))
    cards.forEach((card,index)=>{
      const id=uid(card), offset=index-(cards.length-1)/2
      let mesh=heldCards.get(id)
      if(!mesh){mesh=solid(cardBody,[stock,faceFor(card),cardBack],firstPerson);heldCards.set(id,mesh)}
      mesh.rotation.z=-tilt*offset
      mesh.position.set(offset*step,(selected.includes(id)?.053:0)-.014*Math.pow(offset*tilt,2),index*.0012)
      mesh.scale.setScalar(1.15)
    })
  }
  type Flight={card:THREE.Mesh;start:THREE.Vector3;end:THREE.Vector3;rotation:THREE.Quaternion;landed:THREE.Quaternion;startScale:THREE.Vector3;startAt:number;superseded:boolean}
  const flights:Flight[]=[]
  function showPlay(cards:Card[],seat:number,animate:boolean){
    // A fast human reply can arrive while the previous seat is still letting go.
    // Let the old cards finish the handoff, then leave only the latest play on the felt.
    if(!animate){pile.clear();flights.length=0}
    else{
      const airborne=new Set<THREE.Object3D>()
      for(const flight of flights){flight.superseded=true;airborne.add(flight.card)}
      for(const card of [...pile.children])if(!airborne.has(card))pile.remove(card)
    }
    const now=performance.now()
    const actor=actors.get(seat)
    const animated=animate&&!reduced.matches
    const delay=animated&&actor?SEAT_RELEASE_MS:0
    if(animate&&cards.length){
      stillPoses.delete(seat)
      if(actor&&cueQueues.get(seat)?.interruptPass(now))beginCue(actor,{kind:'idle',lookYaw:0},now,animated)
    }
    if(animated&&cards.length){
      actor?.play(cards,now)
      releaseLandedAt.set(seat,now+delay+flightMs)
    }
    const frame=seatsById.get(seat)
    const fallbackOrigin=frame?frame.localToWorld(point(0,.86,.43)):firstPerson.localToWorld(point(0,.055,0))
    const tilt=new THREE.Quaternion().setFromEuler(new THREE.Euler(-.56,frame?.rotation.y??0,.04))
    cards.forEach((c,i)=>{
      const card=solid(cardBody,[stock,faceFor(c),cardBack],pile);card.castShadow=true
      const spread=i-(cards.length-1)/2
      const end=point(spread*Math.min(.079,.80/Math.max(1,cards.length)),surfaceY+.014+i*.002,tableZ+.16+Math.abs(spread)*.005)
      const angle=-spread*.044
      card.position.copy(end);card.quaternion.copy(topRotation);card.rotateZ(angle)
      // Across the table the print faces its holder, preserving the wrist turn on landing.
      if(frame)card.quaternion.multiply(flatHalfTurn)
      if(animated){
        const pose=actor?.releasePose(i)
        const rotation=pose?pose.quaternion.clone().multiply(frontFromBack):tilt.clone()
        const startScale=pose?point(.079/cardWidth,.111/cardHeight,.00125/.0018):point(1,1,1)
        const landed=card.quaternion.clone()
        card.visible=false
        flights.push({card,start:pose?.position.clone()??fallbackOrigin.clone(),end,rotation,landed,startScale,startAt:now+delay,superseded:false})
      }
    })
  }
  const cameraAim=point(0,.89,-.09), projected=point(0,0,0)
  function project(){
    camera.position.set(0,1.68,2.46)
    camera.lookAt(cameraAim);camera.updateMatrixWorld()
    const halfHeight=1.48*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))
    firstPerson.position.copy(camera.localToWorld(point(.12*halfHeight*camera.aspect,-1.04*halfHeight,-1.48)))
    const stage=canvas.closest<HTMLElement>('.battle-stage')
    projected.set(0,surfaceY,tableZ+.35).project(camera)
    stage?.style.setProperty('--pile-caption-x',((1+projected.x)*50)+'%')
    stage?.style.setProperty('--pile-caption-y',((1-projected.y)*50+2)+'%')
    for(const [seat,v] of positions){
      projected.copy(v).project(camera)
      onPosition(seat,(projected.x+1)*50,(1-projected.y)*50)
    }
  }
  function resize(){
    const w=Math.max(canvas.clientWidth,1),h=Math.max(canvas.clientHeight,1)
    camera.aspect=w/h
    // A narrow phone must still fit the two side seats inside the same camera frustum.
    camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.max(Math.tan(THREE.MathUtils.degToRad(12.5)),.555/camera.aspect)))
    camera.updateProjectionMatrix();renderer.setSize(w,h,false);project()
  }
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize()
  const portraitCamera=new THREE.OrthographicCamera(-.19,.19,.19,-.19,.015,1.45)
  let portrait:{actor:SeatActor;leftEye:THREE.Object3D;rightEye:THREE.Object3D;canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;onFailure:()=>void}|undefined
  function setFaceView(seat:number|null,output?:HTMLCanvasElement,onFailure:()=>void=()=>{}){
    portrait=undefined
    if(seat===null||!output)return
    const actor=actors.get(seat),ctx=output.getContext('2d')
    const leftEye=actor?.group.getObjectByName('eye_L'),rightEye=actor?.group.getObjectByName('eye_R')
    if(!actor||!ctx||!leftEye||!rightEye){onFailure();return}
    portrait={actor,leftEye,rightEye,canvas:output,ctx,onFailure}
  }
  const eyePoint=point(0,0,0),otherEye=point(0,0,0),cameraOffset=point(0,0,0),seatOrientation=new THREE.Quaternion()
  function drawFace(){
    if(!portrait)return
    const {actor,leftEye,rightEye,canvas:output,ctx,onFailure}=portrait
    // Draw a second camera directly at the portrait's resolution, with the same
    // lights and already-updated skeleton. Copy this separate view before drawing the table.
    const dpr=renderer.getPixelRatio()
    const size=Math.min(canvas.width,canvas.height,Math.max(1,Math.round(output.clientWidth*dpr)))
    if(!size||!output.clientWidth)return
    if(output.width!==size||output.height!==size){output.width=size;output.height=size}
    eyePoint.copy(leftEye.getWorldPosition(eyePoint)).lerp(rightEye.getWorldPosition(otherEye),.5)
    eyePoint.y-=.022
    cameraOffset.set(0,.016,.70).applyQuaternion(actor.group.getWorldQuaternion(seatOrientation))
    portraitCamera.position.copy(eyePoint).add(cameraOffset);portraitCamera.lookAt(eyePoint)
    const side=size/dpr
    renderer.setScissorTest(true);renderer.setScissor(0,0,side,side);renderer.setViewport(0,0,side,side)
    try{
      renderer.render(scene,portraitCamera)
      ctx.clearRect(0,0,size,size)
      ctx.drawImage(canvas,0,canvas.height-size,size,size,0,0,size,size)
    }catch{
      portrait=undefined;onFailure()
    }finally{
      renderer.setScissorTest(false);renderer.setViewport(0,0,canvas.width/dpr,canvas.height/dpr)
    }
  }
  const unitScale=point(1,1,1)
  function fail(){if(!broken&&!dead){broken=true;onError()}}
  function lost(event:Event){event.preventDefault();fail()}
  canvas.addEventListener('webglcontextlost',lost)
  function tick(now:number){
    if(dead||broken)return
    frameId=requestAnimationFrame(tick)
    // A nominal 24 fps cap yields only 20 frames/s on a 60 Hz screen. Give
    // brief head/hand movements every available 60 Hz frame; idle stays cheap.
    const frameInterval=flights.length||now<activeMotionUntil?1000/60-1:1000/24
    if(document.hidden||now-lastFrame<frameInterval||document.querySelector('dialog[open]'))return
    lastFrame=now
    for(const [seat,queue] of cueQueues){
      const actor=actors.get(seat)
      if(actor)queue.flush(now,(cue,at)=>beginCue(actor,cue,at,!reduced.matches))
    }
    for(const actor of actors.values())actor.update(now)
    for(let i=flights.length-1;i>=0;i--){
      const f=flights[i],p=clamp((now-f.startAt)/flightMs,0,1)
      f.card.visible=now>=f.startAt
      if(!f.card.visible)continue
      const t=p*p*(3-2*p)
      f.card.position.lerpVectors(f.start,f.end,t);f.card.position.y+=.065*Math.sin(Math.PI*p)
      f.card.quaternion.slerpQuaternions(f.rotation,f.landed,t)
      f.card.scale.lerpVectors(f.startScale,unitScale,t)
      if(p>=1){
        if(f.superseded)f.card.removeFromParent()
        flights.splice(i,1)
      }
    }
    try{drawFace();renderer.render(scene,camera)}catch{fail()}
  }
  frameId=requestAnimationFrame(tick)
  return {
    showPlay,setHand,showReactions,resetReactions,
    setFaceView,
    setCounts(values:number[]){values.forEach((value,i)=>{counts[i]=value;actors.get(i)?.hold(value)})},
    dispose(){
      dead=true;cancelAnimationFrame(frameId);observer.disconnect();canvas.removeEventListener('webglcontextlost',lost)
      for(const actor of actors.values())actor.dispose()
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose())
      lamp.shadow.dispose();renderer.dispose()
    }
  }
}
