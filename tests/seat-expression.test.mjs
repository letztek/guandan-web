import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createSeatCueQueue, createSeatReactions, faceKeys} from '../src/seat-reactions.ts'

for (const model of ['hanakomachi','high-waitress','athena']) {
  test(model + ' has the facial shapes used by the actual table', () => {
    const file=readFileSync(new URL('../public/character/'+model+'-seat.glb',import.meta.url))
    const gltf=JSON.parse(file.toString('utf8',20,20+file.readUInt32LE(12)))
    const required=[...faceKeys,'EA_blink']
    const authored=gltf.meshes.filter(m=>m.extras?.targetNames)
    for (const name of required) {
      assert.ok(authored.some(mesh=>{
        const slot=mesh.extras.targetNames.indexOf(name)
        return slot>=0 && mesh.primitives.some(p=>{
          const target=gltf.accessors[p.targets?.[slot]?.POSITION]
          return target?.min?.some((v,i)=>v!==0 || target.max[i]!==0)
        })
      }),model+' is missing visible geometry for '+name)
    }
  })
  test(model + ' holds attention and shakes left–right once even when looking straight ahead', () => {
    const r=createSeatReactions(model)
    const cue=(kind,lookYaw,at)=>r.react({kind,lookYaw},at,true,false)
    cue('follow',.4,0)
    assert.ok(r.sample(2000).pitch>.2,'player should hold a downwards gaze until taking an action')
    const before=r.sample(2200)
    cue('pass',0,2200)
    assert.deepEqual(r.sample(2200),before,'no discontinuity at a new cue')
    const frames=Array.from({length:241},(_,i)=>r.sample(2200+i*10))
    const yaw=frames.map(pose=>pose.yaw)
    const low=yaw.indexOf(Math.min(...yaw)), high=yaw.indexOf(Math.max(...yaw))
    assert.ok(yaw[low]<-.20 && yaw[high]>.20 && high>low)
    assert.ok(low*10>=390 && (high-low)*10>=500,'both turns should be gradual')
    assert.ok(yaw.slice(1,low+1).every((v,i)=>v<=yaw[i]+1e-8))
    assert.ok(yaw.slice(low+1,high+1).every((v,i)=>v>=yaw[low+i]-1e-8))
    assert.ok(yaw.slice(high+1).every((v,i)=>v<=yaw[high+i]+1e-8))
    assert.equal(yaw.at(-1),0)
    const full=frames.map(pose=>pose.face[faceKeys.indexOf('EA_relaxed_eye')]>=.64-1e-8)
    const holdMs=(full.lastIndexOf(true)-full.indexOf(true))*10
    assert.ok(holdMs>=1180&&holdMs<=1500,'full pass expression holds 1.2–1.5s: '+holdMs)
    cue('win',0,4000)
    const quietSmile=r.sample(4900).face[faceKeys.indexOf('EA_happy_mouth')]
    assert.ok(quietSmile>.25&&quietSmile<.5)
    cue('lose',0,6000)
    const sad=r.sample(6660)
    assert.ok(sad.face[faceKeys.indexOf('EA_sad_mouth')]>.7)
    assert.ok(sad.pitch-r.sample(8500).pitch>.12)
    assert.equal(r.blink(5000,true),0)
    r.react({kind:'pass',lookYaw:.4},9000,false,true)
    assert.equal(r.sample(9100,true).yaw,0)
    assert.ok(r.sample(9100,true).face[faceKeys.indexOf('EA_relaxed_mouth')]>.5)
  })

  test(model + ' protects a pass from ambient attention, including when motion is reduced', () => {
    for(const reduced of [false,true]){
      const r=createSeatReactions(model), queue=createSeatCueQueue(model), applied=[]
      const apply=(cue,at)=>{applied.push(cue.kind);r.react(cue,at,!reduced,reduced)}
      const show=(kind,at)=>{queue.schedule({kind,lookYaw:0},at);queue.flush(at,apply)}
      show('pass',0);show('watch',350);show('idle',600);show('watch',720)
      queue.flush(1350,apply)
      assert.deepEqual(applied,['pass'])
      assert.equal(r.sample(1350,reduced).face[faceKeys.indexOf('EA_relaxed_mouth')],.6)
      if(reduced)for(const at of [80,430,950,1350])assert.equal(r.sample(at,true).yaw,0)
      queue.flush(1800,apply)
      assert.deepEqual(applied,['pass','watch'],'only the latest ambient cue should run')
    }
    for(const action of ['lead','follow','finish','win']){
      const queue=createSeatCueQueue(model), applied=[]
      const apply=cue=>applied.push(cue.kind)
      const show=(kind,at)=>{queue.schedule({kind,lookYaw:0},at);queue.flush(at,apply)}
      show('pass',10);show('watch',300);show(action,450)
      queue.flush(2500,apply)
      assert.deepEqual(applied,['pass',action])
    }
    const queue=createSeatCueQueue(model), applied=[]
    queue.schedule({kind:'pass',lookYaw:0},0)
    queue.flush(0,cue=>applied.push(cue.kind))
    queue.schedule({kind:'watch',lookYaw:0},300)
    assert.equal(queue.interruptPass(500),true,'a card play cancels stale attention')
    queue.flush(2000,cue=>applied.push(cue.kind))
    assert.deepEqual(applied,['pass'])
  })

  test(model+' holds distinct winning and losing expressions until the next hand', () => {
    const r=createSeatReactions(model)
    const weight=(pose,name)=>pose.face[faceKeys.indexOf(name)]
    for(const still of [false,true]) {
      for(const kind of ['win','matchWin','lose','matchLose']) {
        r.reset()
        r.react({kind,lookYaw:.4},1000,!still,still)
        const held=r.sample(31000,still), won=kind==='win'||kind==='matchWin'
        if(won) {
          assert.ok(weight(held,'EA_happy_mouth')>.25&&weight(held,'EA_happy_mouth')<.5)
          assert.ok(weight(held,'EA_happy_eye')<.20&&held.lean<0)
          assert.equal(weight(held,'EA_oh'),0)
          assert.equal(weight(held,'EA_sad_eye'),0)
        } else {
          assert.equal(weight(held,'EA_sad_mouth'),1)
          assert.equal(weight(held,'EA_brow_sad'),1)
          assert.equal(weight(held,'EA_sad_eye'),1)
          assert.equal(weight(held,'EA_angry_mouth')>0,model==='high-waitress')
          assert.ok(held.lean>0&&held.pitch>0)
        }
      }
    }
    r.reset()
    assert.equal(weight(r.sample(40000),'EA_sad_mouth'),0)
    assert.equal(r.sample(40000).lean,0)
  })
}

test('the final card lands before the seat celebrates its finish and then its team result', () => {
  const queue=createSeatCueQueue('hanakomachi'), applied=[]
  const flush=now=>queue.flush(now,(cue,at)=>applied.push([cue.kind,at]))
  queue.schedule({kind:'finish',lookYaw:0},100,845)
  queue.schedule({kind:'win',lookYaw:0},100,845)
  flush(844)
  assert.deepEqual(applied,[])
  flush(1714)
  assert.deepEqual(applied,[['finish',845]])
  flush(1715)
  assert.deepEqual(applied,[['finish',845],['win',1715]])
})
