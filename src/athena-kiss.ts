import * as THREE from 'three'
import clip from './athena-kiss-data.ts'

export const athenaKissDuration = clip.duration

// Athena's jaw and arm proportions differ from Y Bot. Guide her gloved index
// to the surface of her lips while preserving the captured elbow plane and wrist roll.
function registerLips(rig:THREE.Object3D,joints:Map<string,THREE.Bone>) {
  const meshes:THREE.SkinnedMesh[]=[]
  rig.traverse(node=>{if(node instanceof THREE.SkinnedMesh)meshes.push(node)})
  const mesh=(prefix:string)=>meshes.find(m=>!Array.isArray(m.material)&&m.material.name.startsWith(prefix))!
  const face=mesh('ATH_Head'), glove=mesh('ATH_GloveShell')
  const head=joints.get('head')!,arm=joints.get('upper_arm_L')!,elbow=joints.get('lower_arm_L')!,wrist=joints.get('hand_L')!
  const start=new THREE.Vector3(),middle=new THREE.Vector3(),end=new THREE.Vector3(),goal=new THREE.Vector3()
  const finger=new THREE.Vector3(), lip=new THREE.Vector3(), direction=new THREE.Vector3(), pole=new THREE.Vector3()
  const from=new THREE.Vector3(),to=new THREE.Vector3(),swing=new THREE.Quaternion(),local=new THREE.Quaternion(),hand=new THREE.Quaternion()
  function aim(bone:THREE.Bone,child:THREE.Bone,target:THREE.Vector3) {
    const origin=bone.getWorldPosition(from)
    to.copy(target).sub(origin).normalize()
    from.sub(child.getWorldPosition(direction)).negate().normalize()
    swing.setFromUnitVectors(from,to).multiply(bone.getWorldQuaternion(local))
    bone.quaternion.copy(bone.parent!.getWorldQuaternion(local).invert().multiply(swing))
  }
  return (time:number)=>{
    const rise=THREE.MathUtils.smoothstep(time,.76,1.18)
    const release=1-THREE.MathUtils.smoothstep(time,1.96,2.29)
    const breathe=1-.32*THREE.MathUtils.smoothstep(time,1.36,1.58)
    const weight=rise*release*breathe
    if(!weight)return
    head.updateWorldMatrix(true,true)
    arm.updateWorldMatrix(true,true)
    // Front lip vertex 3059 is on the original mouth-opening morph. Index 201
    // is the skin at the end of the left glove, rather than its last knuckle.
    face.localToWorld(face.getVertexPosition(3059,lip))
    head.worldToLocal(lip).add(to.set(.008,.001,.008))
    head.localToWorld(lip)
    glove.localToWorld(glove.getVertexPosition(201,finger))
    arm.getWorldPosition(start);elbow.getWorldPosition(middle);wrist.getWorldPosition(end)
    wrist.getWorldQuaternion(hand)
    goal.copy(end).addScaledVector(lip.sub(finger),weight)
    const a=start.distanceTo(middle),b=middle.distanceTo(end)
    direction.subVectors(goal,start)
    const d=THREE.MathUtils.clamp(direction.length(),Math.abs(a-b)+.00001,a+b-.00001)
    direction.normalize()
    pole.subVectors(middle,start)
    pole.addScaledVector(direction,-pole.dot(direction)).normalize()
    const along=(a*a-b*b+d*d)/(2*d)
    middle.copy(start).addScaledVector(direction,along).addScaledVector(pole,Math.sqrt(Math.max(0,a*a-along*along)))
    aim(arm,elbow,middle)
    aim(elbow,wrist,goal)
    wrist.quaternion.copy(elbow.getWorldQuaternion(local).invert().multiply(hand))
  }
}

export function makeAthenaKiss(rig:THREE.Object3D,joints: Map<string, THREE.Bone>) {
  const bytes=Uint8Array.from(atob(clip.rotations),c=>c.charCodeAt(0))
  const data=new DataView(bytes.buffer), tracks=clip.joints.map(name=>joints.get(name)!)
  const thumbRest=tracks.filter(b=>b.name.startsWith('thumb_')).map(b=>({b,q:b.quaternion.clone()}))
  const correctContact=registerLips(rig,joints)
  const a=new THREE.Quaternion(), b=new THREE.Quaternion()
  const sample=(i:number,q:THREE.Quaternion)=>q.set(data.getInt16(i,true)/32767,data.getInt16(i+2,true)/32767,
    data.getInt16(i+4,true)/32767,data.getInt16(i+6,true)/32767).normalize()
  return (time:number)=>{
    for(const {b,q} of thumbRest)b.quaternion.copy(q)
    if(time<=0||time>=clip.duration)return
    const blend=THREE.MathUtils.smoothstep(time,0,.35)*(1-THREE.MathUtils.smoothstep(time,3.82,clip.duration))
    const at=time*(clip.frames-1)/clip.duration, frame=Math.floor(at), stride=tracks.length*8
    for(const [i,bone] of tracks.entries()){
      sample(frame*stride+i*8,a).slerp(sample((frame+1)*stride+i*8,b),at-frame)
      bone.quaternion.slerp(a,blend)
    }
    correctContact(time)
  }
}
