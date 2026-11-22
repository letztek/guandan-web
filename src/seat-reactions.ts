import type { ReactionKind } from './table-reactions'
import type { FezModel } from './fez-character'

export type SeatCue = { kind:ReactionKind; lookYaw:number }

// Order follows the authored face regions. Blinks replace the eye pose only.
export const faceKeys = [
  'EA_happy_eye','EA_relaxed_eye','EA_sad_eye','EA_surprised_eye',
  'EA_brow_happy','EA_brow_relaxed','EA_brow_angry','EA_brow_sad','EA_brow_surprised',
  'EA_happy_mouth','EA_relaxed_mouth','EA_sad_mouth',
  'EA_angry_mouth','EA_oh',
] as const
type Weights = number[]
type Pose = {pitch:number; yaw:number; roll:number; lean:number; face:Weights}
const styles = {
  hanakomachi: { tempo:1,   nod:1.07, turn:1,   tilt:.064, rest:.34, warmth:1,   blinkPhase:3430 },
  'high-waitress': {tempo:.92, nod:.95, turn:1.04,tilt:-.046,rest:.27, warmth:.95, blinkPhase:7940 },
  athena: {tempo:1.15, nod:.89, turn:.92,tilt:.038, rest:.18,warmth:.86, blinkPhase:11980 },
}
const passFaceIn=230, passFaceHold=1300, passFaceFade=490
const passRelease=passFaceIn+passFaceHold

/** One queue per seated character. A real turn can interrupt a pass; looking
 * at another seat waits until the shake and expression have been readable. */
export function createSeatCueQueue(model:FezModel) {
  let pending:{cue:SeatCue;at:number}[]=[]
  let hold:{kind:'finish'|'pass';until:number}|undefined
  function clear(){pending=[];hold=undefined}
  function interruptPass(now:number) {
    if(hold?.kind!=='pass')return false
    const wasActive=now<hold.until+passFaceFade*styles[model].tempo
    clear()
    return wasActive
  }
  function schedule(cue:SeatCue,now:number,earliest=now) {
    if(cue.kind!=='watch'&&cue.kind!=='idle')interruptPass(now)
    const at=Math.max(now,earliest,hold?.until??0)
    // Replace stale attention before it starts, preserving a scheduled finish.
    pending=pending.filter(entry=>entry.cue.kind==='finish'||entry.cue.kind==='pass')
    pending.push({cue,at})
    if(cue.kind==='pass')hold={kind:'pass',until:at+passRelease*styles[model].tempo}
    if(cue.kind==='finish')hold={kind:'finish',until:at+870}
  }
  function flush(now:number,apply:(cue:SeatCue,at:number)=>void) {
    while(pending.length&&now>=pending[0].at){
      const next=pending.shift()!
      if(hold&&next.at>=hold.until)hold=undefined
      apply(next.cue,next.at)
    }
  }
  return {clear,schedule,flush,interruptPass}
}
const clamp=(x:number,min=0,max=1)=>Math.max(min,Math.min(max,x))
const ease=(x:number)=>{const t=clamp(x);return t*t*(3-2*t)}
const mix=(a:number,b:number,t:number)=>a+(b-a)*t
const blend=(a:Weights,b:Weights,t:number)=>a.map((v,i)=>mix(v,b[i],t))
function face(values:Partial<Record<typeof faceKeys[number],number>>):Weights{
  return faceKeys.map(key=>values[key]??0)
}

