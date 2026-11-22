import * as THREE from 'three'

type FaceProfile = {
  greeting: [number, number, number, number]
  features: Record<string, number>
  eyelid?: { name: string; weight: number; timing: [number, number, number, number] }
}

const profiles: FaceProfile[] = [
  { // Wink on the outward sleeve sweep.
    greeting: [.08, .50, 1.86, 2.50],
    features: {EA_happy_eye: .40, EA_brow_happy: .66, EA_happy_mouth: .45},
    eyelid: {name: 'EA_blink_smile_L', weight: 1, timing: [.59, .85, 1.34, 1.65]},
  },
  { // Lower both eyelids at the bottom of the curtsy, then look up as she rises.
    greeting: [.13, .55, 1.92, 2.48],
    features: {EA_relaxed_eye: .46, EA_brow_relaxed: .66, EA_happy_mouth: .32},
    eyelid: {name: 'EA_blink_smile', weight: .96, timing: [.63, 1.03, 1.48, 1.95]},
  },
  { // Audition B's open-eyed, closed-lip smile through the invitation.
    greeting: [.08, .65, 2.70, 3.38],
    features: {EA_surprised_eye: .69, EA_brow_happy: .90, EA_happy_mouth: .68},
  },
]

function envelope(t: number, [start, peak, hold, end]: FaceProfile['greeting']) {
  const smooth = THREE.MathUtils.smoothstep
  return smooth(t, start, peak) * (1 - smooth(t, hold, end))
}

export function makeGreetingFace(rig: THREE.Object3D, index: number) {
  const profile = profiles[index]
  type Part = {
    weights: number[]; legacy?: number; blink?: number; eyelid?: number
    features: {slot: number; amount: number; eye: boolean}[]
  }
  const parts: Part[] = []
  rig.traverse(node => {
    if (!(node instanceof THREE.SkinnedMesh)) return
    const slots = node.morphTargetDictionary, weights = node.morphTargetInfluences
    if (!slots || !weights) return
    const legacy = slots.gentleSmile
    if (legacy !== undefined) weights[legacy] = .70
    const features = Object.entries(profile.features).flatMap(([name, amount]) =>
      slots[name] === undefined ? [] : [{slot: slots[name], amount, eye: name.endsWith('_eye')}])
    parts.push({weights, legacy, blink: slots.EA_blink, features,
      eyelid: profile.eyelid ? slots[profile.eyelid.name] : undefined})
  })

  let expression = 0, eyelid = 0, fromExpression = 0, fromEyelid = 0
  return {
    interrupt() { fromExpression = expression; fromEyelid = eyelid },
    pose(age: number | null, reduced: boolean, naturalBlink: number, transition: number) {
      const target = age === null ? 0 : reduced ? .85 : envelope(age, profile.greeting)
      const close = age !== null && !reduced && profile.eyelid
        ? profile.eyelid.weight * envelope(age, profile.eyelid.timing) : 0
      expression = THREE.MathUtils.lerp(fromExpression, target, transition)
      eyelid = THREE.MathUtils.lerp(fromEyelid, close, transition)
      // A spontaneous two-eye blink should not close the open eye during Hana's wink.
      const blink = naturalBlink * (1 - eyelid) * (index === 2 ? 1 - expression : 1)
      for (const part of parts) {
        if (part.blink !== undefined) part.weights[part.blink] = blink
        if (!part.features.length) continue
        // The legacy smile contains its own eyes, eyebrows and mouth. Crossfade
        // it out as the separate authored facial shapes take over.
        if (part.legacy !== undefined) part.weights[part.legacy] = .70 * (1 - expression)
        if (part.eyelid !== undefined) part.weights[part.eyelid] = eyelid
        for (const feature of part.features) {
          const strength = feature.eye ? expression * (1 - eyelid) * (1 - blink) : expression
          part.weights[feature.slot] = feature.amount * strength
        }
      }
    },
  }
}
