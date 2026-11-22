import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { Quaternion, Texture, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import clip from '../src/athena-kiss-data.ts'
import { createPartnerPerformance } from '../src/partner-performance.ts'

test('the archived Athena kiss preserves the Mixamo capture and registers her glove to her lips', async () => {
  assert.equal(clip.sourceSha256, '1aa877c52dbfa01e34f5764927cdf84ad9dff04f7cb4b4676ddd96a9600d20b5')
  assert.equal(clip.frames, 138)
  assert.equal(clip.joints.length, 42)
  assert.ok(Math.abs(clip.duration - 137/30) < .00001)
  const raw = await readFile(new URL('../public/character/athena-seat.glb', import.meta.url))
  const loader = new GLTFLoader().register(() => ({name:'no-textures',loadTexture:() => Promise.resolve(new Texture())}))
  const gltf = await loader.parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset+raw.byteLength),'')
  const actor = createPartnerPerformance(gltf,2,'blow-a-kiss'), {group} = actor
  const bone = name => group.getObjectByName(name)
  const glove = bone('athena_6'), face = bone('athena_4'), head = bone('head')
  const vertex = (mesh,i) => mesh.localToWorld(mesh.getVertexPosition(i,new Vector3()))
  const feet = ['foot_L','foot_R'].map(bone)
  const hand = bone('hand_L')
  function pose(elapsed,time,reduced=false) {
    actor.pose(elapsed,time,reduced)
    group.updateMatrixWorld(true)
  }
  function checkSourceRotation(name, reference) {
    // Independently sampled from the skinless Y Bot FBX in world bind space.
    // A source quaternion and its negation represent the same rotation.
    const expected = new Quaternion().fromArray(reference).normalize()
    assert.ok(bone(name).quaternion.angleTo(expected)<.0003,name+' matches the original motion at this frame')
  }
  try {
    pose(0,null)
    const planted=feet.map(f=>f.getWorldPosition(new Vector3()))
    let near = 0, release = 0
    for(let frame=0; frame<=138; frame++){
      const time=frame/30
      pose(time,time)
      if(frame>=36 && frame<=40){
        const lip=vertex(face,3059), index=vertex(glove,201), middle=vertex(glove,1026)
        assert.ok(index.distanceTo(lip)<.019 && middle.distanceTo(lip)<.03,'genuine finger surfaces reach the mouth')
        const localTip=head.worldToLocal(index), localLip=head.worldToLocal(lip)
        assert.ok(localTip.z>localLip.z,'glove stays in front of the lip surface')
        near=localTip.z
      }
      if(frame===39)checkSourceRotation('lower_arm_R',[0,.627143,0,.778904])
      if(frame===78){
        checkSourceRotation('neck',[.098589,.018576,-.009732,.994907])
        checkSourceRotation('lower_arm_L',[0,-.451175,0,.892435])
        release=head.worldToLocal(vertex(glove,201)).z
      }
      feet.forEach((f,i)=>assert.ok(f.getWorldPosition(new Vector3()).distanceTo(planted[i])<.004,'shoes stay planted'))
    }
    assert.ok(release-near>.40,'fingertips sweep out towards the viewer after the kiss')
    pose(6,4.10)
    const last = hand.getWorldPosition(new Vector3())
    pose(6,0)
    assert.ok(hand.getWorldPosition(new Vector3()).distanceTo(last)<.0001,'late replay blends from the displayed pose')
    pose(8,null,true)
    const still=hand.getWorldPosition(new Vector3())
    pose(9,1.3,true)
    assert.ok(hand.getWorldPosition(new Vector3()).distanceTo(still)<.0001,'reduced motion keeps her still')
  } finally {actor.dispose()}
})
