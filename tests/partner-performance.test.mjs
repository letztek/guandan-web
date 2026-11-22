import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { OrthographicCamera, Quaternion, Texture, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createPartnerPerformance } from '../src/partner-performance.ts'
import { framePartner } from '../src/partner-preview.ts'
import { partners } from '../src/partner-roster.ts'

async function loadRig(model) {
  const bytes = await readFile(new URL('../public/' + model, import.meta.url))
  // Use the shipped skin, bones and transforms. Pose sampling needs no image decoder.
  const loader = new GLTFLoader().register(() => ({
    name: 'test-textures',
    loadTexture: () => Promise.resolve(new Texture()),
  }))
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
}

function capture(group) {
  group.updateMatrixWorld(true)
  return ['head', 'chest', 'hand_L', 'hand_R'].map(name => {
    const joint = group.getObjectByName(name)
    return {position: joint.getWorldPosition(new Vector3()), rotation: joint.getWorldQuaternion(new Quaternion())}
  })
}

function poseDistance(a, b) {
  return Math.max(...a.map(({position, rotation}, i) =>
    Math.max(position.distanceTo(b[i].position), rotation.angleTo(b[i].rotation))))
}

const candidates = partners.flatMap((partner, index) =>
  [...new Set(['A', 'B', partner.selectionGreeting])].map(variant => ({ partner, index, variant })))

const facialAccents = ['EA_blink_smile_L', 'EA_blink_smile', 'EA_brow_happy']
for (const [index, partner] of partners.entries()) {
  test(partner.name + ' shows a facial accent with the greeting and releases it on interruption', async () => {
    const actor = createPartnerPerformance(await loadRig(partner.model), index, partner.selectionGreeting)
    const key = facialAccents[index]
    // Find a mesh on which this authored morph actually deforms visible geometry.
    let face
    actor.group.traverse(node => {
      const slot = node.morphTargetDictionary?.[key]
      if (face || slot === undefined) return
      const delta = node.geometry.morphAttributes.position[slot]
      for (let i = 0; i < delta.count; i++) {
        if (Math.hypot(delta.getX(i), delta.getY(i), delta.getZ(i)) > .0001) {face = node; break}
      }
    })
    assert.ok(face, partner.name + ' has an authored ' + key)
    const weight = name => face.morphTargetInfluences[face.morphTargetDictionary[name]]
    const atRest = () => {assert.equal(weight('gentleSmile'), .70); assert.equal(weight(key), 0)}
    try {
      actor.pose(0, null, false)
      atRest()
      actor.pose(1.12, 1.12, false)
      const selected = weight(key)
      assert.ok(selected > .60 && weight('gentleSmile') === 0)
      assert.ok(weight('EA_happy_mouth') <= .70, 'keep the mouth within its original gentle-smile range')
      if (partner.id === 'athena') {
        assert.deepEqual(['EA_surprised_eye','EA_brow_happy','EA_happy_mouth','EA_blink_R'].map(weight),
          [.69,.90,.68,0], 'use audition B’s exact open-eye and closed-mouth blend')
      }
      for (const vowel of ['aa','ih','ou','ee','oh']) assert.equal(weight('EA_' + vowel), 0)
      actor.pose(1.28, 1.28, false)
      assert.equal(weight(key), selected, 'hold through the gesture accent')
      actor.pose(1.28, 0, false)
      assert.equal(weight(key), selected, 'replaying starts at the displayed expression')
      actor.pose(2.48, 1.20, false)
      actor.pose(2.48, null, false)
      assert.equal(weight(key), selected, 'switching preserves the outgoing face for the first frame')
      actor.pose(2.65, null, false)
      assert.ok(weight(key) > 0 && weight(key) < selected)
      actor.pose(2.85, null, false)
      atRest()
      actor.pose(4, 0, true)
      const still = face.morphTargetInfluences.slice()
      assert.ok(weight('gentleSmile') < .3, 'the selected face also registers with reduced motion')
      for (const lid of ['EA_blink', 'EA_blink_R', 'EA_blink_smile', 'EA_blink_smile_L']) assert.equal(weight(lid), 0)
      actor.pose(6, 2, true)
      assert.deepEqual(face.morphTargetInfluences, still)
      actor.pose(6, null, true)
      atRest()
      actor.pose(10, 4, false)
      atRest()
    } finally { actor.dispose() }
  })
}

