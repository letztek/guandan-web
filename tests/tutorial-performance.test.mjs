import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {Box3,Quaternion,Ray,Texture,Triangle,Vector3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {partners} from '../src/partner-roster.ts'
import {createTutorialPerformance} from '../src/tutorial-performance.ts'
import {disposeFigure} from '../src/standing-rig.ts'

// Find actual palm skin and fingertips in the bind pose, then follow the
// same vertices as they deform. The wrist bone ends short of the contact area.
function sampleHand(group,side) {
  const wrist=group.getObjectByName('hand_'+side)
  const fingers=['index','middle','ring','little']
  const digits=[...fingers,'thumb']
  const bone=(finger,joint)=>group.getObjectByName(finger+'_'+joint+'_'+side)
  const knuckles=fingers.map(finger=>wrist.worldToLocal(bone(finger,'proximal').getWorldPosition(new Vector3())))
  const length=knuckles.reduce((sum,v)=>sum+v.x,0)/knuckles.length
  const fingerAxes=digits.map(finger=>{
    const local=joint=>wrist.worldToLocal(bone(finger,joint).getWorldPosition(new Vector3()))
    return local('distal').sub(local('proximal')).normalize()
  })
  const palm=[], tips=[]
  function posed(vertex) {
    const point=vertex.mesh.getVertexPosition(vertex.index,new Vector3())
    return group.worldToLocal(vertex.mesh.localToWorld(point))
  }
  group.traverse(mesh=>{
    if (!mesh.isSkinnedMesh) return
    const bones=mesh.skeleton.bones, handIndex=bones.indexOf(wrist)
    if (handIndex<0) return
    const ends=digits.map(finger=>bones.indexOf(bone(finger,'distal')))
    const weights=mesh.geometry.attributes.skinWeight, joints=mesh.geometry.attributes.skinIndex
    for (let index=0;index<joints.count;index++) {
      for (let slot=0;slot<4;slot++) {
        if (weights.getComponent(index,slot)<.5) continue
        const joint=joints.getComponent(index,slot), finger=ends.indexOf(joint)
        if (joint!==handIndex && finger<0) continue
        const local=wrist.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(index,new Vector3())))
        const u=local.x/length
        if (finger>=0) {
          const reach=local.dot(fingerAxes[finger])
          if (!tips[finger] || reach>tips[finger].reach) tips[finger]={mesh,index,reach}
        } else {
          const v=(local.z-knuckles[0].z)/(knuckles[3].z-knuckles[0].z)
          if (u>.33 && u<.82 && v>.12 && v<.88) palm.push({mesh,index,height:local.y})
        }
      }
    }
  })
  // +Y on these hand bones is the back of the hand. Take the palmar
  // surface between the wrist and knuckles, excluding cuffs and fingers.
  palm.sort((a,b)=>a.height-b.height)
  const patch=palm.slice(0,Math.ceil(palm.length*.28))
  assert.ok(patch.length>=3 && tips.filter(Boolean).length===digits.length,'hand mesh landmarks are available')
  return ()=>{
    const pad=patch.map(posed)
    const center=pad.reduce((sum,p)=>sum.add(p),new Vector3()).multiplyScalar(1/pad.length)
    const back=new Vector3(0,1,0).applyQuaternion(wrist.getWorldQuaternion(new Quaternion()))
      .applyQuaternion(group.getWorldQuaternion(new Quaternion()).invert())
    return {center,back,tips:tips.map(posed)}
  }
}

