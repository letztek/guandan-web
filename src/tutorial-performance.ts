import * as THREE from 'three'
import { makeArm } from './athena-arm.ts'
import { makePreviewCloth } from './partner-cloth.ts'
import type { PartnerId } from './partner-roster.ts'
import { standingRig } from './standing-rig.ts'

export type TutorialMood = 'explain' | 'clue' | 'wrong' | 'correct' | 'success'
export type TutorialSide = 'left' | 'right'
export type TutorialCast = {left:PartnerId; right:PartnerId; speaker:TutorialSide; mood:TutorialMood; cue:string|number}

const smooth = THREE.MathUtils.smoothstep
const moods: TutorialMood[] = ['explain','clue','wrong','correct','success']
function pulse(t:number,start:number,peak:number,finish:number) {
  return smooth(t,start,peak) * (1-smooth(t,peak,finish))
}

// Positions are metres in the standing figure's local space. The finger
// slope brings the pads together above the different glove and cuff widths.
const joyStyles = {
  hanakomachi:     {side:1,  width:.174, height:.17, halfWidth:.055, angle:.281, join:.71, release:2.08, tilt:.14},
  'high-waitress': {side:1,  width:.177, height:.163, halfWidth:.055, angle:.374, join:.82, release:2.35, tilt:.105},
  athena:          {side:-1, width:.174, height:.165, halfWidth:.052, angle:.252, join:.74, release:2.20, tilt:.115},
} satisfies Record<PartnerId, {side:number;width:number;height:number;halfWidth:number;angle:number;join:number;release:number;tilt:number}>

// Uncurl the fingers from this rig's relaxed grip so the palms can rest together.
function openHand(joints:Map<string,THREE.Bone>, side:'L'|'R') {
  const wrist = joints.get('hand_'+side)!
  const sign = side==='L'?1:-1
  const digits = ['index','middle','ring','little','thumb'].map(name=>{
    const bones=['proximal','intermediate','distal'].map(part=>joints.get(name+'_'+part+'_'+side)!)
    const base=wrist.worldToLocal(bones[0].getWorldPosition(new THREE.Vector3()))
    const along=wrist.worldToLocal(bones[2].getWorldPosition(new THREE.Vector3())).sub(base)
    const open=Math.atan2(-along.y,Math.abs(along.x))+(name==='thumb'?.22:.035)
    return {bones,angle:sign*open}
  })
  return (weight:number)=>{
    for(const {bones,angle} of digits) {
      for(let i=0;i<bones.length;i++) {
        const r=bones[i].rotation
        r.z=THREE.MathUtils.lerp(r.z,i===0?angle:0,weight)
        r.y*=1-weight
      }
    }
  }
}

