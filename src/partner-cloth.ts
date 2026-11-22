import * as THREE from 'three'

// The exported FEZ rigs already have weighted sleeve, skirt, ribbon and hair chains.
// Simulate their tips in world space so they follow the shoulder and hips with a delay.
export function makePreviewCloth(rig: THREE.Object3D, sleeveDrape: 'gesture'|'gravity' = 'gesture') {
  const chains: {
    joint: THREE.Bone; end: THREE.Vector3; rest: THREE.Quaternion
    tip: THREE.Vector3; speed: THREE.Vector3
    stiffness: number; gravity: number; maxAngle: number; sleeveSide: 'L'|'R'|undefined
    curtsyAngle: number
  }[] = []
  rig.traverse(node => {
    if (!(node instanceof THREE.Bone) || !/sleeve|skirt|aprontie|backribbon|braid|ATH_Tail/i.test(node.name)) return
    const child = node.children.find(c => c instanceof THREE.Bone && c.position.lengthSq() > .000001)
    if (!child) return
    const sleeve = /sleeve/i.test(node.name)
    const skirt = /skirt/i.test(node.name)
    const panel = /^Skirt_(F|B)?(L|R)_([123])$/.exec(node.name)
    // Lift the side and front-quarter folds together. The front apron hangs free.
    const curtsyAngle = panel ? (panel[2]==='L'?1:-1) * (panel[1]==='F'?.78:panel[1]==='B'?.32:1)
      * [.59,.22,.08][Number(panel[3])-1] : 0
    // Hana has three fabric edges under each arm. HW has one short bell sleeve.
    const looseSide = sleeveDrape==='gravity' ? /^Sleeve_([LR])_/.exec(node.name)?.[1] : undefined
    chains.push({joint:node, end:child.position.clone(), rest:node.quaternion.clone(),
      tip:new THREE.Vector3(), speed:new THREE.Vector3(),
      stiffness:sleeve?265:skirt?170:155, gravity:sleeve?.12:skirt?.045:.085, maxAngle:sleeve?.18:skirt?.19:.18,
      sleeveSide:node.name.startsWith('SleeveR_')||looseSide==='R'?'R':node.name.startsWith('SleeveL_')||looseSide==='L'?'L':undefined,curtsyAngle})
  })
  const anchor = new THREE.Vector3(), restDir = new THREE.Vector3(), springDir = new THREE.Vector3()
  const target = new THREE.Vector3(), force = new THREE.Vector3(), before = new THREE.Vector3()
  const rotation = new THREE.Matrix4()
  const world = new THREE.Quaternion(), swing = new THREE.Quaternion(), capped = new THREE.Quaternion()
  const sleeveOut = new THREE.Vector3()
  let previous = -1
  return (time: number, staticPose: boolean, raisedRight = 0, raisedLeft = 0, curtsyLift = 0, joinedHands = 0) => {
    const dt = THREE.MathUtils.clamp(time - previous, 0, .09)
    const reset = previous < 0 || time <= previous || staticPose
    previous = time
    rig.updateWorldMatrix(true, true)
    if (joinedHands) sleeveOut.set(1,0,0).applyQuaternion(rig.getWorldQuaternion(world))
    for (const chain of chains) {
      const {joint,rest,tip,speed} = chain
      joint.quaternion.copy(rest)
      if (chain.curtsyAngle && curtsyLift) joint.rotateZ(chain.curtsyAngle * curtsyLift)
      joint.updateWorldMatrix(false,false)
      anchor.setFromMatrixPosition(joint.matrixWorld)
      restDir.copy(chain.end).applyMatrix4(joint.matrixWorld).sub(anchor)
      const length = restDir.length()
      if (!length) continue
      restDir.divideScalar(length)
      target.copy(restDir)
      // When Hana lifts her arm, the long kimono sleeve hangs from her elbow.
      const drape = chain.sleeveSide==='R' ? raisedRight : chain.sleeveSide==='L' ? raisedLeft : 0
      // During a sustained tutorial gesture the wrist can turn palm-up. Give
      // the free hem enough swing to fall below its attachment even then.
      target.y -= chain.gravity + drape*(sleeveDrape==='gravity' ? 4 : 2.6)
      // When the wrists gather, each bell sleeve folds to the outside of its elbow.
      if (joinedHands && chain.sleeveSide) target.addScaledVector(sleeveOut, (chain.sleeveSide==='L'?1:-1)*3.6*joinedHands)
      target.normalize().multiplyScalar(length).add(anchor)
      if (reset) {
        tip.copy(target)
        speed.set(0,0,0)
      } else {
        // Substeps keep long ribbons stable at the 24–30 fps size of the selection screen.
        const steps = Math.max(1,Math.ceil(dt * 90)), step = dt / steps
        const drag = Math.exp(-step * Math.sqrt(chain.stiffness) * 1.3)
        for (let i=0;i<steps;i++) {
          force.subVectors(target,tip).multiplyScalar(chain.stiffness * step)
          speed.add(force).multiplyScalar(drag)
          tip.addScaledVector(speed,step)
        }
      }
      springDir.subVectors(tip,anchor).normalize()
      swing.setFromUnitVectors(restDir,springDir)
      const angle = 2*Math.acos(Math.min(1,Math.abs(swing.w)))
      const maxAngle = chain.maxAngle + drape*(sleeveDrape==='gravity' ? Math.PI-chain.maxAngle : .82)
      capped.identity().slerp(swing, Math.min(1,maxAngle/Math.max(.0001,angle)))
      springDir.copy(restDir).applyQuaternion(capped)
      before.copy(tip)
      tip.copy(springDir).multiplyScalar(length).add(anchor)
      if (!reset && dt > 0) speed.addScaledVector(force.subVectors(tip,before),.5/dt).clampLength(0,1.1)
      world.setFromRotationMatrix(rotation.extractRotation(joint.matrixWorld))
      swing.copy(world).invert().multiply(capped).multiply(world)
      joint.quaternion.multiply(swing)
      joint.updateWorldMatrix(false,false)
    }
  }
}