for (const { partner, index, variant } of candidates) {
  test(partner.name + ' ' + variant + ' idles until greeted, settles and respects reduced motion', async () => {
    const gltf = await loadRig(partner.model)
    const figure = createPartnerPerformance(gltf, index, variant)
    const idle = []
    for (let frame = 0; frame <= 120; frame++) {
      figure.pose(frame / 24, null, false)
      idle.push(capture(figure.group))
    }
    assert.ok(idle.some(p => poseDistance(p, idle[0]) > .008), 'the unselected character visibly moves')
    figure.dispose()

    const active = createPartnerPerformance(await loadRig(partner.model), index, variant)
    let largestGesture = 0
    for (let frame = 0; frame <= 120; frame++) {
      const time = frame / 24
      const age = frame < 12 ? null : (frame - 12) / 24
      active.pose(time, age, false)
      const distance = poseDistance(capture(active.group), idle[frame])
      if (age === null) assert.ok(distance < .0001, 'no greeting on entry')
      else largestGesture = Math.max(largestGesture, distance)
    }
    assert.ok(largestGesture > .12, 'choosing this character produces a distinct greeting')
    assert.ok(poseDistance(capture(active.group), idle.at(-1)) < .025, 'the greeting returns to idle')
    active.pose(6, 1, false)
    const midGesture = capture(active.group)
    active.pose(6, 0, false)
    assert.ok(poseDistance(capture(active.group), midGesture) < .001, 'a repeat click blends from the displayed pose')
    active.pose(7, .9, false)
    const beforeSwitch = capture(active.group)
    active.pose(7, null, false)
    assert.ok(poseDistance(capture(active.group), beforeSwitch) < .001, 'switching characters does not snap the outgoing pose')
    active.pose(8, null, true)
    const still = capture(active.group)
    active.pose(9, .85, true)
    assert.ok(poseDistance(still, capture(active.group)) < .0001, 'reduced motion keeps a steady pose')
    active.dispose()
  })
}

test('Hana keeps her hips and both shoes in place through the wave, replay and release', async () => {
  const hana = partners.find(partner => partner.id === 'hanakomachi')
  const actor = createPartnerPerformance(await loadRig(hana.model), 0, hana.selectionGreeting)
  const joint = name => actor.group.getObjectByName(name)
  try {
    actor.pose(0, null, false)
    actor.group.updateMatrixWorld(true)
    const anchors = ['hips', 'foot_L', 'foot_R'].map(name => [joint(name), joint(name).matrixWorld.clone()])
    const wrist = joint('hand_R'), atRest = wrist.getWorldPosition(new Vector3())
    let reach = 0
    for (let frame = 1; frame <= 160; frame++) {
      const time = frame / 30
      const age = time < .5 || time > 4 ? null : time < 2 ? time - .5 : time - 2
      actor.pose(time, age, false)
      actor.group.updateMatrixWorld(true)
      for (const [bone, initial] of anchors) {
        bone.matrixWorld.elements.forEach((v, i) => assert.ok(Math.abs(v-initial.elements[i])<.00001, bone.name))
      }
      reach = Math.max(reach, wrist.getWorldPosition(new Vector3()).distanceTo(atRest))
    }
    assert.ok(reach > .25, 'the right hand still reaches out to wave')
  } finally {actor.dispose()}
})

test('Hana keeps the full standing portrait scale in the three-column lobby', () => {
  const camera = new OrthographicCamera()
  // Real stage rectangles near the three-column breakpoint and on desktop.
  for (const [w, h] of [[165, 243], [166, 244], [278, 367], [372, 435]]) {
    framePartner(camera, 0, w / h)
    assert.ok(Math.abs(camera.top - 2) < .0001)
    assert.ok(Math.abs(camera.bottom + .15) < .0001)
  }
})