// Include the whole rendered hand and wrist costume. A separation between
// the wrist bones still allows thumbs, gloved knuckles, or cuffs to intersect.
function handSurface(group,side) {
  const parts=[],triangles=[]
  const finger=/^(index|middle|ring|little|thumb)_/
  group.traverse(mesh=>{
    if (!mesh.isSkinnedMesh) return
    const geometry=mesh.geometry, weights=geometry.attributes.skinWeight, joints=geometry.attributes.skinIndex
    const region=Array.from({length:weights.count},(_,i)=>{
      let strongest=0
      for (let k=1;k<4;k++) if (weights.getComponent(i,k)>weights.getComponent(i,strongest)) strongest=k
      const name=mesh.skeleton.bones[joints.getComponent(i,strongest)].name
      if (name.endsWith('_'+side) && finger.test(name)) return 'digit'
      if (name==='hand_'+side) return 'palm'
      if (name==='lower_arm_'+side || name.startsWith('Sleeve'+side+'_') || name.startsWith('Sleeve_'+side+'_')) return 'sleeve'
      return null
    })
    const points=new Map()
    for (let i=0;i<geometry.index.count;i+=3) {
      const indices=[0,1,2].map(j=>geometry.index.getX(i+j))
      if (indices.every(index=>!region[index])) continue
      const corners=indices.map(index=>{
        if (!points.has(index)) points.set(index,new Vector3())
        return points.get(index)
      })
      triangles.push({face:new Triangle(...corners),box:new Box3(),material:mesh.material.name,
        digit:indices.every(index=>region[index]==='digit'),sleeve:indices.every(index=>region[index]==='sleeve')})
    }
    if (points.size) parts.push({mesh,points})
  })
  function update(){
    for (const {mesh,points} of parts) for (const [index,point] of points) mesh.getVertexPosition(index,point).applyMatrix4(mesh.matrixWorld)
    for (const {face,box} of triangles) box.setFromPoints([face.a,face.b,face.c])
  }
  update()
  // Build the spatial hierarchy once. Each new pose only refits its bounds.
  function build(items) {
    const box=new Box3()
    for (const item of items) box.union(item.box)
    if (items.length<=8) return {box,items}
    const size=box.getSize(new Vector3()), axis=size.x>size.y && size.x>size.z?'x':size.y>size.z?'y':'z'
    items.sort((a,b)=>(a.box.min[axis]+a.box.max[axis])-(b.box.min[axis]+b.box.max[axis]))
    const mid=Math.floor(items.length/2)
    return {box,children:[build(items.slice(0,mid)),build(items.slice(mid))],size:items.length}
  }
  const tree=build(triangles)
  function refit(node) {
    node.box.makeEmpty()
    if (node.items) for (const tri of node.items) node.box.union(tri.box)
    else for (const child of node.children) node.box.union(refit(child))
    return node.box
  }
  return ()=>{update();refit(tree);return tree}
}

function checkSurfaceContact(left,right,age,actor) {
  const reach=.003,ray=new Ray(),hit=new Vector3(),expanded=new Box3()
  const chest=actor.group.getObjectByName('chest').getWorldPosition(new Vector3())
  const forward=new Vector3(0,0,1).applyQuaternion(actor.group.getWorldQuaternion(new Quaternion()))
  const wrists=['L','R'].map(side=>{
    const wrist=actor.group.getObjectByName('hand_'+side).getWorldPosition(new Vector3())
    const tip=actor.group.getObjectByName('middle_distal_'+side).getWorldPosition(new Vector3())
    return {wrist,reach:wrist.distanceTo(tip)}
  })
  function crosses(a,b) {
    for (const [p,q] of [[a.a,a.b],[a.b,a.c],[a.c,a.a]]) {
      ray.origin.copy(p)
      const length=ray.direction.subVectors(q,p).length()
      if (!length) continue
      ray.direction.multiplyScalar(1/length)
      if (ray.intersectTriangle(b.a,b.b,b.c,false,hit)) {
        const distance=hit.distanceTo(p)
        if (distance>.000001 && distance<length-.000001) return true
      }
    }
    return false
  }
  const nearFace=(a,b)=>[a.a,a.b,a.c].some(p=>b.closestPointToPoint(p,hit).distanceToSquared(p)<=reach*reach)
  function nearEdges(a,b) {
    for (const [p,q] of [[a.a,a.b],[a.b,a.c],[a.c,a.a]]) {
      ray.origin.copy(p)
      const length=ray.direction.subVectors(q,p).length()
      if (!length) continue
      ray.direction.multiplyScalar(1/length)
      for (const [v,w] of [[b.a,b.b],[b.b,b.c],[b.c,b.a]]) {
        if (ray.distanceSqToSegment(v,w,hit)<=reach*reach && hit.distanceToSquared(p)<=length*length) return true
      }
    }
    return false
  }
  let fingersTogether=false
  function visit(A,B) {
    if (!expanded.copy(A.box).expandByScalar(reach).intersectsBox(B.box)) return
    if (A.children && (!B.children || A.size>B.size)) {
      for (const child of A.children) visit(child,B)
    } else if (B.children) {
      for (const child of B.children) visit(A,child)
    } else for (const a of A.items) for (const b of B.items) {
      if (!expanded.copy(a.box).expandByScalar(reach).intersectsBox(b.box)) continue
      if (a.box.intersectsBox(b.box) && (crosses(a.face,b.face) || crosses(b.face,a.face))) {
        // Hana's hanging hem overlaps at its authored seam behind the torso,
        // far from both cuffs, even at rest. The fronts and wrists stay in scope.
        const behindChest=hit.dot(forward)<chest.dot(forward)
        const rearHem=a.sleeve && b.sleeve && a.material==='Material_body_sleeves__SampleA' && b.material===a.material
        if (rearHem && behindChest && wrists.every(({wrist,reach})=>wrist.distanceTo(hit)>reach)) continue
        const depth=hit.dot(forward)-chest.dot(forward)
        assert.fail(a.material+' crosses '+b.material+' at '+age.toFixed(3)+'s; chest depth '+depth.toFixed(3)+
          ', wrists '+wrists.map(({wrist,reach})=>wrist.distanceTo(hit).toFixed(3)+'/'+reach.toFixed(3)).join(', ')+', both sleeve '+(a.sleeve && b.sleeve))
      }
      if (!fingersTogether && a.digit && b.digit) {
        fingersTogether=nearFace(a.face,b.face)||nearFace(b.face,a.face)||nearEdges(a.face,b.face)
      }
    }
  }
  visit(left,right)
  return fingersTogether
}

