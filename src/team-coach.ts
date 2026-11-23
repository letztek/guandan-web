import { allMoves, beats, names, power, remaining, uid, wild, type Card, type Move } from './rules.ts'
import { samplePublicHands } from './team-worlds.ts'
import { rollout } from './team-rollout.ts'
import { controlCost, preferredFullHouses } from './control-cost.ts'
import type { Difficulty } from './difficulty.ts'
import type { PlayStyle } from './play-style.ts'
import { partnerResponse, unseenCards } from './partner-tactics.ts'
import { controlsFromPublicCards, publicFinish } from './public-finish.ts'
import { advancedHandPlanner } from './advanced-hand-plan.ts'
import type { PublicSeatHistory } from './public-behavior.ts'
import { clearlyBetter, searchLines, searchReason } from './team-search.ts'

type Face = Pick<Card,'rank'|'suit'>
// No hidden hand is part of the strategy API. shown contains only still-held
// cards disclosed by the cut or completed exchanges. played covers this deal.
export type PublicTable = {
  seat: number, counts: number[], holder: number, pending: number[], finish: number[],
  shown: Face[][], played: Face[], history?: PublicSeatHistory[]
}
function bombCost(m: Move) {
  return m.kind==='kings' ? 56 : m.kind==='flush' ? 37 : m.kind==='bomb' ? 23+3*m.cards.length : 0
}
function nextPlayers(seat: number) { return [1,2,3].map(i=>(seat+i)%4) }
// Roughly what an extra lead is worth to the side that wins a trick, on the
// same scale as shedding cards. Self-play results hardly change from 3 to 12.
const LEAD_VALUE = 6

function spendsReservedControl(move: Move, hand: Card[], level: string) {
  if (bombCost(move)) return true
  const spent = move.cards.filter(card => card.rank === level).length
  if (!spent) return false
  const held = hand.filter(card => card.rank === level).length
  return held >= 2 && held - spent < 2
}

function attachmentReason(move: Move|null, moves: Move[], hand: Card[], level: string, reason: string) {
  if (hand.filter(card=>card.rank===level).length<2 || move?.cards.length===hand.length) return reason
  const spendsLevelPair = (m: Move) => m.kind==='full' && m.cards.slice(3).every(c=>c.rank===level)
  if (!move || (move.kind!=='triple' && move.kind!=='full')) return reason
  if (spendsLevelPair(move)) return reason+' 這手會用掉一對級牌 '+level+' 作配對。'
  if (!moves.some(m=>m.value===move.value && spendsLevelPair(m)) ||
      remaining(hand,move).filter(c=>c.rank===level).length<2) return reason
  return reason + (move.kind==='full' ? ' 葫蘆只比三張的點數，這樣可以留下級牌對 '+level+'。' :
    ' 三張可以單出，留下級牌對 '+level+' 接之後的對子。')
}

