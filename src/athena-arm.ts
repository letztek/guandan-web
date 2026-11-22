import * as THREE from 'three'

const vector = () => new THREE.Vector3()

// Solve the elbow bend and wrist orientation against Athena's own bind pose.
// Targets and palm directions are expressed in actor-local space.
export function makeArm(group: THREE.Group, joints: Map<string, THREE.Bone>, side: 'L' | 'R', followForearm = false, fingerBlend = .14) {
  const sign = side === 'L' ? 1 : -1
  const bone = (name: string) => joints.get(name + '_' + side)!
  const arm = bone('upper_arm'), elbow = bone('lower_arm'), wrist = bone('hand')
  const clavicle = arm.parent!
  const upperAxis = elbow.position.clone().normalize(), foreAxis = wrist.position.clone().normalize()
  const a = elbow.position.length(), b = wrist.position.length()
  const goal = vector(), pole = vector(), mid = vector(), fore = vector()
  const x = vector(), y = vector(), z = vector(), matrix = new THREE.Matrix4()
  const upper = new THREE.Quaternion(), lower = new THREE.Quaternion()
  const inverse = new THREE.Quaternion(), hand = new THREE.Quaternion()
  const clavicleToActor = new THREE.Quaternion(), actorToClavicle = new THREE.Quaternion()
  const foreDirection = vector(), backHere = vector(), backGoal = vector(), perpendicular = vector()
  const roll = new THREE.Quaternion()
  // Keep a small, visible bend at the longest open-handed reach.
  const maxDistance = followForearm ? Math.sqrt(a*a + b*b + 2*a*b*Math.cos(Math.PI/6)) : a+b-.00002
  const fingers = ['index', 'middle', 'ring', 'little', 'thumb'].map(finger =>
    ['proximal', 'intermediate', 'distal'].map(joint => bone(finger + '_' + joint)))
  const thumbFlex = [.37, .57, .52], fingerFlex = [.90, 1.28, .94]

  return (strength: number, target: THREE.Vector3, elbowDirection: THREE.Vector3,
    fingerDirection: THREE.Vector3, palmBack: THREE.Vector3, grip: number, spread: number, handAlignment = fingerBlend) => {
    if (!strength) return
    goal.copy(target)
    clavicle.worldToLocal(group.localToWorld(goal)).sub(arm.position)
    const distance = THREE.MathUtils.clamp(goal.length(), Math.abs(a-b) + .00002, maxDistance)
    goal.normalize()
    pole.copy(elbowDirection).applyQuaternion(group.getWorldQuaternion(inverse))
      .applyQuaternion(clavicle.getWorldQuaternion(inverse).invert())
    pole.addScaledVector(goal, -pole.dot(goal)).normalize()
    const along = (a*a - b*b + distance*distance) / (2*distance)
    mid.copy(goal).multiplyScalar(along).addScaledVector(pole, Math.sqrt(Math.max(0, a*a-along*along)))
    fore.copy(goal).multiplyScalar(distance).sub(mid).normalize()
    upper.setFromUnitVectors(upperAxis, mid.normalize())
    lower.setFromUnitVectors(foreAxis, fore)
    x.copy(fingerDirection).normalize()
    if (followForearm) {
      clavicleToActor.copy(group.getWorldQuaternion(inverse).invert()).multiply(clavicle.getWorldQuaternion(roll))
      actorToClavicle.copy(clavicleToActor).invert()
      foreDirection.copy(fore).applyQuaternion(clavicleToActor)
      // The metacarpals continue the forearm through the whole sweep. A small
      // bias in the fingertips keeps a relaxed wrist as the elbow opens.
      x.copy(foreDirection).lerp(fingerDirection, handAlignment).normalize()
      // Supination comes from the forearm. Roll around its long axis, which
      // preserves the wrist target and leaves only a gentle bend in the hand.
      backHere.set(0,1,0).applyQuaternion(lower)
      backHere.addScaledVector(fore,-backHere.dot(fore)).normalize()
      backGoal.copy(palmBack).applyQuaternion(actorToClavicle)
      backGoal.addScaledVector(fore,-backGoal.dot(fore)).normalize()
      const angle = Math.atan2(fore.dot(perpendicular.crossVectors(backHere,backGoal)),backHere.dot(backGoal))
      lower.premultiply(roll.setFromAxisAngle(fore,angle))
    }
    x.multiplyScalar(sign)
    y.copy(palmBack).addScaledVector(x, -x.dot(palmBack)).normalize()
    hand.setFromRotationMatrix(matrix.makeBasis(x, y, z.crossVectors(x, y)))
      .premultiply(group.getWorldQuaternion(inverse))
      .premultiply(clavicle.getWorldQuaternion(inverse).invert())
      .premultiply(inverse.copy(lower).invert())
    arm.quaternion.slerp(upper, strength)
    elbow.quaternion.slerp(inverse.copy(upper).invert().multiply(lower), strength)
    wrist.quaternion.slerp(hand, strength)
    for (const [i, bones] of fingers.entries()) {
      const thumb = i === 4
      for (const [j, joint] of bones.entries()) {
        const flex = thumb ? .10 + grip*thumbFlex[j] : .05 + .036*i + grip*fingerFlex[j]
        const lateral = thumb ? .16 + grip*.68 : (j === 0 ? (i-1.5)*spread : 0)
        joint.rotation.z = THREE.MathUtils.lerp(joint.rotation.z, -sign*flex, strength)
        joint.rotation.y = THREE.MathUtils.lerp(joint.rotation.y, sign*lateral, strength)
      }
    }
  }
}

