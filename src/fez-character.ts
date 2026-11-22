import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { MToonMaterial, MToonMaterialLoaderPlugin } from '@pixiv/three-vrm-materials-mtoon'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { assetPath } from './assets'
import { paintCard } from './fez-character-cards'
import { cardFaceIndex } from './fez-deck'
import { partners } from './partner-roster'
import { createSeatReactions, faceKeys, type SeatCue } from './seat-reactions'
import cardsMotion from './cards-seated.json'
export type { SeatCue } from './seat-reactions'

type Card = { rank:string; suit:string }
export type FezModel = 'hanakomachi' | 'high-waitress' | 'athena'
export type SeatFacing = 'left'|'front'|'right'
export type SeatOptions = { model?:FezModel; facing?:SeatFacing; onReady?:()=>void }
export type SeatActor = {
  group:THREE.Group
  releasePoint:THREE.Vector3
  releasePose(index:number):{position:THREE.Vector3;quaternion:THREE.Quaternion}|undefined
  react(cue:SeatCue,nowMs?:number,animate?:boolean):void
  resetReactions():void
  hold(count:number):void
  play(cards:Card[],nowMs?:number):void
  update(nowMs:number):void
  reset():void
  dispose():void
}
export const SEAT_RELEASE_MS=460
const pickupMs=145,turnStartMs=220,turnEndMs=430,sendEndMs=850
const handsRestAtMs=SEAT_RELEASE_MS+520
export const fezModels = Object.fromEntries(partners.map(person => [
  person.rig, {name: person.name, mesh: person.model, portrait: person.portrait},
])) as Record<FezModel, {name: string; mesh: string; portrait: string}>
const models=new Map<FezModel,Promise<GLTF>>()
// White-balance the characters for the inn's amber key and rim. Applying the
// same linear gain to both bands preserves the authored MToon shade contrast.
const lanternBalance=new THREE.Color(.66,.8,.93)
function loadModel(id:FezModel){
  let p=models.get(id)
  if(!p){
    const loader=new GLTFLoader().register(parser=>new MToonMaterialLoaderPlugin(parser))
    p=loader.loadAsync(assetPath(fezModels[id].mesh)).then(gltf=>{
      for(const material of gltf.userData.vrmMToonMaterials as MToonMaterial[]){
        material.color.multiply(lanternBalance)
        material.shadeColorFactor.multiply(lanternBalance)
      }
      return gltf
    }).catch(e=>{models.delete(id);throw e})
    models.set(id,p)
  }
  return p
}
const v=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z)
const q=()=>new THREE.Quaternion()
const smooth=(x:number)=>{const t=THREE.MathUtils.clamp(x,0,1);return t*t*(3-2*t)}
const downToChair=.39
let deckPromise:Promise<HTMLImageElement>|undefined
function deckImage(){
  if(!deckPromise)deckPromise=new Promise<HTMLImageElement>((resolve,reject)=>{
    const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=assetPath('fez-cards/deck.webp')
  }).catch(e=>{deckPromise=undefined;throw e})
  return deckPromise
}
function makeCardKit(){
  const geometry=new THREE.BoxGeometry(.079,.111,.00125)
  const side=new THREE.MeshStandardMaterial({color:'#e5d7af',roughness:.93})
  const back=new THREE.MeshStandardMaterial({name:'card-back',map:paintCard(),roughness:.9})
  const fronts=new Map<string,THREE.MeshStandardMaterial>()
  let disposed=false
  function card(face?:Card){
    let print=back
    if(face){
      const key=face.rank+face.suit
      if(!fronts.has(key)){
        const t=paintCard(face)
        fronts.set(key,new THREE.MeshStandardMaterial({name:'card-front-'+key,map:t,roughness:.9}))
        void deckImage().then(img=>{
          if(disposed)return
          const i=cardFaceIndex(face),paper=t.image as HTMLCanvasElement
          const w=img.naturalWidth/9,h=img.naturalHeight/6
          paper.getContext('2d')!.drawImage(img,(i%9)*w,Math.floor(i/9)*h,w,h,0,0,paper.width,paper.height);t.needsUpdate=true
        }).catch(()=>{})
      }
      print=fronts.get(key)!
    }
    return new THREE.Mesh(geometry,[side,side,side,side,back,print])
  }
  return {card,dispose(){
    disposed=true;geometry.dispose();side.dispose();back.map?.dispose();back.dispose()
    for(const front of fronts.values()){front.map?.dispose();front.dispose()}
  }}
}