export function createSeatReactions(model:FezModel){
  const style=styles[model],w=style.warmth
  const rest=face({EA_happy_eye:.13,EA_brow_relaxed:.29,EA_happy_mouth:style.rest})
  const focused=face({EA_relaxed_eye:.58,EA_brow_angry:.43,EA_relaxed_mouth:.64})
  const attentive=face({EA_surprised_eye:.23,EA_brow_surprised:.52,EA_relaxed_mouth:.32})
  const yielding=face({EA_relaxed_eye:.64,EA_brow_relaxed:.57,EA_relaxed_mouth:.60})
  const content=face({EA_happy_eye:.14,EA_brow_relaxed:.33,EA_happy_mouth:style.rest+.045})
  const winnerSmile=face({EA_happy_eye:.16*w,EA_brow_happy:.24*w,EA_brow_relaxed:.15,EA_happy_mouth:style.rest+.11})
  // C03's sad lip key keeps its natural upturned corners. The mouth-only
  // downturn completes her frown without changing the sad brows or eyes.
  const waitress=model==='high-waitress'
  const disappointed=face({EA_sad_eye:1,EA_brow_sad:1,EA_sad_mouth:1,
    EA_angry_mouth:waitress?.74:0,EA_oh:waitress?.10:0,EA_relaxed_eye:waitress?.23:0})
  const neutral:Pose={pitch:0,yaw:0,roll:0,lean:0,face:rest}
  let cue:SeatCue={kind:'idle',lookYaw:0},start=0,from=neutral,animate=false

  function sample(time:number,reduced=false):Pose{
    const ms=Math.max(0,time-start)/style.tempo
    const still=!animate||reduced
    const age=still?4000:ms
    const gaze=clamp(cue.lookYaw,-.48,.48)*style.turn
    let pitch=0, yaw=0, roll=0, lean=0, target=rest
    switch(cue.kind){
      case 'idle': break
      case 'watch':
        pitch=.075; yaw=gaze*.71; target=attentive
        break
      case 'lead':
        pitch=.28; yaw=.105; roll=style.tilt*.52; target=focused
        break
      case 'follow': {
        // Read the table first, then let the chin follow the eyes down to the fan.
        const hand=ease((age-220)/455)
        pitch=mix(.075,.28,hand); yaw=mix(gaze*.70,.105,hand)
        roll=style.tilt*.52*hand; target=blend(attentive,focused,hand)
        break
      }
      case 'pass': {
        const linger=1-ease((ms-passRelease)/passFaceFade)
        target=blend(rest,yielding,linger)
        if(!still){
          // A single left–right shake works even when the next seat is straight ahead.
          const bias=clamp(gaze,-.035,.035)
          const turn=mix(-.26*style.turn,.24*style.turn,ease((ms-470)/585))
          const settle=1-ease((ms-1090)/(passRelease-1090))
          yaw=(turn+bias)*settle; pitch=.064*settle; roll=style.tilt*.46*settle
        }
        break
      }
      case 'finish':
        pitch=-.11; yaw=gaze*ease((age-80)/380); roll=style.tilt
        target=content
        break
      case 'win': case 'matchWin': {
        const big=cue.kind==='matchWin'
        const nod=still?0:ease((age-350)/340)*(1-ease((age-690)/460))
        pitch=-.092+nod*(big?.16:.12); yaw=gaze*.48; roll=style.tilt
        lean=-.075
        target=winnerSmile
        break
      }
      case 'lose': case 'matchLose': {
        const recover=ease((age-(cue.kind==='matchLose'?1580:1330))/780)
        pitch=mix(.32,.16,recover); yaw=gaze*.28; roll=-style.tilt
        lean=.15
        target=disappointed
        break
      }
    }
    const faceMix=still?1:ease(ms/(cue.kind==='pass'?passFaceIn:300))
    const headMix=still?1:ease((ms-35)/400)
    const motion=reduced?.42:1
    return {pitch:mix(from.pitch,pitch*style.nod*motion,headMix),yaw:mix(from.yaw,yaw*motion,headMix),
      roll:mix(from.roll,roll*motion,headMix),lean:mix(from.lean,lean*motion,headMix),face:blend(from.face,target,faceMix)}
  }
  function blink(time:number,reduced:boolean){
    if(reduced)return 0
    // Each seat has its own phase, with uneven intervals between blinks.
    const cycle=(time+style.blinkPhase)%14590
    for(const at of [1250,6780,10530]){
      const t=cycle-at
      if(t>=0&&t<205)return t<78?ease(t/78):1-ease((t-78)/127)
    }
    return 0
  }
  return {sample,blink,reset(){cue={kind:'idle',lookYaw:0};from=neutral;animate=false},
    react(next:SeatCue,now:number,motion:boolean,reduced:boolean){
      from=sample(now,reduced);cue=next;start=now;animate=motion
    }}
}
