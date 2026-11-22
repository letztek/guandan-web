import * as THREE from 'three'
import { makeArm } from './athena-arm.ts'

export const invitationDuration = 3.55
const smooth = THREE.MathUtils.smoothstep
function beat(t: number, start: number, peak: number, hold: number, end: number) {
  return smooth(t,start,peak) * (1-smooth(t,hold,end))
}

export function makeAthenaInvitation(group: THREE.Group, joints: Map<string, THREE.Bone>,
  stance: (shift:number, drop:number, yaw:number, rise:number, tuck:number, back:number) => void) {
  const spine = joints.get('spine')!, chest = joints.get('chest')!
  const head = joints.get('head')!, neck = joints.get('neck')!
  const offer = makeArm(group,joints,'L',true), restHand = makeArm(group,joints,'R')
  const thumbs = [...joints.values()].filter(joint=>joint.name.startsWith('thumb_'))
    .map(joint=>({joint, neutral:joint.quaternion.clone()}))
  const torso = new THREE.Vector3(), target = new THREE.Vector3(), end = new THREE.Vector3()
  const elbow = new THREE.Vector3(), fingers = new THREE.Vector3(), back = new THREE.Vector3()
  return (elapsed: number, age: number) => {
    for (const {joint,neutral} of thumbs) joint.quaternion.copy(neutral)
    if (age <= 0 || age >= invitationDuration) return

    const moving = beat(age,.04,.47,invitationDuration-.53,invitationDuration)
    const step = beat(age,.11,.75,2.51,3.14)
    const extend = beat(age,.38,1.20,2.35,2.95)
    const palmUp = beat(age,.50,1.20,2.35,2.94)
    const lift = .055*(Math.sin(Math.PI*smooth(age,.11,.75))+Math.sin(Math.PI*smooth(age,2.51,3.14)))
    const sway = Math.sin(elapsed*.61+3.9)
    stance(.016*sway-.071*step,.012+Math.abs(.016*sway)*.22+.013*step,.057*sway-.42*step,
      lift,-.14*step,.099*step)
    spine.rotation.x += .070*extend
    spine.rotation.y -= .12*step
    chest.rotation.y -= .10*step
    chest.rotation.z += .075*extend
    neck.rotation.x += .025*extend
    head.rotation.y += .72*step
    head.rotation.x += .030*extend
    head.rotation.z -= .205*extend
    group.worldToLocal(chest.getWorldPosition(torso))

    // Lead with the elbow, unfold the palm and let the fingers soften at the
    // end of the invitation. Sweep a shallow arc clear of the bodice.
    target.set(torso.x+.17,torso.y-.16,torso.z+.205)
      .lerp(end.set(torso.x+.43,torso.y-.10,torso.z+.25),extend)
    target.z += .046*Math.sin(Math.PI*extend)
    offer(moving,target,elbow.set(.57,-1,-.18),fingers.set(.72,.05,.66),
      back.set(.75-.65*palmUp,-.17-.71*palmUp,.43-.75*palmUp),.10-.055*extend,.046)
    target.set(torso.x-.136,torso.y+.045,torso.z+.163)
    restHand(moving,target,elbow.set(-.49,-.97,-.26),fingers.set(.56,.80,.03),back.set(-.23,-.21,.94),.075,.024)
  }
}