function quickDecision(hand: Card[], level: string, target: Move|null, table: PublicTable, style?: PlayStyle, advanced=false) {
  const moves=allMoves(hand,level), legal=preferredFullHouses(moves.filter(m=>beats(m,target)),hand,level)
  const {seat,counts,holder,pending,finish,shown}=table
  const mate=(seat+2)%4, opponents=nextPlayers(seat).filter(s=>s!==mate && counts[s]>0)
  const reply=(move: Move|null,reason: string,settled=false)=>({advice:{move,reason,moves},settled})
  const finishers=legal.filter(m=>m.cards.length===hand.length)
  if (finishers.length) {
    // A stronger final declaration improves the chance that partner receives the wind.
    const best=finishers.reduce((a,b)=>beats(b,a)?b:a)
    const goal=finish.length===1 && finish[0]===mate?'隊友已拿頭游，這手出完就包辦頭游、二游。':
      finish.length===2 && finish[0]===mate?'隊友已拿頭游，對手已拿二游；這手出完就能替我方守住三游。':
      !finish.length?'這手能出完，直接替我方拿下頭游。':'這手能出完，直接取得本副下一個名次。'
    return reply(best,goal,true)
  }
  if (advanced && target && holder===mate && counts[mate]===0) {
    const onlyTwoActive=counts.filter(count=>count>0).length===2
    if (pending.length===1 || (onlyTwoActive && hand.length<=8 && controlsFromPublicCards(hand,level,table)(target))) {
      return reply(null,'隊友已出完，過牌就能接風，下一圈由你領出。',true)
    }
  }
  const response=style && partnerResponse(hand,level,target,table,legal,style)
  if (response && (!advanced || !response.move || !spendsReservedControl(response.move,hand,level) || response.blocksCertainExit)) {
    return reply(response.move,response.reason,true)
  }
  if (!legal.length) return reply(null,'手上沒有能壓過桌面的牌，這手過牌。',true)
  const unknown=unseenCards(hand,table)
  // Local placeholders let the rules engine distinguish two equal public faces.
  const visible=shown.map(cards=>cards.map((c,i)=>({...c,id:'visible-'+i})))
  const knownFinish=visible.map((cards,s)=>cards.length && cards.length===counts[s] && cards.length<=10 ? allMoves(cards,level,true) : null)
  // Heuristic for whether a short seat can go out over this particular play.
  // With a fully exposed hand we can instead test the actual legal declarations.
  function exitChance(s: number,m: Move) {
    if (!counts[s]) return 0
    if (knownFinish[s]) return knownFinish[s]!.some(f=>beats(f,m))?1:0
    if (m.cards.length!==counts[s] || !['single','pair','triple'].includes(m.kind)) return 0
    const exposed=visible[s].filter(c=>!wild(c,level) || m.kind==='single')
    if (exposed.some(c=>power(c.rank,level)<=m.value) || new Set(exposed.map(c=>c.rank)).size>1) return 0
    if (!unknown.length) return 0
    const n=counts[s]-shown[s].length
    if (n<=0) return 0
    const fixed=exposed[0]?.rank
    if (m.kind==='single') return unknown.filter(c=>power(c.rank,level)>m.value).length/unknown.length
    const available=unknown.filter(c=>fixed?c.rank===fixed || (wild(c,level) && !['SJ','BJ'].includes(fixed)):power(c.rank,level)>m.value || wild(c,level))
    const feasible=available.some(c=>!wild(c,level) && available.filter(x=>x.rank===c.rank || (wild(x,level) && c.suit!=='J')).length>=n) ||
      (fixed!==undefined && available.length>=n)
    if (!feasible) return 0
    return available.length/unknown.length*(fixed ? 1 : m.kind==='pair' ? .32 : .14)
  }
  const risk=(m: Move,order: number[])=>Math.max(0,...opponents.filter(s=>order.includes(s)).map(s=>exitChance(s,m)))
  const afterPlay=nextPlayers(seat).filter(s=>counts[s]>0)
  const afterPass=pending.slice(1)
  const oneCardOpponents=opponents.filter(s=>counts[s]===1)
  const singleThreat=oneCardOpponents.length?
    Math.max(0,...legal.filter(m=>m.kind==='single').flatMap(m=>oneCardOpponents.map(s=>exitChance(s,m)))) : 0
  const partnerHolds=!!target && holder===mate
  const passingRisk=target?risk(target,afterPass):0
  const passReason=counts[mate]===0?'隊友已出完且目前最大；這圈若守住，就由你接風領出。':
    '隊友目前最大；過牌保留他的領出機會，也留住手上的控牌。'
  // Don't take an ally's trick to shed cards. Reopen the trick only when doing
  // so materially reduces an opponent's immediate exit, including re-entry by
  // opponents who passed before us.
  if (partnerHolds && passingRisk<.2) return reply(null,passReason)
  const feed=(m: Move,order: number[])=>{
    if (!order.includes(mate)) return 0
    const beforeMate=order.slice(0,order.indexOf(mate))
    return exitChance(mate,m)*(1-risk(m,beforeMate))
  }
  const feedReason=(m: Move)=>{
    if (knownFinish[mate]) return '隊友的 '+counts[mate]+' 張餘牌都已公開，可以接下這手；若中途無人攔住，他就能直接走完。'
    return '隊友只剩 '+counts[mate]+' 張。'+(m.kind==='single'?'留給他用較大的單張接牌':'若餘牌能組成較大的'+names[m.kind]+'，就有機會接牌')+'，爭取讓隊友先走。'
  }
  const feedWeight=style==='support' ? 112 : 80
  const baseCounts=new Map<string,number>()
  for (const c of hand) if (!wild(c,level)) baseCounts.set(c.rank,(baseCounts.get(c.rank)??0)+1)
  const ownPlan=new Map<string,Move|null>()
  const leader=holder<0?-1:counts[holder]?holder:(holder+2)%4
  const shortLeader=!!target && opponents.includes(leader) && counts[leader]<=2
  // Only rank replies that can be proved to hold. An unseen joker or a bomb
  // that fits a live hand prevents this bonus even when both small jokers are out.
  let cheapestCover: Move | undefined
  if (shortLeader && !partnerHolds && target && counts.reduce((sum,n)=>sum+n,0)-hand.length<=20) {
    const covers=legal.filter(m=>m.kind===target.kind && !bombCost(m) && !controlCost(m,level))
    if (covers.length && legal.length>1) {
      const controls=controlsFromPublicCards(hand,level,table)
      cheapestCover=covers.sort((a,b)=>a.value-b.value).find(controls)
    }
  }
  // When a short hand or a finished partner makes the next trick decisive,
  // give the handoff/placement evaluation priority over packing our own cards.
  const handPlan=advanced && !finish.length && hand.length>5 && counts[mate]>4 &&
    opponents.every(s=>counts[s]>4) ? advancedHandPlanner(hand,level,style) : undefined
  // Passing on an opponent's trick lets their side lead again unless our
  // partner, who still acts after us, takes it back. That lead is not free.
  const opponentHolds=holder>=0 && holder%2!==seat%2
  const passCost=opponentHolds ? LEAD_VALUE*(afterPass.includes(mate) ? .5 : 1) : 0
  let best: {move: Move|null,reason: string,score: number}|undefined
  if (target) {
    const weight=feed(target,afterPass)
    best={move:null,score:partnerHolds ? 0 : feedWeight*weight-120*passingRisk-(shortLeader?52:0)-passCost,
      reason:partnerHolds?passReason:weight>.1?'過牌保留目前牌型。'+feedReason(target):
        '這圈先過，保留手牌，等下一次接手。'}
  }
  for (const m of legal) {
    const danger=risk(m,afterPlay)
    if (partnerHolds && passingRisk-danger<.2) continue
    if (advanced && partnerHolds && spendsReservedControl(m,hand,level)) continue
    const left=hand.length-m.cards.length
    const reserve=style==='balanced' ? 1.5 : 1
    const tempo=style==='attack' ? 4 : 2.8
    let score=m.cards.length*tempo-reserve*(m.value*.18+bombCost(m)+m.cards.filter(c=>wild(c,level)).length*3)-controlCost(m,level)
    const used=new Map<string,number>()
    for (const c of m.cards) if (!wild(c,level)) used.set(c.rank,(used.get(c.rank)??0)+1)
    for (const [rank,n] of used) {
      const total=baseCounts.get(rank)!
      if (n<total) score-=reserve*(total>=4 && total-n<4 ? 21 : total>=2 ? 3 : 0)
    }
    let reason=target?'用這手壓過桌面，出完剩 '+left+' 張。':'先領出'+names[m.kind]+'，手牌減到 '+left+' 張。'
    let reasonWeight=0
    const feature=(points: number,explanation: string)=>{
      score+=points
      if (points>reasonWeight) {reason=explanation;reasonWeight=points}
    }
    if (handPlan) {
      const plan=handPlan(m,!!target)
      feature(plan.score,'這手打出後，餘牌可安排成 '+plan.turns+' 手。')
    }
    if (m===cheapestCover) feature(15,'依已出牌、明牌與餘張，這手就能守住牌權。')
    if (left<=10) {
      const key=m.cards.map(uid).sort().join(',')
      if (!ownPlan.has(key)) ownPlan.set(key,allMoves(remaining(hand,m),level,true)[0]??null)
      const next=ownPlan.get(key)
      if (next) feature(style==='attack' ? 38 : 27,'出完保留'+names[next.kind]+' '+next.label+'，下次領出即可整手出完。')
    }
    // A fresh lead or a raise gives every active opponent another opportunity.
    score-=120*danger
    const partnerExit=feed(m,afterPlay)
    if (partnerExit) feature(feedWeight*partnerExit,feedReason(m))
    if (partnerHolds) {
      score+=120*passingRisk
      reason='隊友目前最大，但後面有對手可能一手走完。'+(danger===0?'改出這手能攔住這次收牌。':'提高門檻，降低對手這次走完的機會。')
    } else {
      if (shortLeader) feature(13,'若讓對方收圈，只剩 '+counts[leader]+' 張的對手就能領出；先壓住桌面爭回牌權。')
      // Explain the same risk difference that favored this response or lead
      // over an available lower single, including when a high single is best.
      if (singleThreat-danger>.12 && (singleThreat-danger)*120>reasonWeight) {
        reason=m.kind==='single'?'對手只剩一張。出較大的單張，提高他直接走完的門檻。':
          '對手只剩一張。'+(target?'改出':'領出')+names[m.kind]+'，他無法在這手跟單走完。'
      }
    }
    if (!best || score>best.score) best={move:m,reason,score}
  }
  if (handPlan && best?.move && opponents.every(s=>counts[s]>10) && !best.reason.includes('餘牌可安排成')) {
    best.reason+='這手打出後，餘牌可安排成 '+handPlan(best.move).turns+' 手。'
  }
  return reply(best!.move,attachmentReason(best!.move,moves,hand,level,best!.reason))
}