test('Hana stands over the center of her plinth even in a narrow selection card', async () => {
  const hana = partners.find(partner => partner.id === 'hanakomachi')
  const actor = createPartnerPerformance(await loadRig(hana.model), 0, hana.selectionGreeting)
  const camera = new OrthographicCamera(-1, 1, 2, -.15, .1, 10)
  camera.position.z = 4
  camera.updateMatrixWorld()
  const foot = name => actor.group.getObjectByName(name).getWorldPosition(new Vector3())
  try {
    for (const [elapsed, age] of [[0,null], [1.25,1.1], [1.25,0], [2.75,1.5], [3,null]]) {
      actor.pose(elapsed, age, false)
      const feetMidpoint = foot('foot_L').lerp(foot('foot_R'), .5)
      for (const aspect of [.46, .66, .82, .98, 1.3]) {
        framePartner(camera, 0, aspect)
        assert.ok(Math.abs(feetMidpoint.clone().project(camera).x) < .01,
          'both boots should straddle the center of the fixed portrait')
      }
    }
    // Replay at the top of the wave. The sleeve should keep draping while
    // the displayed arm eases into the beginning of the next wave.
    framePartner(camera, 0, .46)
    for (let frame = 0; frame <= 58; frame++) {
      const t = frame / 30
      actor.pose(7.46+t, t < 1.68 ? t : t-1.68, false)
      if (frame !== 54) continue
      actor.group.updateMatrixWorld(true)
      const point = new Vector3()
      actor.group.traverse(mesh => {
        if (!mesh.isSkinnedMesh) return
        for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
          mesh.localToWorld(mesh.getVertexPosition(i, point))
          assert.ok(point.x > camera.left+.015 && point.x < camera.right-.015,
            'all of the sleeve stays inside the centered portrait on replay')
        }
      })
    }
  } finally {actor.dispose()}
})

test('Athena keeps C’s step and presents an open hand aligned with her forearm', async () => {
  const athena = partners.find(partner => partner.id === 'athena')
  const actor = createPartnerPerformance(await loadRig(athena.model), 2, athena.selectionGreeting)
  const pos = name => actor.group.getObjectByName(name).getWorldPosition(new Vector3())
  // Stepping shoe and head positions from the original selection film.
  const landmarks = new Map([
    [23, [[-.18061,.16769,.08849],[-.06391,1.45047,.12789]]],
    [56, [[-.27429,.12882,-.00336],[-.15694,1.44045,.13445]]],
    [105, [[-.15701,.13848,.11162],[-.01557,1.45603,.14552]]],
  ])
  try {
    for (let frame = 0; frame <= 125; frame++) {
      const age = frame / 30 - .45
      actor.pose(age+1.45,age<0?null:age,false)
      if (landmarks.has(frame)) {
        const [shoe,head] = landmarks.get(frame)
        assert.ok(pos('foot_R').distanceTo(new Vector3(...shoe)) < .001)
        assert.ok(pos('head').distanceTo(new Vector3(...head)) < .001)
      }
      const elbow = pos('lower_arm_L'), wrist = pos('hand_L')
      const forearm = wrist.clone().sub(elbow), palm = pos('middle_proximal_L').sub(wrist)
      assert.ok(forearm.angleTo(palm) < Math.PI/9, 'palm follows the forearm on opening and closing')
      if (age > 1.2 && age < 2.3) {
        const upperArm = elbow.sub(pos('upper_arm_L'))
        assert.ok(forearm.angleTo(upperArm) > Math.PI/8, 'elbow stays bent at full reach')
        const rotation = actor.group.getObjectByName('hand_L').getWorldQuaternion(new Quaternion())
        assert.ok(new Vector3(0,-1,0).applyQuaternion(rotation).y > .80, 'palm faces up')
      }
    }
  } finally {actor.dispose()}
})

test('the archived Athena side-step cheer matches its source motion', async () => {
  const athena = partners.find(partner => partner.id === 'athena')
  const actor = createPartnerPerformance(await loadRig(athena.model), 2, 'side-step-cheer')
  // Metre-space landmarks sampled from frames of the selected C audition.
  const frames = new Map([
    [24, {foot_R: [-.22180,.18727,.09860], hand_R: [-.22643,1.15366,.42121]}],
    [47, {foot_R: [-.35665,.12882,.06141], hips: [-.14166,.90682,.13981],
      hand_R: [-.65146,1.67075,.18470], index_distal_R: [-.68795,1.75671,.12868], hand_L: [.10234,1.00082,.27238]}],
    [67, {hand_R: [-.64493,1.67499,.18765], hand_L: [.10763,1.00199,.27323]}],
    [125, {foot_R: [-.15013,.12882,.11837], hand_R: [-.29400,.86245,.20631]}],
  ])
  try {
    for (let frame = 0; frame <= 125; frame++) {
      const age = frame / 30 - .45
      actor.pose(age + 1.45, age < 0 ? null : age, false)
      for (const [joint, point] of Object.entries(frames.get(frame) ?? {})) {
        const displayed = actor.group.getObjectByName(joint).getWorldPosition(new Vector3())
        assert.ok(displayed.distanceTo(new Vector3(...point)) < .001, `${joint} matches frame ${frame} within one millimetre`)
      }
    }
  } finally {actor.dispose()}
})