function checkJoinedHands(actor,state,hands,weight) {
  const local=name=>actor.group.worldToLocal(actor.group.getObjectByName(name).getWorldPosition(new Vector3()))
  const surfaces=['L','R'].map(side=>handSurface(actor.group,side))
  function checkCheekPose(left,right) {
    const center=left.center.clone().lerp(right.center,.5), chest=local('chest')
    assert.ok(Math.abs(center.x-chest.x)>.08,'the joined palms sit clearly to one side of the chest')
    assert.ok(center.y>chest.y+.10 && center.y<local('eye_L').y-.04,'both hands rest between the chest and eyes')
    for (const hand of [left,right]) {
      assert.ok(hand.tips[1].y>hand.center.y+.045,'the middle fingertips point up alongside the cheek')
    }
  }
  function frame(time,age,still) {
    actor.pose(time,age,{...state,mood:'success'},'left',still)
    actor.group.updateMatrixWorld(true)
    const left=hands[0](), right=hands[1]()
    for (let i=0;i<left.tips.length;i++) {
      assert.ok(left.tips[i].x-right.tips[i].x>=-.003,'fingertips must stay on their own side at '+age.toFixed(3)+'s')
    }
    assert.ok(left.center.x>=right.center.x-.003,'the palm pads must not pass through each other')
    const touching=checkSurfaceContact(surfaces[0](),surfaces[1](),age,actor)
    return {left,right,joined:touching && left.back.dot(right.back)<-.65}
  }
  const fps=60
  let firstTouch=-1, lastTouch=-1, smileAt=-1, reunited=false
  for (let i=0;i<fps;i++) actor.pose(6+i/fps,i/fps,state,'left',false)
  for (let i=0;i<=4*fps;i++) {
    const {left,right,joined}=frame(7+i/fps,i/fps,false)
    if (smileAt<0 && weight('EA_happy_mouth')>.28 && weight('EA_happy_eye')>.12 && weight('EA_brow_happy')>.24) smileAt=i
    if (joined) {
      checkCheekPose(left,right)
      if (firstTouch<0) firstTouch=i
      if (lastTouch>=0 && i>lastTouch+1) reunited=true
      lastTouch=i
    }
  }
  assert.ok(firstTouch>0 && smileAt>=0 && smileAt<firstTouch,'a happy expression appears before the palms meet')
  assert.ok(lastTouch-firstTouch>=.70*fps && !reunited,
    'the palms meet once and stay together for a readable hold (frames '+firstTouch+' to '+lastTouch+', rejoined='+reunited+')')
  assert.ok(lastTouch<4*fps && hands[0]().center.distanceTo(hands[1]().center)>.10,'both hands release after the hold')
  const still=frame(11.1,.5,true), held=frame(11.2,4,true)
  assert.ok(still.joined,'reduced motion shows the joined hands')
  checkCheekPose(still.left,still.right)
  assert.ok(still.left.center.distanceTo(held.left.center)<.00001 && still.right.center.distanceTo(held.right.center)<.00001,
    'reduced motion holds one uncrossed success pose')

  // A new dialogue line resets the renderer's cue age even mid-gesture.
  actor.pose(12,0,state,'left',true)
  const midHold=Math.floor((firstTouch+lastTouch)/2)
  for (let i=0;i<=midHold;i++) actor.pose(12+i/fps,i/fps,{...state,mood:'success'},'left',false)
  actor.group.updateMatrixWorld(true)
  const before=hands.map(sample=>sample().center)
  actor.pose(12+(midHold+1)/fps,0,{...state,cue:1},'left',false)
  actor.group.updateMatrixWorld(true)
  for (const [i,sample] of hands.entries()) {
    const travel=sample().center.distanceTo(before[i])
    assert.ok(travel<.08,'advancing mid-hold must not snap the hands away from the cheek ('+travel.toFixed(3)+'m)')
  }
  for (let i=0;i<fps;i++) {
    actor.pose(12+(midHold+1+i)/fps,i/fps,{...state,cue:1},'left',false)
    actor.group.updateMatrixWorld(true)
    checkSurfaceContact(surfaces[0](),surfaces[1](),i/fps,actor)
  }
}