export function quickTeamSuggestion(hand: Card[], level: string, target: Move|null, table: PublicTable, style?: PlayStyle, advanced=false) {
  return quickDecision(hand,level,target,table,style,advanced).advice
}

// Compare the same possible deals for every candidate so differences reflect
// our choice, rather than one action receiving luckier hidden cards.
function candidatePlays(legal: Move[], baseline: Move|null, target: Move|null) {
  const choices = new Set<Move|null>([baseline])
  if (target) choices.add(null)
  if (legal.length <= 10) return [...new Set([...choices, ...legal])]
  const byValue = [...legal].sort((a,b) => a.value-b.value)
  const add = (m?: Move) => { if (m) choices.add(m) }
  for (const kind of new Set([target?.kind, 'single', 'pair'])) {
    const group = byValue.filter(m => m.kind === kind)
    add(group[0])
    add(group.at(-1))
    if (kind === 'single' && group.length > 2) add(group[Math.floor(group.length/2)])
  }
  const controls = legal.filter(m => bombCost(m)>0).sort((a,b) => beats(a,b)?1:beats(b,a)?-1:0)
  add(controls[0])
  add(controls.at(-1))
  const bySize = [...legal].sort((a,b) => b.cards.length-a.cards.length || a.value-b.value)
  for (const m of bySize) {
    if (choices.size >= 12) break
    if (![...choices].some(c => c?.kind === m.kind)) add(m)
  }
  return [...choices]
}

