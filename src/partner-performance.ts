import * as THREE from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { makePreviewCloth } from './partner-cloth.ts'
import { athenaKissDuration, makeAthenaKiss } from './athena-kiss.ts'
import { athenaCheerDuration, makeAthenaCheer } from './athena-cheer.ts'
import { invitationDuration, makeAthenaInvitation } from './athena-invitation.ts'
import { makeGreetingFace } from './greeting-face.ts'
import { partners } from './partner-roster.ts'
import { standingRig, disposeFigure } from './standing-rig.ts'

const smooth = THREE.MathUtils.smoothstep
const up = new THREE.Vector3(0,1,0)
const turn = Math.PI * 2

// Rise into a pose, keep it, then release it independently of the other joints.
function accent(t: number, start: number, peak: number, hold: number, end: number) {
  return smooth(t,start,peak) * (1-smooth(t,hold,end))
}

function makeStance(rig: THREE.Object3D, joints: Map<string,THREE.Bone>) {
  const hips=joints.get('hips')!
  const neutral=hips.position.clone()
  const feet=(['L','R'] as const).map(side=>{
    const thigh=joints.get('upper_leg_'+side)!, knee=joints.get('lower_leg_'+side)!, foot=joints.get('foot_'+side)!
    return {side,thigh,knee,foot,sole:rig.worldToLocal(foot.getWorldPosition(new THREE.Vector3())),
      upper:knee.position.clone().normalize(), lower:foot.position.clone().normalize(),
      a:knee.position.length(), b:foot.position.length()}
  })
  const line=new THREE.Vector3(), pole=new THREE.Vector3(), bend=new THREE.Vector3(), shin=new THREE.Vector3()
  const inv=new THREE.Quaternion(), ankle=new THREE.Quaternion()
  // The weight-bearing shoe stays planted. Lift and tuck apply only to the free foot.
  return (shift:number, drop:number, yaw:number, rise:number, tuck:number, back:number) => {
    hips.position.copy(neutral)
    hips.position.x+=shift
    hips.position.y-=drop
    hips.rotation.set(0,yaw,-shift*.68)
    for(const f of feet){
      line.copy(f.sole)
      const free=f.side==='R'
      if(free){line.x+=tuck;line.y+=rise;line.z-=back}
      hips.worldToLocal(rig.localToWorld(line)).sub(f.thigh.position)
      const d=Math.min(line.length(),f.a+f.b-.000001)
      line.normalize()
      const along=(f.a*f.a-f.b*f.b+d*d)/(2*d)
      pole.set(free?-.09:.09,0,1).addScaledVector(line,-pole.dot(line)).normalize()
      bend.copy(line).multiplyScalar(along).addScaledVector(pole,Math.sqrt(Math.max(0,f.a*f.a-along*along)))
      shin.copy(line).multiplyScalar(d).sub(bend).normalize()
      f.thigh.quaternion.setFromUnitVectors(f.upper,bend.normalize())
      shin.applyQuaternion(inv.copy(f.thigh.quaternion).invert())
      f.knee.quaternion.setFromUnitVectors(f.lower,shin)
      f.foot.quaternion.copy(hips.quaternion).multiply(f.thigh.quaternion).multiply(f.knee.quaternion).invert()
      if(free)f.foot.quaternion.multiply(ankle.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,back*.8))
      if(free)f.foot.rotateX(rise*1.85)
    }
  }
}