export function createTutorialPerformance(rig: THREE.Group, id: PartnerId) {
  const joints = new Map<string,THREE.Bone>()
  const faces: {slots:Record<string,number>; weights:number[]}[] = []
  rig.traverse(node=>{
    if (node instanceof THREE.Bone) joints.set(node.name,node)
    if (!(node instanceof THREE.SkinnedMesh)) return
    node.frustumCulled = false
    if (node.morphTargetInfluences && node.morphTargetDictionary) {
      faces.push({slots:node.morphTargetDictionary,weights:node.morphTargetInfluences})
    }
  })
  const group = standingRig(rig)
  const cloth = makePreviewCloth(group,'gravity')
  const hasLooseSleeves = joints.has('SleeveL_Mid_1') || joints.has('Sleeve_L_1')
  const chest = joints.get('chest')!, spine = joints.get('spine')!, neck = joints.get('neck')!, head = joints.get('head')!
  const chestAt = new THREE.Vector3()
  const palm = new THREE.Vector3(), fingers = new THREE.Vector3(), target = new THREE.Vector3(), pole = new THREE.Vector3()
  const together = new THREE.Vector3()
  const style = joyStyles[id]
  const handBack = new THREE.Vector3(.92,-style.side*.06,style.side*.38).normalize()
  const handUp = new THREE.Vector3(style.side*.01,.98,.15).normalize()
  const handDepth = new THREE.Vector3().crossVectors(handBack,handUp).normalize()
  const arms = (['L','R'] as const).map(side=>({
    sign:side==='L'?1:-1,
    // Share forearm roll with the palm. The hand can open to signal a pause
    // without forcing all of its rotation through the wrist.
    solve:makeArm(group,joints,side,true,.45),
    open:openHand(joints,side),
    index:['proximal','intermediate','distal'].map(part=>joints.get('index_'+part+'_'+side)!),
  }))
  const mix = {explain:0,clue:0,wrong:0,correct:0,success:0}
  const offset = id==='athena'?2.9:id==='high-waitress'?1.55:0
  let listening = 0, listenerSmile = 0, listenerConcern = 0
  let last = -Infinity
  let joyStart = -Infinity

  function pose(time:number,age:number,state:TutorialCast,side:TutorialSide,still:boolean) {
    const talking = side===state.speaker
    const direction = side==='left'?1:-1
    const dt = Math.max(0,time-last)
    // Allow the wrists to disengage before blending into the next cue.
    const rate = talking && state.mood==='success' ? 9 : 9-3*mix.success
    const step = still || !Number.isFinite(last) ? 1 : 1-Math.exp(-Math.min(dt,.15)*rate)
    last = time
    for (const mood of moods) {
      const weight = talking && state.mood===mood ? 1 : 0
      mix[mood] += (weight-mix[mood])*step
    }
    const listenTo = (amount:number,target:number)=>amount+(target-amount)*step
    listening = listenTo(listening,talking?0:1)
    listenerSmile = listenTo(listenerSmile,!talking && (state.mood==='success' || state.mood==='correct')?1:0)
    listenerConcern = listenTo(listenerConcern,!talking && state.mood==='wrong'?1:0)
    const t = still ? 1.1 : age
    const breath = still ? 0 : Math.sin(time*1.43+offset)
    const sway = still ? 0 : Math.sin(time*.73+offset)
    const nod = pulse(t,.18,.53,.90) + .65*pulse(t,1.04,1.32,1.65)
    const shake = still ? 0 : Math.sin((t-.2)*7.6)*smooth(t,.12,.36)*(1-smooth(t,1.55,2.0))
    const present = .73+.27*pulse(t,.18,1.03,2.51)
    const thoughtful = .85+.15*pulse(t,.34,1.16,2.36)
    // Finishing or interrupting a line can reset its age. Keep the existing
    // hand trajectory while the actor eases into the next line.
    if (talking && state.mood==='success') joyStart=time-age
    const joyAge = still ? style.join+.4 : time-joyStart
    const nearHand = mix.success*smooth(joyAge,.08,style.join-.10)*(1-smooth(joyAge,style.release+.12,style.release+.88))
    const farHand = mix.success*smooth(joyAge,.16,style.join)*(1-smooth(joyAge,style.release,style.release+.68))
    const lean = mix.success*smooth(joyAge,.20,style.join+.22)*(1-smooth(joyAge,style.release+.18,style.release+1.0))
    const happy = mix.success + mix.correct*.8 + listenerSmile*.49
    const concern = mix.wrong + listenerConcern*.31

    // The shoulders turn into the conversation; the speaker still addresses the player.
    group.rotation.y = direction*(.13+.13*listening)
    spine.rotation.set(.014+.014*breath+.062*mix.clue+.063*mix.wrong,-direction*.046*mix.explain,.01*sway)
    chest.rotation.set(-.014+.009*breath-.026*lean+.041*mix.correct*nod,
      direction*(.05*listening+.092*mix.explain-.055*mix.wrong)+style.side*.085*lean,
      -direction*.034*mix.clue-style.side*.025*lean)
    neck.rotation.set(.019+.052*mix.clue+.035*mix.correct*nod,-direction*.035,-style.side*.028*lean)
    head.rotation.set(-.018+.015*breath+.13*mix.clue+.15*mix.correct*nod+.14*listenerSmile*nod+.032*lean,
      direction*(.11*listening-.17*mix.wrong*shake-.07*mix.explain),
      direction*(.045*listening+.14*mix.wrong+.102*mix.clue)+sway*.018-style.side*style.tilt*lean)
    group.worldToLocal(chest.getWorldPosition(chestAt))

    for (const arm of arms) {
      const s = arm.sign
      const near = s===style.side
      const join = near ? nearHand : farHand
      // Use the hand on the inner edge of each panel to present the exercise.
      const inner = s===direction
      const explain = inner ? mix.explain*present : 0
      const clue = inner ? mix.clue*thoughtful : 0
      const pause = inner ? mix.wrong : 0
      const affirm = inner ? mix.correct : 0
      const other = inner ? 0 : mix.explain*.38+mix.clue*.57+mix.wrong*.44+mix.correct*.9
      // A palm offered to the player, a low index pointing towards the cards,
      // an upright calming hand, and a hand to the heart.
      const width = .235+.133*explain+.038*clue+.017*pause-.134*affirm-.106*other-.025*listenerSmile
      const lift = -.255+.20*explain-.022*clue+.31*pause+.31*affirm+.19*other+.021*listenerSmile
      const reach = .108+.165*explain+.135*clue+.133*pause+.095*affirm+.13*other
      target.set(chestAt.x+s*width,chestAt.y+lift+.008*breath,chestAt.z+reach)
      pole.set(s*.64,-.85,-.18)
      fingers.set(s*(-.25+1.18*explain+.61*clue+.34*pause-.34*affirm-.24*other),
        -.94+.98*explain+.36*clue+1.87*pause+1.75*affirm+1.47*other,
        .21+.32*explain+.73*clue-.26*pause-.32*affirm)
      palm.set(s*(.76-.66*explain-.40*clue-.68*pause-.53*affirm-.25*other),
        .05-.96*explain+.71*clue,
        .49-.51*explain-.22*clue-1.38*pause+.39*affirm)
      // Turn a sleeved forearm only partway as the palm opens. The top of
      // these cuffs is skinned to the forearm, above their free fabric bones.
      if (hasLooseSleeves) {
        palm.x += s*.52*explain
        palm.y += .72*explain
        palm.z += .85*explain
      }
      if (join>.0001) {
        // Let the finger pads meet at the top of a shallow V. Stagger the
        // wrists so the two cuffs have room under the hands.
        together.set(chestAt.x+style.side*(style.width+.003*sway),
          chestAt.y+style.height+.005*breath,chestAt.z+.205+.004*breath)
          .addScaledVector(handBack,s*style.halfWidth).addScaledVector(handUp,s*.005)
          .addScaledVector(handDepth,s*.008)
        target.lerp(together,join)
        // When a line interrupts the hold, disengage the fingers before
        // turning either wrist towards the chest or the cards.
        target.addScaledVector(handBack,s*.16*join*(1-mix.success))
        // Pass Athena's ponytails early, then close the last few centimetres
        // along the same direct path when the finger pads approach.
        const forwardArc = id==='athena' ? .12+.20*(1-smooth(join,.45,.78)) : .12
        target.z+=forwardArc*join*(1-join)
        fingers.lerp(together.copy(handUp).addScaledVector(handBack,-s*style.angle).normalize(),join)
        palm.lerp(together.copy(handBack).multiplyScalar(s),join)
        pole.lerp(together.set(s*1.65,-.72,-.35),join)
      }
      const grip = .13+.35*clue+.08*affirm-.09*explain-.10*pause-.12*join
      arm.solve(1,target,pole,fingers,palm,grip,.039+.027*pause,.45+.55*join)
      if (join>.0001) arm.open(join)
      if (clue>.001) {
        for (const joint of arm.index) joint.rotation.z *= 1-.94*clue
      }
    }
    const cycle = (time+offset)%4.63
    const blink = still?0:pulse(cycle,3.86,3.94,4.08)
    for (const {slots,weights} of faces) {
      const set = (name:string,value:number)=>{if (slots[name]!==undefined) weights[slots[name]]=value}
      set('gentleSmile',0)
      set('EA_blink',blink)
      set('EA_happy_mouth',.10+.30*happy+.16*mix.success+.07*mix.explain-.08*concern)
      set('EA_happy_eye',(.04+.21*happy+.11*mix.success+(id==='hanakomachi'?.15:.04)*lean)*(1-blink))
      set('EA_brow_happy',.08+.34*happy+.12*mix.success)
      set('EA_brow_sad',.40*concern)
      set('EA_sad_eye',.14*concern*(1-blink))
      set('EA_brow_relaxed',.23*mix.clue+.08*listening)
      set('EA_relaxed_eye',(.14*mix.clue+.10*mix.wrong)*(1-blink))
    }
    const raised = mix.explain+.65*mix.clue+mix.wrong+mix.correct
    cloth(time,still,(style.side<0?nearHand:farHand)+(direction<0?raised:0),
      (style.side>0?nearHand:farHand)+(direction>0?raised:0),0,Math.min(nearHand,farHand))
  }
  return {group,pose}
}