function projectChoice(worlds: Card[][][], level: string, target: Move|null, table: PublicTable,
  move: Move|null, cache: Map<string,Move[]>, watchTen: boolean, advanced: boolean) {
  let score = 0, rootOut = 0, mateOut = 0, matePlays = 0, enemyFirst = 0, enemyClose = 0
  let teamFirst = 0, teamDouble = 0, enemyDouble = 0, teamThird = 0
  const nextLeads = new Map<string,number>()
  for (const hands of worlds) {
    const line = rollout(hands, level, target, table, move, cache, watchTen, advanced)
    score += line.score
    mateOut += line.mateOut
    rootOut += line.rootOut
    if (line.nextRootLead) {
      const next = names[line.nextRootLead.kind]+' '+line.nextRootLead.label
      nextLeads.set(next,(nextLeads.get(next)??0)+1)
    }
    matePlays += line.matePlays
    enemyFirst += line.enemyFirst
    teamFirst += line.teamFirst
    teamDouble += line.teamDouble
    enemyDouble += line.enemyDouble
    teamThird += line.teamThird
    enemyClose += line.enemyFirst || line.enemyReady
  }
  const repeatedLead = [...nextLeads].find(([,n])=>n>worlds.length/2)?.[0]
  return {move, score:score/worlds.length-(move?controlCost(move,level):0), rootOut, mateOut, matePlays, enemyFirst, enemyClose, teamFirst, teamDouble, enemyDouble, teamThird, repeatedLead}
}
type Projection = ReturnType<typeof projectChoice>