for (const partner of partners) test(partner.name+' reacts to the lesson with hands, head and authored expressions',async()=>{
  const raw=await readFile(new URL('../public/'+partner.model,import.meta.url))
  const loader=new GLTFLoader().register(()=>({name:'test-joints',loadTexture:()=>Promise.resolve(new Texture())}))
  const gltf=await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')
  const actor=createTutorialPerformance(gltf.scene,partner.id)
  const point=name=>actor.group.getObjectByName(name).getWorldPosition(new Vector3())
  let face
  actor.group.traverse(node=>{if(node.morphTargetDictionary?.EA_happy_mouth!==undefined)face=node})
  const weight=name=>face.morphTargetInfluences[face.morphTargetDictionary[name]]
  const state={left:partner.id,right:'athena',speaker:'left',mood:'explain',cue:0}
  function pose(time,mood,still=false,speaker='left'){
    actor.pose(time,time,{...state,mood,speaker},'left',still)
    actor.group.updateMatrixWorld(true)
  }
  try {
    const hands=['L','R'].map(side=>sampleHand(actor.group,side))
    pose(0,'explain',true)
    const presenting=point('hand_L')
    pose(1,'wrong',true)
    const warning=point('hand_L')
    assert.ok(warning.y>presenting.y+.09,'calming palm rises above the invitation')
    assert.ok(weight('EA_brow_sad')>.3)
    pose(2,'clue',true)
    assert.ok(point('hand_L').y<warning.y-.22,'hint directs attention down to the cards')
    actor.pose(2,1,{...state,speaker:'right',mood:'clue'},'right',true)
    assert.ok(point('index_distal_R').y < point('index_proximal_R').y-.025,
      'the right panel speaker points her inner index finger down toward the rack')
    pose(3,'success',true)
    assert.ok(weight('EA_brow_sad')<.01 && weight('EA_happy_mouth')>.32)
    const stillHand=point('hand_R')
    pose(5,'success',true)
    assert.ok(point('hand_R').distanceTo(stillHand)<.00001,'reduced motion holds a single expressive pose')
    pose(6,'explain',true,'right')
    assert.ok(point('hand_L').distanceTo(presenting)>.17,'listening hand is at ease')
    checkJoinedHands(actor,state,hands,weight)
    for(const vowel of ['aa','ih','ou','ee','oh']) assert.equal(weight('EA_'+vowel),0)
    // Check both a moving gesture and the static reduced-motion pose on the
    // two exported sleeve rigs. Athena's forearm has no loose fabric bones.
    if (partner.id!=='athena') {
      for (const [panel,side] of [['left','L'],['right','R']]) {
        const start=panel==='left'?16:18
        const edges=partner.id==='hanakomachi' ? ['In','Mid','Out'].map(edge=>'Sleeve'+side+'_'+edge+'_') : ['Sleeve_'+side+'_']
        const explain={...state,speaker:panel,mood:'explain'}
        for(let frame=0;frame<=34;frame++) actor.pose(start+frame/30,frame/30,explain,panel,false)
        for (const still of [false,true]) {
          if (still) actor.pose(start+1.5,1.1,explain,panel,true)
          actor.group.updateMatrixWorld(true)
          const forearm=actor.group.getObjectByName('lower_arm_'+side)
          const cuffUp=new Vector3(0,1,0).applyQuaternion(forearm.getWorldQuaternion(new Quaternion()))
          assert.ok(cuffUp.y>.05,'the bound top of the cuff must not roll under the extended hand')
          for (const edge of edges) {
            const root=point(edge+'1')
            const first=point(edge+'2').sub(root).normalize()
            const hem=point(edge+(partner.id==='hanakomachi'?'end':'3_CharakitEnd')).sub(root).normalize()
            assert.ok(first.y<-.86 && hem.y<-.92,edge+' should hang below its attachment at the elbow')
          }
        }
      }
    }
  }finally{disposeFigure(actor.group)}
})
