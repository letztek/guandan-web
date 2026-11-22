import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { Texture, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createPartnerPerformance } from '../src/partner-performance.ts'

test('High Waitress holds both skirt panels between thumb and forefinger while raising and lowering the cloth', async () => {
  const bytes = await readFile(new URL('../public/character/high-waitress-seat.glb', import.meta.url))
  const loader = new GLTFLoader().register(() => ({name: 'no-textures', loadTexture: () => Promise.resolve(new Texture())}))
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  const figure = createPartnerPerformance(gltf, 1, 'A')
  const { group } = figure
  const hips = group.getObjectByName('hips'), sole = group.getObjectByName('foot_L')
  const skirt = group.getObjectByName('high-waitress_4'), hand = group.getObjectByName('high-waitress_8')
  const localScale = hips.getWorldScale(new Vector3()).y
  const vertex = (mesh, i) => mesh.localToWorld(mesh.getVertexPosition(i, new Vector3()))
  const hipsLocal = v => hips.worldToLocal(v.clone()).multiplyScalar(localScale)
  const sides = [
    { panel: 3367, lowerFold: 3446, index: 391, thumb: 43, sign: 1 },
    { panel: 777, lowerFold: 770, index: 2190, thumb: 1856, sign: -1 },
  ]
  function capture() {
    group.updateMatrixWorld(true)
    return sides.map(({panel, lowerFold, index, thumb, sign}) => {
      const fabric = vertex(skirt, panel), fold = hipsLocal(vertex(skirt, lowerFold))
      const indexTip = vertex(hand, index), thumbTip = vertex(hand, thumb)
      return {
        panelHeight: hipsLocal(fabric).y, hemHeight: fold.y, width: fold.x * sign,
        indexDistance: indexTip.distanceTo(fabric), thumbDistance: thumbTip.distanceTo(fabric),
        padSeparation: thumbTip.distanceTo(indexTip),
      }
    })
  }
  try {
    let initial, planted
    for (let i = 0; i <= 90; i++) {
      const age = i / 30
      figure.pose(age, age, false)
      const samples = capture()
      if (i === 0) {
        initial = samples
        planted = sole.getWorldPosition(new Vector3())
      }
      if (age >= .54 && age <= 1.99) {
        for (const sample of samples) {
          assert.ok(sample.indexDistance < .006 && sample.thumbDistance < .006, 'both finger pads stay on their fold')
          assert.ok(sample.padSeparation > .001 && sample.padSeparation < .008, 'the fingers close around the cloth')
        }
      }
      if (age >= 1.18 && age <= 1.46) {
        assert.ok(sole.getWorldPosition(new Vector3()).distanceTo(planted) < .009, 'left shoe stays planted')
        samples.forEach((sample, side) => {
          assert.ok(sample.panelHeight - initial[side].panelHeight > .046, 'the gripped cloth rises relative to the hips')
          assert.ok(sample.hemHeight - initial[side].hemHeight > .10, 'the hem below the hand lifts with the fold')
          assert.ok(sample.width - initial[side].width > .03, 'both panels spread out')
        })
      }
      if (age === 3) {
        samples.forEach((sample, side) => {
          assert.ok(Math.abs(sample.hemHeight - initial[side].hemHeight) < .012, 'the skirt settles')
          assert.ok(sample.padSeparation > .035 && sample.indexDistance > .06, 'hands release the cloth')
        })
      }
    }
  } finally {
    figure.dispose()
  }
})