// A speculative extra lead cannot, by itself, pay for bombing a partner.
// Compare actual places reached in the same deals, against leaving the lead alone.
function earnsCostlyRaise(p: Projection, pass: Projection, cheaper: Projection[], table: PublicTable,
    target: Move, hand: Card[], level: string, samples: number) {
  const responders=table.pending.slice(1).filter(seat=>seat%2!==table.seat%2)
  if (!responders.length) return false
  const urgent=responders.some(seat=>table.counts[seat]<=4 || table.counts[seat]===target.cards.length ||
    table.shown[seat].length===table.counts[seat])
  if (!urgent) {
    const left=remaining(hand,p.move!)
    if (left.length>10 || !allMoves(left,level,true).length) return false
  }
  if (cheaper.some(q=>q.enemyFirst<=p.enemyFirst && q.teamFirst>=p.teamFirst &&
    q.teamDouble>=p.teamDouble && q.enemyDouble<=p.enemyDouble &&
    (table.finish.length!==2 || q.teamThird>=p.teamThird))) return false
  const margin=Math.ceil(samples/4)
  return p.enemyFirst<=pass.enemyFirst && p.teamFirst>=pass.teamFirst && (
    pass.enemyFirst-p.enemyFirst>=margin || p.teamFirst-pass.teamFirst>=margin ||
    p.teamDouble-pass.teamDouble>=margin || pass.enemyDouble-p.enemyDouble>=margin ||
    (table.finish.length===2 && p.teamThird-pass.teamThird>=margin))
}