// The web derivations preserve the registered skin weights and the source bind positions.
// Their joints use parallel bind axes so IK can be solved in the actor's own coordinates.
function solveChain(first:THREE.Vector3,goal:THREE.Vector3,pole:THREE.Vector3,a:THREE.Vector3,b:THREE.Vector3){
  const la=a.length(),lb=b.length(),aim=goal.clone().sub(first)
  const d=THREE.MathUtils.clamp(aim.length(),Math.abs(la-lb)+.0001,la+lb-.0001);aim.normalize()
  const perp=pole.clone().addScaledVector(aim,-pole.dot(aim)).normalize()
  const along=(la*la-lb*lb+d*d)/(2*d)
  const mid=first.clone().addScaledVector(aim,along).addScaledVector(perp,Math.sqrt(Math.max(0,la*la-along*along)))
  const end=first.clone().addScaledVector(aim,d)
  const upper=q().setFromUnitVectors(a.clone().normalize(),mid.clone().sub(first).normalize())
  const lower=q().setFromUnitVectors(b.clone().normalize(),end.clone().sub(mid).normalize())
  return {upper,lower,end}
}
type JointLookup=(id:string)=>THREE.Object3D
function formFingers(bone:JointLookup,side:'L'|'R'){
  const s=side==='L'?1:-1
  // Contact is expressed in the original wrist frame. Opposing skin pads sit on the two paper faces.
  const contact=v(s*.105,-.022,.018)
  for(const finger of ['index','thumb']){
    const p=bone(finger+'_proximal_'+side),m=bone(finger+'_intermediate_'+side),d=bone(finger+'_distal_'+side)
    const tipDirection=finger==='index'?v(-s*.60,.78,.13).normalize():v(s*.88,-.34,-.32).normalize()
    const thickness=finger==='index'?.0029:-.0029
    const tip=contact.clone().add(v(0,thickness,0))
    const finalLength=d.position.length()*(finger==='index'?.87:.75)
    const distalTarget=tip.clone().addScaledVector(tipDirection,-finalLength)
    const pole=finger==='index'?v(s*.90,-.24,.13):v(s*.15,.27,.91)
    const solved=solveChain(p.position,distalTarget,pole,m.position,d.position)
    p.quaternion.copy(solved.upper)
    m.quaternion.copy(solved.upper.clone().invert()).multiply(solved.lower)
    const final=q().setFromUnitVectors(d.position.clone().normalize(),tipDirection)
    d.quaternion.copy(solved.lower.clone().invert()).multiply(final)
  }
  for(const [finger,angle] of [['middle',.47],['ring',.65],['little',.78]] as const){
    for(const [part,ratio] of [['proximal',.75],['intermediate',1.04],['distal',.72]] as const){
      const joint=bone(finger+'_'+part+'_'+side)
      joint.rotation.z=-s*angle*ratio
    }
  }
  return contact
}
function handRig(bone:JointLookup,side:'L'|'R',actor:THREE.Group){
  const s=side==='L'?1:-1
  const upper=bone('upper_arm_'+side),lower=bone('lower_arm_'+side),hand=bone('hand_'+side)
  const pinch=formFingers(bone,side)
  const anchor=new THREE.Object3D();anchor.name='pinch-anchor-'+side;anchor.position.copy(pinch);hand.add(anchor)
  const localX=v(-.81,.57*s,.03*s).normalize()
  const localY=v(0,0,1).addScaledVector(localX,-localX.z).normalize()
  const restPalm=q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(localX,localY,localX.clone().cross(localY)))
  const lapPalm=q().setFromEuler(new THREE.Euler(.08,-s*1.92,0,'YXZ'))
  return (contact:THREE.Vector3,cardRotation:THREE.Quaternion,relax=0,pole=v(s*.62,-.95,-.22))=>{
    const shoulderAt=actor.worldToLocal(upper.getWorldPosition(v()))
    const parentRotation=actor.getWorldQuaternion(q()).invert().multiply(upper.parent!.getWorldQuaternion(q()))
    const palm=cardRotation.clone().multiply(restPalm).slerp(lapPalm,relax)
    const wrist=contact.clone().sub(pinch.clone().applyQuaternion(palm))
    const solved=solveChain(shoulderAt,wrist,pole,lower.position,hand.position)
    upper.quaternion.copy(parentRotation.invert().multiply(solved.upper))
    lower.quaternion.copy(solved.upper.clone().invert()).multiply(solved.lower)
    hand.quaternion.copy(solved.lower.clone().invert()).multiply(palm)
    return solved.end.add(pinch.clone().applyQuaternion(palm))
  }
}