// Anchor a wrist relative to a moving body part, with the elbow bending away
// from the torso. The palm and fingertips follow the same anchor during a bow.
function makeArmContact(joints:Map<string,THREE.Bone>,side:'L'|'R',anchorName:string,
  offset:THREE.Vector3,fingers:THREE.Vector3,palmBack:THREE.Vector3,contactInHand?:THREE.Vector3) {
  const arm=joints.get('upper_arm_'+side)!, elbow=joints.get('lower_arm_'+side)!, wrist=joints.get('hand_'+side)!
  const anchor=joints.get(anchorName)!, shoulder=arm.parent!
  const a=elbow.position.length(), b=wrist.position.length(), sign=side==='L'?1:-1
  const armAxis=elbow.position.clone().normalize(), foreAxis=wrist.position.clone().normalize()
  const line=new THREE.Vector3(), pole=new THREE.Vector3(), mid=new THREE.Vector3(), fore=new THREE.Vector3()
  const x=fingers.normalize().multiplyScalar(sign), y=palmBack.addScaledVector(x,-palmBack.dot(x)).normalize()
  const palm=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,x.clone().cross(y)))
  const palmOffset=new THREE.Vector3()
  const upper=new THREE.Quaternion(), lower=new THREE.Quaternion(), target=new THREE.Quaternion(), inv=new THREE.Quaternion()
  return (amount:number)=>{
    if(amount<=0)return
    line.copy(offset)
    if(contactInHand)line.sub(palmOffset.copy(contactInHand).applyQuaternion(palm))
    shoulder.worldToLocal(anchor.localToWorld(line)).sub(arm.position)
    const d=THREE.MathUtils.clamp(line.length(),Math.abs(a-b)+.0001,a+b-.0001)
    line.normalize()
    pole.set(sign*.75,-1,.1).addScaledVector(line,-pole.dot(line)).normalize()
    const along=(a*a-b*b+d*d)/(2*d)
    mid.copy(line).multiplyScalar(along).addScaledVector(pole,Math.sqrt(Math.max(0,a*a-along*along)))
    fore.copy(line).multiplyScalar(d).sub(mid).normalize()
    upper.setFromUnitVectors(armAxis,mid.normalize())
    lower.setFromUnitVectors(foreAxis,fore)
    const wristGoal=shoulder.getWorldQuaternion(inv).invert().multiply(anchor.getWorldQuaternion(target)).multiply(palm)
    target.copy(lower).invert().multiply(wristGoal)
    inv.copy(upper).invert().multiply(lower)
    arm.quaternion.slerp(upper,amount)
    elbow.quaternion.slerp(inv,amount)
    wrist.quaternion.slerp(target,amount)
  }
}

function makeSkirtGrips(rig:THREE.Object3D,joints:Map<string,THREE.Bone>) {
  const meshes:THREE.SkinnedMesh[]=[]
  rig.traverse(node=>{if(node instanceof THREE.SkinnedMesh)meshes.push(node)})
  const surface=(material:string)=>meshes.find(mesh=>!Array.isArray(mesh.material)&&mesh.material.name.startsWith(material))!
  const skirt=surface('HW_body_skirt'), skin=surface('HW_HandSkin'), hips=joints.get('hips')!
  // Authored landmarks on the original skirt and fingertip skin, in the same
  // vertex order preserved by the expression builder. Each cloth landmark is
  // shared by the side/front-quarter panels rather than sitting on the apron.
  const landmarks=[
    {side:'L',sign:1,panel:3367,index:391,thumb:43,flex:[.444,.950,.451,-.452,.303,-.123,-.088]},
    {side:'R',sign:-1,panel:777,index:2190,thumb:1856,flex:[.418,1.063,.666,-.435,.413,-.123,-.097]},
  ] as const
  return landmarks.map(({side,sign,panel,index,thumb,flex})=>{
    const wrist=joints.get('hand_'+side)!
    const anchor=new THREE.Vector3(), pinch=new THREE.Vector3(), point=new THREE.Vector3()
    const move=makeArmContact(joints,side,'hips',anchor,new THREE.Vector3(-sign*.40,-.86,-.22),
      new THREE.Vector3(sign*.76,.06,.65),pinch)
    const fingers=['index_proximal','index_intermediate','index_distal','thumb_proximal','thumb_intermediate']
      .map(name=>joints.get(name+'_'+side)!)
    return {
      close(amount:number) {
        for(let i=0;i<3;i++){
          const finger=fingers[i]
          finger.rotation.y=THREE.MathUtils.lerp(finger.rotation.y,i===0?sign*flex[3]:0,amount)
          finger.rotation.z=THREE.MathUtils.lerp(finger.rotation.z,-sign*flex[i],amount)
        }
        fingers[3].rotation.set(0,sign*flex[4]*amount,sign*flex[5]*amount)
        fingers[4].rotation.set(0,0,sign*flex[6]*amount)
      },
      follow(amount:number) {
        if(amount<=0)return
        // Read the fabric after its spring update, so both fingertips follow the
        // real fold through the dip, the held pose and the lowering of the skirt.
        hips.worldToLocal(skirt.localToWorld(skirt.getVertexPosition(panel,anchor)))
        wrist.worldToLocal(skin.localToWorld(skin.getVertexPosition(index,pinch)))
        wrist.worldToLocal(skin.localToWorld(skin.getVertexPosition(thumb,point)))
        pinch.lerp(point,.5)
        move(amount)
      },
    }
  })
}