function planReason(table: PublicTable, level: string, target: Move|null, chosen: Projection,
    alternative: Projection|undefined, baseline: ReturnType<typeof quickTeamSuggestion>, watchCount?: number) {
  const mate = (table.seat+2)%4, count = table.counts[mate], move = chosen.move
  const warning = watchCount ? '對手剩 '+watchCount+' 張。' : ''
  if (count===0) {
    if (!move) return warning+(table.holder===mate
      ? '隊友已出完，目前仍是他最大。先過牌，這圈若沒人壓過，你就能接風領出。'
      : '隊友已出完。這圈先過，保留手牌爭取下一次牌權。')
    const action=target?'壓牌':'領出'
    return warning+'隊友已出完。用'+names[move.kind]+' '+move.label+action+'，爭取自己提早走完。'
  }
  const known = table.shown[mate]
  let detail = '隊友剩 '+count+' 張。'
  if (count === 2) {
    if (known.length === 2) {
      const cards = known.map((c,i)=>({...c,id:'shown-'+i}))
      detail = allMoves(cards,level,true).some(m=>m.kind==='pair')
        ? '隊友公開的兩張牌能組成對子。' : '隊友公開的兩張是散牌，需要分兩手走。'
    } else detail = '隊友剩兩張，若是散牌，就需要兩次出牌機會。'
  }
  let action: string
  if (!move && table.holder===mate) {
    action = table.pending.length===1 ? '你過牌，這圈就由隊友收下，下一圈由他先出。' :
      '先過，讓隊友的牌繼續留在桌面；後面的人都過，他就能先出下一圈。'
  } else if (!move) {
    action = table.pending.slice(1).includes(mate)
      ? '先過，把這次跟牌機會留給隊友；等對手再加壓時，你仍保有現在的手牌可以接應。'
      : '這手先過，留住能壓牌的選擇，等下一圈出現適合隊友接的牌型。'
  } else if (target) {
    action = '用'+names[move.kind]+' '+move.label+' 壓住'+(table.holder===mate?'隊友':'對手')+'的牌。'
    if (watchCount && table.holder!==mate && table.counts[table.holder]===watchCount) {
      action += '若讓大家過牌，這名對手就能接著挑下一圈的牌型。'
    }
    action += alternative && chosen.enemyFirst<alternative.enemyFirst
      ? '和過牌相比，推演中對手較少搶到頭游。'
      : chosen.repeatedLead ? '若再拿到牌權，可以領出'+chosen.repeatedLead+'。'
      : '若能收圈，下圈的牌型就由你決定。'
  } else {
    action = '先領出'+names[move.kind]+' '+move.label+'。'
    if ((move.kind==='single' || move.kind==='pair') && move.value < power('BJ',level)) {
      action += '隊友若有更大的'+names[move.kind]+'，就有機會跟上。'
    } else if (chosen.repeatedLead) action += '若能再拿到牌權，可以接著領出'+chosen.repeatedLead+'。'
    else action += '若這手守住，下一圈的牌型就由你決定。'
  }
  if (alternative && chosen.mateOut>alternative.mateOut) {
    action += '這樣走，隊友在更多推演裡能出完。'
  } else if (alternative && chosen.rootOut>alternative.rootOut) {
    action += '推演中，你在接下來幾圈出完手牌的機會也較多。'
  } else if (alternative && chosen.matePlays>alternative.matePlays) {
    action += '推演裡，隊友接下來有較多次出牌機會。'
  } else if (baseline.move===move && target && move && table.holder===mate && baseline.reason.includes('後面有對手')) {
    action = baseline.reason
  }
  if (watchCount && alternative && chosen.enemyClose<alternative.enemyClose &&
      chosen.enemyFirst===alternative.enemyFirst) {
    action += '比較後續幾圈，這樣較少讓對手把餘牌整理成最後一手。'
  }
  return warning+detail+action
}

// Play the hand in front of this seat. An introductory partner can still yield
// the trick or finish, without estimating opponents' holdings.
export function beginnerSuggestion(hand: Card[], level: string, target: Move|null, table: PublicTable, style?: PlayStyle) {
  const moves=allMoves(hand,level)
  const legal=preferredFullHouses(moves.filter(move=>beats(move,target)),hand,level)
  const finisher=legal.find(move=>move.cards.length===hand.length)
  if (finisher) return {move:finisher,reason:'這手可以出完。',moves}
  const response=style && partnerResponse(hand,level,target,table,legal,style)
  if (response) return {move:response.move,reason:response.reason,moves}
  if (target && table.holder===(table.seat+2)%4) return {move:null,reason:'隊友目前最大，先過牌。',moves}
  function cost(move:Move) {
    const partnerCount=table.counts[(table.seat+2)%4]
    const feed=style==='support' && partnerCount<=2 && move.cards.length===partnerCount ? 8 : 0
    const preserve=style==='balanced' ? 6*move.cards.filter(c=>wild(c,level)).length : 0
    return move.value + bombCost(move) + controlCost(move,level) + preserve - feed -
      (target ? 0 : (style==='attack' ? 4 : 2)*move.cards.length)
  }
  const move=legal.reduce<Move|null>((best,next)=>!best || cost(next)<cost(best) ? next : best,null)
  let reason='沒有能跟的牌，這手過牌。'
  if (move) {
    reason=target?'用'+names[move.kind]+' '+move.label+' 壓過對手，爭取下一圈先出。':
      style==='attack'?'先領出'+names[move.kind]+'，把手牌減到 '+(hand.length-move.cards.length)+' 張。':'先出這組牌，保留手上的大牌。'
    if (!target && style==='support' && table.counts[(table.seat+2)%4]===move.cards.length && move.cards.length<=2)
      reason='先領出較小的'+names[move.kind]+'，隊友若能跟上就有機會一次走完。'
  }
  return {move,reason,moves}
}