/** Returns a metre-scale seated actor. Local +Z points toward the table. The caller owns time and rendering. */
export async function createSeatActor(id:FezModel):Promise<SeatActor>{
  const source=await loadModel(id),group=new THREE.Group(),model=cloneSkeleton(source.scene)
  group.name='Seat '+fezModels[id].name;group.add(model);model.position.y=-downToChair
  const joints=new Map<string,THREE.Object3D>()
  const faces:{weights:number[]; slots:number[]; blink?:number; legacy?:number; authored:boolean}[]=[]
  model.traverse(n=>{
    if(n instanceof THREE.Bone)joints.set(n.name,n)
    if(n instanceof THREE.SkinnedMesh){
      n.frustumCulled=false;n.castShadow=true
      const dictionary=n.morphTargetDictionary,weights=n.morphTargetInfluences
      if(dictionary&&weights){
        const slots=faceKeys.map(key=>dictionary[key]??-1)
        const authored=slots.some(slot=>slot>=0)
        faces.push({weights,slots,blink:dictionary.EA_blink,legacy:dictionary.gentleSmile,authored})
      }
    }
  })
  const bone=(name:string)=>{const n=joints.get(name);if(!n)throw Error('Missing '+id+' joint '+name);return n}
  for(const s of ['L','R']){
    bone('upper_leg_'+s).rotation.x=-1.48
    bone('lower_leg_'+s).rotation.x=1.51
    bone('foot_'+s).rotation.x=-.025
  }
  model.updateMatrixWorld(true)
  const left=handRig(bone,'L',group),right=handRig(bone,'R',group)
  const torso=['spine','chest','neck','head'].map(bone),neck=torso[2],head=torso[3]
  const bindPose=torso.map(joint=>joint.quaternion.clone())
  const fingers=Array.from(joints.values()).filter(j=>/^(thumb|index|middle|ring|little)_/.test(j.name))
    .map(joint=>({joint,pose:joint.quaternion.clone(),right:joint.name.endsWith('_R')}))
  const reactions=createSeatReactions(id),motionPreference=window.matchMedia('(prefers-reduced-motion: reduce)')
  // Lay the fronts of the independent skirt chains over the seated thighs.
  for(const joint of joints.values()){
    if(!/skirt|apron/i.test(joint.name)||joint.parent?.name!=='hips')continue
    const deltaZ=joint.getWorldPosition(v()).z-bone('hips').getWorldPosition(v()).z
    joint.rotation.x=-.88*smooth((deltaZ+.06)/.20)
  }
  const kit=makeCardKit(),fan=new THREE.Group(),slots:THREE.Group[]=[],moving=new THREE.Group()
  fan.name='held-fan';moving.name='played-in-hand'
  group.add(fan,moving)
  for(let i=0;i<6;i++){const slot=new THREE.Group(),c=kit.card();slot.add(c);c.position.y=.034;slot.position.z=i*.00145;fan.add(slot);slots.push(slot)}
  const holdAt=v(.079,.900,.265),restAt=v(.001,.902,.269),pickAt=v(.041,.901,.276)
  const restPaper=q().setFromEuler(new THREE.Euler(-.12,-.09,-.04))
  const playedPaper=q().setFromEuler(new THREE.Euler(1.48,.05,-.11))
  const offset=v(0,.032,0)
  const releasePoint=v(-.125,.835,.456)
  const releasePin=releasePoint.clone().sub(offset.clone().applyQuaternion(playedPaper))
  const releasePoses:{position:THREE.Vector3;quaternion:THREE.Quaternion}[]=[]
  // Low wrists and palms turned down let the fingers lie on each clothed thigh.
  function lapContact(side:'L'|'R'){
    const thigh=bone('upper_leg_'+side).getWorldPosition(v())
    const knee=bone('lower_leg_'+side).getWorldPosition(v())
    return group.worldToLocal(thigh.lerp(knee,.63)).add(v(side==='L'?.023:-.023,.14,.012))
  }
  const relaxedLeft=lapContact('L'),relaxedRight=lapContact('R')
  let count=27,start=-1,last=performance.now(),dead=false
  const clearPlay=()=>{start=-1;moving.visible=false;moving.clear();releasePoses.length=0}
  const reset=()=>{clearPlay();reactions.reset()}
  const update=(time:number)=>{
    if(dead)return
    last=time
    const elapsed=start>=0?Math.max(0,time-start):-1
    const reach=elapsed<0?0:elapsed<pickupMs?smooth(elapsed/pickupMs):elapsed<SEAT_RELEASE_MS?1:1-smooth((elapsed-SEAT_RELEASE_MS)/380)
    const throwProgress=elapsed<0?0:smooth((elapsed-160)/(SEAT_RELEASE_MS-160))
    const reduced=motionPreference.matches
    const response=reactions.sample(time,reduced)
    const inPlay=elapsed>=0&&elapsed<sendEndMs
    for(let i=0;i<torso.length;i++)torso[i].quaternion.copy(bindPose[i])
    let pole:THREE.Vector3|undefined,reachOffset:THREE.Vector3|undefined
    if(inPlay&&!reduced){
      // The seated Cards excerpt stores local rotations, elbow direction and a
      // small hand-path correction every 10 ms. Seat position stays game-owned.
      const index=Math.floor(elapsed/10),sample=cardsMotion.samples[index],next=cardsMotion.samples[index+1]
      const t=(elapsed-sample.ms)/10
      for(let i=0;i<torso.length;i++){
        const delta=q().fromArray(sample.quats[i]).slerp(q().fromArray(next.quats[i]),t)
        torso[i].quaternion.multiply(delta)
      }
      pole=v().fromArray(sample.pole).lerp(v().fromArray(next.pole),t)
      reachOffset=v().fromArray(sample.reachOffset).lerp(v().fromArray(next.reachOffset),t)
    }
    const idle=inPlay?1-smooth(elapsed/100)*(1-smooth((elapsed-700)/150)):1
    torso[0].rotateX(response.lean*.46)
    torso[1].rotateX(response.lean*.54)
    neck.quaternion.multiply(q().setFromEuler(new THREE.Euler(response.pitch*.32,response.yaw*.35,response.roll*.3)))
    head.quaternion.multiply(q().setFromEuler(new THREE.Euler(.065*idle+response.pitch*.68,response.yaw*.65,-.012*idle+response.roll*.7)))
    const blink=reactions.blink(time,reduced)
    for(const face of faces){
      if(face.legacy!==undefined)face.weights[face.legacy]=face.authored?0:response.face[faceKeys.indexOf('EA_happy_mouth')]
      if(face.blink!==undefined)face.weights[face.blink]=blink
      for(let i=0;i<face.slots.length;i++){
        const slot=face.slots[i]
        if(slot>=0)face.weights[slot]=response.face[i]*(faceKeys[i].endsWith('_eye')&&face.blink!==undefined?1-blink:1)
      }
    }
    let rightAt=restAt.clone(),paper=restPaper.clone()
    if(elapsed>=0){
      if(elapsed<160)rightAt.lerp(pickAt,reach)
      else if(elapsed<SEAT_RELEASE_MS){
        rightAt.copy(pickAt).lerp(releasePin,throwProgress);rightAt.y+=Math.sin(throwProgress*Math.PI)*.028
        paper.slerp(playedPaper,smooth((elapsed-turnStartMs)/(turnEndMs-turnStartMs)))
      }else{
        rightAt.lerp(releasePin,reach);paper.slerp(playedPaper,reach)
      }
    }
    if(reachOffset)rightAt.addScaledVector(reachOffset,smooth((elapsed-pickupMs)/55))
    const empty=count>0?0:elapsed<0?1:smooth((elapsed-SEAT_RELEASE_MS)/(handsRestAtMs-SEAT_RELEASE_MS))
    // Until release both hands follow the normal throw, including the final card.
    // Afterwards the empty throwing hand returns straight to the lap.
    if(count===0&&elapsed>=SEAT_RELEASE_MS)rightAt.copy(releasePin)
    const leftContact=left(holdAt.clone().lerp(relaxedLeft,empty),restPaper,empty)
    const rightContact=right(rightAt.lerp(relaxedRight,empty),paper,empty,pole)
    const releaseOpening=elapsed<SEAT_RELEASE_MS?0:.78*smooth((elapsed-SEAT_RELEASE_MS)/95)*(1-smooth((elapsed-615)/185))
    for(const finger of fingers){
      const open=finger.right?Math.max(empty*.88,releaseOpening):empty*.88
      finger.joint.quaternion.copy(finger.pose)
      if(open>0)finger.joint.quaternion.slerp(q(),open)
    }
    fan.position.copy(leftContact).add(v(-.012,0,0));fan.quaternion.copy(restPaper)
    const visible=Math.min(6,count)
    for(let i=0;i<slots.length;i++){
      slots[i].visible=i<visible;slots[i].rotation.z=(i-(visible-1)/2)*.172
    }
    moving.visible=elapsed>=0&&elapsed<SEAT_RELEASE_MS
    moving.position.copy(elapsed<pickupMs?pickAt:rightContact).add(offset.clone().applyQuaternion(paper))
    moving.quaternion.copy(paper)
    if(elapsed>=(count===0?handsRestAtMs:sendEndMs))clearPlay()
  }
  update(last)
  return {group,releasePoint,update,reset,
    releasePose(i){
      const pose=releasePoses[i]
      if(!pose)return undefined
      return {position:group.localToWorld(pose.position.clone()),quaternion:group.getWorldQuaternion(q()).multiply(pose.quaternion)}
    },
    react(cue,now=last,animate=true){reactions.react(cue,now,animate,motionPreference.matches)},
    resetReactions(){reactions.reset()},
    hold(n){count=Math.max(0,Math.round(n))},
    play(cards,now=last){clearPlay();if(!cards.length)return;start=now;cards.forEach((c,i)=>{
      const m=kit.card(c);const relative=i-(cards.length-1)*.5
      m.position.set(relative*Math.min(.009,.10/cards.length),0,i*.0015);m.rotation.z=relative*Math.min(.04,.4/cards.length);moving.add(m)
    })
      // Sample the actual model's reachable pinch, including each card's spread.
      // This remains correct when frame timing skips over the release instant.
      update(now+SEAT_RELEASE_MS)
      releasePoint.copy(moving.position)
      for(const card of moving.children){
        releasePoses.push({position:card.position.clone().applyQuaternion(moving.quaternion).add(moving.position),
          quaternion:moving.quaternion.clone().multiply(card.quaternion)})
      }
      update(now)
    },
    dispose(){if(dead)return;dead=true;reset();group.removeFromParent();model.traverse(n=>{if(n instanceof THREE.SkinnedMesh)n.skeleton.dispose()});kit.dispose()},
  }
}