export function createPartnerPerformance(gltf: GLTF, index: number, variant:'A'|'B'|'blow-a-kiss'|'side-step-cheer'|'open-palm-invitation'='A') {
  const rig=gltf.scene
  const joints=new Map<string,THREE.Bone>()
  const face=makeGreetingFace(rig,index)
  const selectedGreeting=variant===partners[index].selectionGreeting
  rig.traverse(node=>{
    if(node instanceof THREE.Bone)joints.set(node.name,node)
    if(!(node instanceof THREE.SkinnedMesh))return
    node.frustumCulled=false
  })
  const group=standingRig(rig)
  const stance=makeStance(rig,joints), cloth=makePreviewCloth(group)
  const skirtGrips=index===1&&variant==='A'?makeSkirtGrips(rig,joints):[]
  const kiss=index===2&&variant==='blow-a-kiss'?makeAthenaKiss(rig,joints):null
  const cheer=index===2&&variant==='side-step-cheer'?makeAthenaCheer(group,joints,stance):null
  const invitation=index===2&&variant==='open-palm-invitation'?makeAthenaInvitation(group,joints,stance):null
  const duration=invitation?invitationDuration:cheer?athenaCheerDuration:(kiss?athenaKissDuration:3.35)
  const facing=[-.095,.015,-.16][index]
  const v=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z)
  const contacts:( (amount:number)=>void )[]=[]
  if(variant==='B'){
    if(index===0)for(const [side,s] of [['L',1],['R',-1]] as const)
      contacts.push(makeArmContact(joints,side,'chest',v(s*.105,side==='L'?.087:.11,.19),v(-s*.79,.62,-.08),v(0,0,1)))
    else if(index===1){
      contacts.push(makeArmContact(joints,'L','hips',v(.181,.022,.046),v(-.20,-.90,.18),v(.80,.10,.20)))
      contacts.push(makeArmContact(joints,'R','head',v(-.166,.065,.136),v(.58,.72,-.3),v(0,.2,1)))
    }else contacts.push(makeArmContact(joints,'R','chest',v(-.064,.065,.211),v(.68,.73,-.10),v(0,.1,1)))
  }
  const pivot=joints.get('foot_L')!.getWorldPosition(new THREE.Vector3())
  pivot.y=0
  pivot.z+=.055
  const arc=new THREE.Vector3()
  const transitionBones=[...joints.values()].filter(b=>/^(hips|spine|chest|neck|head|shoulder_|upper_|lower_|hand_|foot_|index_|middle_|ring_|little_|thumb_)/.test(b.name))
  const saved=[group,...transitionBones].map(node=>({node,q:node.quaternion.clone(),p:node.position.clone()}))
  let lastAge:number|null=null, blendStart=-Infinity, lastLift=0, interruptedLift=0
  let lastWave=0, interruptedWave=0
  const rotate=(name:string,x:number,y:number,z:number)=>joints.get(name)?.rotation.set(x,y,z)
  const hands=(['L','R'] as const).map(side=>({side,sign:side==='L'?1:-1,
    fingers:['index','middle','ring','little'].map(finger=>
      ['proximal','intermediate','distal'].map(b=>joints.get(finger+'_'+b+'_'+side)))}))

  return {group,pose(elapsed:number,greetingAge:number|null,reduced:boolean) {
    // Snapshot the displayed pose only when a running greeting is interrupted.
    // The new performance can start immediately without snapping a wrist or rewinding a turn.
    if(lastAge!==null&&lastAge<duration&&(greetingAge===null||greetingAge+.0001<lastAge)){
      blendStart=elapsed
      interruptedLift=lastLift
      interruptedWave=lastWave
      face.interrupt()
      for(const s of saved){s.q.copy(s.node.quaternion);s.p.copy(s.node.position)}
    }
    lastAge=greetingAge
    const age=reduced?-1:(greetingAge??-1)
    const t=kiss||cheer||invitation?-1:age
    const clock=reduced?0:elapsed, phase=index*1.7
    const breath=reduced?0:Math.sin(clock*[1.52,1.68,1.29][index]+phase)
    const sway=reduced?0:Math.sin(clock*[.87,.70,.61][index]+.5+phase)
    const look=reduced?0:Math.sin(clock*[1.08,.91,.75][index]+phase)
    const first=variant==='A'
    const wave=index===0&&first?accent(t,.11,.70,1.63,2.28):0
    const waiting=reduced?0:1-accent(t,0,.28,2.62,3.24)
    // These quieter habits have separate clocks so the cast does not move in unison.
    const curious=index===0?waiting*accent((clock+.7)%8.70,1.9,2.8,3.2,4.1):0
    const apron=index===1?waiting*accent((clock+1.4)%9.85,4.1,5.0,5.4,6.3):0
    const listen=index===2?waiting*accent((clock+2.1)%11.30,7.4,8.5,9.05,10.0):0
    const flutter=wave*Math.sin((t-.74)*10.6)
    const offer=index===1&&first?accent(t,.04,.50,2.04,2.50):0
    const pinch=index===1&&first?accent(t,.29,.54,1.99,2.21):0
    const lift=index===1&&first?accent(t,.55,.99,1.47,1.97):0
    const dip=index===1&&first?accent(t,.45,1.13,1.46,2.06):0
    const step=index===1&&first?accent(t,.02,.51,1.70,2.31):0
    const open=index===2&&first?accent(t,.24,.90,2.24,3.05):0
    const wind=index===2&&first?accent(t,0,.30,.34,.73):0
    const spin=index===2&&first&&t>=0?smooth(t,.33,2.52)*turn:0
    const settle=index===2&&first?accent(t,2.15,2.58,2.80,3.26):0
    const free=index===2?accent(t,.36,.94,first?1.94:1.45,first?2.52:2.1):0
    const heart=index===0&&!first?accent(t,.06,.72,1.74,2.51):0
    const salute=index===1&&!first?accent(t,.13,.76,1.68,2.37):0
    const onHip=index===1&&!first?accent(t,.01,.59,1.94,2.63):0
    const halfTurn=index===2&&!first?accent(t,.12,1.08,1.20,2.02):0
    const honor=index===2&&!first?accent(t,1.19,1.85,2.55,3.17):0
    const nod=(index===0?accent(t,.72,1.14,1.25,1.70)*heart:accent(t,1.72,2.12,2.31,2.68)*honor)
    const spinYaw=spin-.20*wind+.105*settle-2.64*halfTurn+.14*heart-.16*onHip
    const idleShift=[.014,.012,.016][index]*sway
    if(index===0&&first){
      // Hana waves from her shoulders. Keep the same stance even on replay.
      stance(0,.012,0,0,0,0)
    }else{
      const shift=idleShift+.063*dip+.057*free+.033*heart+.043*onHip
      stance(shift,.012+Math.abs(idleShift)*.22+.09*dip+.019*wind+.012*settle+.016*nod,
        .057*sway-.08*dip+.21*wind-.10*settle,
        .094*free+.027*Math.sin(Math.PI*step),.11*free+.075*step,.055*free+.090*step)
    }
    group.rotation.set(0,facing+spinYaw,0)
    // Rotate around the planted left forefoot instead of sliding both feet around the plinth.
    group.position.copy(pivot).applyAxisAngle(up,facing).sub(arc.copy(pivot).applyAxisAngle(up,facing+spinYaw))
    rotate('spine',.022+breath*.014+.13*dip,-.048*sway-.10*wave+.10*wind,-.028*sway+.065*wave-.075*dip)
    rotate('chest',-.018+breath*.010+.12*dip-.035*open+.065*apron,.035*look+.17*wave-.18*dip-.22*wind+.19*settle-.12*listen,.021*sway-.04*wave)
    rotate('neck',-.014+.09*dip+.07*apron-.045*listen,.062*look-.16*wave+.08*dip+.19*wind-.09*listen,.013*sway+.055*curious)
    rotate('head',-.04+breath*.012+.12*dip+.05*settle+.155*apron-.075*listen,.092*look-.08*wave+.14*dip+.27*wind+.18*settle+.18*curious-.18*listen,
      (index===0?.05:.018)+sway*.033+.11*wave+.08*dip-.073*open+.105*curious)
    if(variant==='B'){
      const chest=joints.get('chest')!, head=joints.get('head')!
      chest.rotation.x+=.16*nod+.09*salute
      chest.rotation.y+=.24*heart-.11*salute+.27*halfTurn
      head.rotation.x+=.21*nod-.095*salute
      head.rotation.z-=.12*heart+.115*salute
      head.rotation.y-=.20*heart-.16*salute-.38*halfTurn
    }

    for(const {side,sign,fingers} of hands) {
      const waving=side==='R'?wave:0
      const skirt=offer*.24
      const reach=open*(side==='R'?1:.78)
      // The three silhouettes read as an open palm, a curtsy and an unfurling turn.
      rotate('shoulder_'+side,0,-sign*.035*reach,sign*(.045*waving+.06*skirt+.065*reach))
      rotate('upper_arm_'+side,.035-.17*skirt-.17*reach,-sign*(.08+.14*skirt-.14*reach+.19*apron),
        -sign*(1.08-.055*sway*sign-1.60*waving-.38*skirt-.81*reach+.08*(wave-waving)+.22*apron))
      rotate('lower_arm_'+side,-.016+.06*skirt,-sign*(.43+.07*look+.09*skirt-.18*reach+.15*waving+.32*apron),
        -sign*(.13-1.36*waving+.12*skirt+.18*reach+.66*apron+(side==='R'?.13*flutter:0)))
      rotate('hand_'+side,.015-.19*skirt+.12*reach+.63*waving,-sign*(.06+.25*waving+.10*reach),
        sign*(.035+.16*skirt-.20*reach+(side==='R'?.27*flutter:0)))
      fingers.forEach((bones,i)=>{
        const curl=(.20+.060*i)*(1-waving*.91-skirt*.22-reach*.52)
        for(const [j,b] of bones.entries())b?.rotation.set(0,j===0?sign*(i-1.5)*.046*waving:0,-sign*curl)
      })
    }
    if(variant==='B'){
      if(index===0){contacts[0](heart);contacts[1](heart)}
      else if(index===1){contacts[0](onHip);contacts[1](salute)}
      else contacts[0](honor)
    }
    // Bring the waving elbow forward so the long sleeve clears the edge
    // at the same camera scale as the standing portrait.
    if (wave > 0) joints.get('upper_arm_R')!.rotateOnWorldAxis(up, .75 * smooth(wave, 0, .55))
    kiss?.(age)
    cheer?.(elapsed,age)
    invitation?.(elapsed,age)
    for(const grip of skirtGrips)grip.close(pinch)
    const blinkTime=(clock+[1.02,3.13,.29][index])%[4.7,5.4,6.1][index]
    const blend=reduced?1:smooth(elapsed,blendStart,blendStart+.34)
    face.pose(selectedGreeting?greetingAge:null,reduced,reduced?0:accent(blinkTime,3.42,3.50,3.52,3.65),blend)
    if(elapsed<blendStart+.34&&!reduced)for(const s of saved){
      s.node.quaternion.slerp(s.q,1-blend)
      s.node.position.lerp(s.p,1-blend)
    }
    lastLift=THREE.MathUtils.lerp(interruptedLift,lift,blend)
    // Keep the sleeve hanging from the displayed arm when a wave is replayed.
    lastWave=THREE.MathUtils.lerp(interruptedWave,wave,blend)
    cloth(elapsed,reduced,lastWave+heart*.85,heart*.85,lastLift)
    for(const grip of skirtGrips)grip.follow(offer)
  },dispose(){disposeFigure(group)}}
}