export function teamSuggestion(hand: Card[], level: string, target: Move|null, table: PublicTable,
    strength:Difficulty='standard', style?:PlayStyle) {
  if (strength==='beginner') return beginnerSuggestion(hand,level,target,table,style)
  const advanced=strength==='advanced'
  const {advice:baseline,settled} = quickDecision(hand, level, target, table, style, advanced)
  if (settled) return baseline
  const legal = preferredFullHouses(baseline.moves.filter(m=>beats(m,target)),hand,level)
  const protectedPlan = strength==='advanced' && publicFinish(hand,level,target,table,legal)
  if (protectedPlan) return {...baseline,...protectedPlan,
    reason:attachmentReason(protectedPlan.move,baseline.moves,hand,level,protectedPlan.reason)}
  const planned = projectedSuggestion(hand,level,target,table,strength,style,baseline,legal)
  return advanced ? searchedSuggestion(hand,level,target,table,style,planned,legal) : planned
}

// Advanced seats play each serious candidate to the end of the deal on the
// same sampled hands. The table plan stands unless another play is clearly better.
function searchedSuggestion(hand: Card[], level: string, target: Move|null, table: PublicTable,
    style: PlayStyle|undefined, planned: TeamAdvice, legal: Move[]): TeamAdvice {
  if (!legal.length || (!target && legal.length===1)) return planned
  // A full opening hand makes every playout longer; compare fewer, likelier lines.
  const opening = hand.length>18
  // A sampled projection alone never pays for bombing a partner's trick or
  // breaking the level pair over it; those cases need the proofs checked above.
  const allyLeads = !!target && table.holder===(table.seat+2)%4
  const keepsControl = (move: Move|null) => !allyLeads || !move || move===planned.move ||
    !spendsReservedControl(move,hand,level)
  const choices = candidatePlays(legal, planned.move, target).filter(keepsControl).slice(0, opening ? 8 : 12)
  if (choices.length<2) return planned
  const lines = searchLines(hand, level, target, table, choices, opening ? 8 : 16, style)
  const reference = lines?.find(line=>line.move===planned.move)
  if (!lines || !reference) return planned
  let best = reference
  for (const line of lines) {
    if (line.value>best.value && line.value>reference.value+.15 && clearlyBetter(line,reference)) best=line
  }
  if (best===reference) return planned
  return {...planned, move:best.move,
    reason:attachmentReason(best.move,planned.moves,hand,level,searchReason(best,reference))}
}

