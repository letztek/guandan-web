import * as THREE from 'three'
import { makeArm } from './athena-arm.ts'

export const athenaCheerDuration = 3.26

type Stance = (shift: number, drop: number, yaw: number, rise: number, tuck: number, back: number) => void
const smooth = THREE.MathUtils.smoothstep
const vector = () => new THREE.Vector3()

function beat(time: number, start: number, peak: number, hold: number, end: number) {
  return smooth(time, start, peak) * (1 - smooth(time, hold, end))
}

export function makeAthenaCheer(group: THREE.Group, joints: Map<string, THREE.Bone>, stance: Stance) {
  const bone = (name: string) => joints.get(name)!
  const chest = bone('chest'), spine = bone('spine'), head = bone('head')
  const neck = bone('neck'), hips = bone('hips')
  const shoulders = {left: bone('shoulder_L'), right: bone('shoulder_R')}
  const rightArm = bone('upper_arm_R')
  const raiseFist = makeArm(group, joints, 'R'), handOnHip = makeArm(group, joints, 'L')
  const thumbs = [...joints.values()].filter(joint => joint.name.startsWith('thumb_'))
    .map(joint => ({joint, rest: joint.quaternion.clone()}))
  const torso = vector(), waist = vector(), target = vector(), next = vector()
  const pole = vector(), tip = vector(), back = vector()

  return (elapsed: number, age: number) => {
    for (const {joint, rest} of thumbs) joint.quaternion.copy(rest)
    if (age <= 0 || age >= athenaCheerDuration) return
    const moving = beat(age, .015, .40, athenaCheerDuration-.47, athenaCheerDuration)
    const step = beat(age, .12, .70, 2.39, 2.98)
    const drive = beat(age, .48, .99, 2.15, 2.70)
    const gather = beat(age, .06, .45, .5, .91)
    const stride = .065 * (Math.sin(Math.PI * smooth(age, .12, .70)) + Math.sin(Math.PI * smooth(age, 2.39, 2.98)))
    const sway = Math.sin(elapsed*.61 + 3.9)
    const shift = .016*sway + .031*gather - .107*step
    stance(shift, .012 + Math.abs(.016*sway)*.22 + .042*gather + .013*step,
      .057*sway + .24*drive, stride, -.21*step, .023*step)
    spine.rotation.x -= .05*drive
    spine.rotation.y -= .14*drive
    chest.rotation.y -= .18*drive
    chest.rotation.z += .145*drive
    head.rotation.y += .09*drive
    head.rotation.z -= .095*drive
    neck.rotation.x -= .02*drive
    shoulders.left.rotation.z += .07*drive
    shoulders.right.rotation.z -= .24*drive

    group.worldToLocal(chest.getWorldPosition(torso))
    group.worldToLocal(hips.getWorldPosition(waist))
    const shoulderHeight = group.worldToLocal(rightArm.getWorldPosition(next)).y
    target.set(torso.x-.168, shoulderHeight-.235, torso.z+.24)
      .lerp(next.set(torso.x-.097, shoulderHeight-.10, torso.z+.265), gather)
      .lerp(next.set(torso.x-.52, shoulderHeight+.415, torso.z+.127), drive)
    raiseFist(moving, target, pole.set(-.86,-.44,-.10), tip.set(-.16-.49*drive,.89,.14), back.set(-.66,.05,.72), .93, .006)
    target.set(waist.x+.262, waist.y+.094, waist.z+.092)
    handOnHip(moving, target, pole.set(1,-.15,-.16), tip.set(-.18,-.95,.10), back.set(.82,.04,.5), .11, .03)
  }
}