/** Standalone practice portrait; battle mounts the same actor in its shared perspective scene. */
export function mountCharacter(canvas:HTMLCanvasElement,onError?:()=>void,options:SeatOptions={}){
  const empty={play(_cards:Card[]){},reset(){},setCount(_count:number){},dispose(){}}
  let renderer:THREE.WebGLRenderer
  try{renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'})}
  catch{onError?.();return empty}
  renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.65))
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-.5,.5,.5,-.5,.01,10)
  camera.position.set(0,1.075,3.4);camera.lookAt(0,1.041,0)
  scene.add(new THREE.HemisphereLight('#fff7e9','#bac7d3',1.74))
  const main=new THREE.DirectionalLight('#fff2dc',1.35);main.position.set(-2.2,4,3.5);scene.add(main)
  const edge=new THREE.DirectionalLight('#ffe1ad',.67);edge.position.set(2.4,2.5,-1.6);scene.add(edge)
  function size(){const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight),r=w/h
    const height=Math.max(.84,.80/r);camera.top=height/2;camera.bottom=-height/2;camera.left=-r*height/2;camera.right=-camera.left;camera.updateProjectionMatrix();renderer.setSize(w,h,false)}
  const observer=new ResizeObserver(size);observer.observe(canvas);size()
  let actor:SeatActor|undefined,dead=false,failed=false,frame=0,last=-1000,ready=false,number=27
  const fail=()=>{if(!dead&&!failed){failed=true;onError?.()}}
  const contextLost=(e:Event)=>{e.preventDefault();fail()};canvas.addEventListener('webglcontextlost',contextLost)
  const id=options.model||'hanakomachi'
  void createSeatActor(id).then(a=>{
    if(dead||failed){a.dispose();return}
    actor=a;a.hold(number);a.group.rotation.y=options.facing==='left'?.42:options.facing==='right'?-.42:-.08;scene.add(a.group)
  }).catch(fail)
  const tick=(now:number)=>{
    if(dead||failed)return
    frame=requestAnimationFrame(tick)
    if(!actor||document.hidden||canvas.clientWidth<2||canvas.clientHeight<2||now-last<24)return
    last=now
    try{actor.update(now);renderer.render(scene,camera);if(!ready){ready=true;options.onReady?.()}}catch{fail()}
  }
  frame=requestAnimationFrame(tick)
  return {play(cards:Card[]){actor?.play(cards,performance.now())},reset(){actor?.reset()},setCount(n:number){number=n;actor?.hold(n)},
    dispose(){dead=true;cancelAnimationFrame(frame);observer.disconnect();canvas.removeEventListener('webglcontextlost',contextLost);actor?.dispose();renderer.dispose()}}
}