type TeamAdvice = {move: Move|null, reason: string, moves: Move[]}
function projectedSuggestion(hand: Card[], level: string, target: Move|null, table: PublicTable,
    strength: Difficulty, style: PlayStyle|undefined, baseline: TeamAdvice, legal: Move[]): TeamAdvice {
  const advanced=strength==='advanced'
  const partnerCount = table.counts[(table.seat+2)%4]
  // Standard concentrates the search on handoffs. Advanced also looks for
  // defenses before either opponent goes out, using the same public boundary.
  const receivingHandoff = hand.length===2 && !baseline.moves.some(m=>m.kind==='pair')
  const shortestOpponent = Math.min(...table.counts.filter((count,seat)=>seat%2!==table.seat%2 && count>0))
  // Every advanced seat starts watching its own opponents at the same threshold.
  const watchTen = advanced && shortestOpponent>=5 && shortestOpponent<=10
  const handoff = partnerCount>0 && (partnerCount<=4 || receivingHandoff)
  const advancedEndgame = strength==='advanced' && (shortestOpponent<=4 || watchTen || hand.length<=5 || (partnerCount>0 && partnerCount<=6))
  if ((!handoff && !advancedEndgame) || baseline.move?.cards.length===hand.length) return baseline
  if (!legal.length || (!target && legal.length===1)) return baseline
  // Early warnings can occur while three seats still have nearly full hands.
  // Limit the number of full three-trick projections in these larger positions.
  const earlyWarning = watchTen && hand.length>5 && (partnerCount===0 || partnerCount>6)
  const samples = earlyWarning && Math.max(...table.counts)>16 ? 8 : strength==='advanced' ? 20 : 12
  const worlds = samplePublicHands(hand, level, target, table, samples, advanced)
  if (!worlds.length) return baseline

  const cache = new Map<string,Move[]>()
  const choices = candidatePlays(legal, baseline.move, target)
  const allProjections = choices.map(m=>projectChoice(worlds,level,target,table,m,cache,watchTen,advanced))
  const pass=allProjections.find(p=>p.move===null)
  const allyLeads=target && table.holder===(table.seat+2)%4
  let projections=allProjections
  if (advanced && allyLeads && pass) {
    const cheaper=allProjections.filter(p=>p.move && !spendsReservedControl(p.move,hand,level))
    projections=allProjections.filter(p=>p===pass || cheaper.includes(p) ||
      earnsCostlyRaise(p,pass,cheaper,table,target,hand,level,worlds.length))
  }
  for (const p of projections) {
    if (advanced) p.score+=25*(p.teamDouble-p.enemyDouble)/worlds.length
    if (style==='support') p.score+=(12*p.mateOut+2*p.matePlays)/worlds.length
    if (style==='attack') p.score+=12*p.rootOut/worlds.length
    if (style==='balanced' && p.move) p.score-=.35*bombCost(p.move)+3*p.move.cards.filter(c=>wild(c,level)).length
  }
  // Small differences from a handful of hypothetical deals should not spend a
  // bomb or take an ally's trick without a clear advantage over the safe move.
  let best = projections[0]
  for (const p of projections.slice(1)) {
    if (p.score > best.score && p.score > projections[0].score+5) best = p
  }
  const others = projections.filter(p=>p!==best).sort((a,b)=>b.score-a.score)
  const comparison = best.move && target ? others.find(p=>!p.move) : others[0]
  let reason = planReason(table,level,target,best,comparison,baseline,watchTen ? shortestOpponent : undefined)
  if (advanced && allyLeads && !best.move && legal.some(m=>bombCost(m)>0)) {
    reason+='留下炸彈，對手再搶牌權時還能攔。'
  }
  if (advanced && allyLeads && pass && best.move && spendsReservedControl(best.move,hand,level)) {
    if (best.teamDouble>pass.teamDouble) reason+='花掉控牌後，我方在更多推演裡包辦前兩名。'
    else if (best.teamFirst>pass.teamFirst) reason+='花掉控牌後，我方在更多推演裡拿到頭游。'
    else if (best.enemyDouble<pass.enemyDouble) reason+='這樣能降低對手包辦前兩名的機會。'
    else if (table.finish.length===2 && best.teamThird>pass.teamThird) reason+='這樣能提高我方守住三游的機會。'
  }
  return {...baseline, move:best.move, reason:attachmentReason(best.move,baseline.moves,hand,level,reason)}
}
