import { allMoves, beats, deck, describe, names, power, ranks, remaining, uid, wild, type Card, type Move } from './rules.ts'
import { teamSuggestion, type PublicTable } from './team-coach.ts'
import type { Difficulty } from './difficulty.ts'
import type { PlayStyle } from './play-style.ts'

export const seats = [0, 1, 2, 3]
export const seatName = ['你', '右家', '對家', '左家']
export const places = ['頭游', '二游', '三游', '末游']
export const partner = (seat: number) => (seat + 2) % 4
export const teamOf = (seat: number) => seat % 2
export type Event = { seat: number, text: string, kind: 'play' | 'pass' | 'system', trick: number, move?: Move, reveal?: {from?: number, to: number, card: Card}, resistedTribute?: true }
type Gift = { from: number, card: Card, to?: number }
type Exchange = { winners: number[], donors: number[], gifts: Gift[], returned: Gift[], leader: number }
export type Match = {
  version: 2, hands: Card[][], turn: number, level: string, scores: [string,string],
  owner: number, handNo: number, trick: number, phase: 'play' | 'donate' | 'return' | 'result',
  target: Move | null, holder: number, pending: number[], finish: number[], events: Event[],
  exchange: Exchange | null, won: boolean, gain: number
}
export function shufflePack(random = Math.random) {
  const cards = deck()
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
  return cards
}
function note(s: Match, text: string, seat = -1): Event {
  return {seat, text, kind:'system', trick:s.trick}
}
function draw(pack: Card[], start: number) {
  const hands: Card[][] = [[],[],[],[]]
  pack.forEach((card,i) => hands[(start + i) % 4].push(card))
  return hands
}
export function startMatch(pack = shufflePack(), random = Math.random): Match {
  const eligible = pack.filter(c => c.suit !== 'J' && !wild(c,'2'))
  const cut = eligible[Math.floor(random() * eligible.length)]
  const start = (power(cut.rank,'') - 1) % 4
  const hands = draw(pack,start)
  const turn = hands.findIndex(h => h.some(c => uid(c) === uid(cut)))
  const s: Match = {version:2, hands,turn,level:'2',scores:['2','2'],owner:-1,handNo:1,trick:1,
    phase:'play',target:null,holder:-1,pending:[],finish:[],events:[],exchange:null,won:false,gain:0}
  s.events.push({...note(s,'翻牌 '+describe([cut])+'，'+seatName[turn]+' 抓到明牌，首先領出。'),reveal:{to:turn,card:cut}})
  return s
}
function afterSeat(seat: number) { return [1,2,3].map(offset => (seat + offset) % 4) }
export function settle(s: Match): Match {
  const [first,second] = s.finish
  const double = second === partner(first)
  if (!double && s.finish.length < 3) return s
  const finish = double ? s.finish.slice(0,2) : [...s.finish.slice(0,3), seats.find(i => !s.finish.includes(i))!]
  const rank = finish.indexOf(partner(first))
  const gain = 4 - rank
  const team = teamOf(first)
  const won = s.owner === team && s.level === 'A' && rank <= 2
  const scores: [string,string] = [...s.scores]
  scores[team] = ranks[Math.min(ranks.length - 1, ranks.indexOf(scores[team]) + gain)]
  return {...s, phase:'result', scores, finish, gain, won, pending:[]}
}
function matchDeclaration(cards: Card[], level: string, target: Move | null, submitted: Move) {
  return allMoves(cards,level,true).find(m => m.kind === submitted.kind && m.value === submitted.value &&
    m.label === submitted.label && beats(m,target))
}
export function takeTurn(s: Match, seat: number, offered: Move | null): Match {
  if (s.phase !== 'play' || seat !== s.turn || !s.hands[seat].length) throw new Error('尚未輪到這個座位。')
  if (!offered) {
    if (!s.target || s.pending[0] !== seat) throw new Error('領出時必須出牌。')
    const pending = s.pending.slice(1)
    const events: Event[] = [...s.events,{seat,text:'過牌',kind:'pass',trick:s.trick}]
    if (pending.length) return {...s,turn:pending[0],pending,events}
    const lead = s.hands[s.holder].length ? s.holder : partner(s.holder)
    const next = {...s, turn:lead, target:null, holder:-1, pending:[], trick:s.trick + 1, events}
    events.push(note(next,seatName[lead]+(lead === s.holder?' 收下這圈，重新領出。':' 接風，替已出完牌的隊友領出。'),lead))
    return next
  }
  const ids = new Set(offered.cards.map(uid))
  const actual = s.hands[seat].filter(c => ids.has(uid(c)))
  if (actual.length !== offered.cards.length) throw new Error('這手牌含有重複或已打出的牌。')
  const move = matchDeclaration(actual,s.level,s.target,offered)
  if (!move) throw new Error('這手牌不符合牌型或無法壓過桌面牌。')
  const hands = s.hands.map((h,i) => i === seat ? remaining(h,move) : h)
  const finish = hands[seat].length ? s.finish : [...s.finish,seat]
  const pending = afterSeat(seat).filter(i => hands[i].length > 0)
  const events: Event[] = [...s.events,{seat,text:names[move.kind]+' '+move.label,kind:'play',trick:s.trick,move}]
  const next = {...s,hands,finish,events,target:move,holder:seat,pending,turn:pending[0] ?? seat}
  if (!hands[seat].length) events.push(note(next,seatName[seat]+' 出完手牌，取得'+places[finish.length-1]+'。',seat))
  return finish.length >= 2 ? settle(next) : next
}

export function nextHand(s: Match, pack = shufflePack()): Match {
  if (s.phase !== 'result' || s.won) throw new Error('本場無法開始下一副。')
  const first = s.finish[0], double = s.finish[1] === partner(first)
  const donors = double ? afterSeat(first).filter(i => teamOf(i) !== teamOf(first)) : [s.finish[3]]
  const owner = teamOf(first), start = double ? (first+1)%4 : first
  const hands = draw(pack,start)
  const x: Exchange = {winners:s.finish.slice(0,double?2:1),donors,gifts:[],returned:[],leader:first}
  const next: Match = {...s,hands,owner,level:s.scores[owner],handNo:s.handNo+1,trick:1,
    phase:'donate',turn:donors[0],target:null,holder:-1,pending:[],finish:[],events:[],exchange:x,gain:0,won:false}
  if (donors.flatMap(i=>hands[i]).filter(c=>c.rank==='BJ').length===2) {
    next.phase='play'; next.turn=first; next.exchange=null
    const reason=double?'雙下的兩位牌手合持兩張大王':'末游持有兩張大王'
    next.events.push({...note(next,'抗貢成立。'+reason+'，本副免進貢，由上副頭游（'+seatName[first]+'）先出。'),resistedTribute:true})
  } else next.events.push(note(next,double?'上副雙下，兩位負方各進貢一張牌。':'上副末游向頭游進貢。'))
  return next
}
export function openingTributeNotice(s: Match): string|null {
  if (s.phase!=='play' || s.trick!==1) return null
  const opening=s.events[0]
  // Version 2 saves made before the public event was tagged carry the same opening message.
  return opening?.kind==='system' && (opening.resistedTribute || opening.text.startsWith('抗貢成立'))
    ? opening.text : null
}

export function exchangeOptions(s: Pick<Match, 'hands' | 'turn' | 'phase' | 'level'>) {
  const hand = s.hands[s.turn]
  if (s.phase === 'donate') {
    const eligible = hand.filter(c=>!wild(c,s.level))
    const high = Math.max(...eligible.map(c=>power(c.rank,s.level)))
    return eligible.filter(c=>power(c.rank,s.level)===high)
  }
  if (s.phase === 'return') {
    const low = hand.filter(c=>power(c.rank,s.level)<=10)
    const value = Math.min(...hand.map(c=>power(c.rank,s.level)))
    return low.length ? low : hand.filter(c=>power(c.rank,s.level)===value)
  }
  return []
}
function transfer(hands: Card[][], card: Card, from: number, to: number) {
  return hands.map((h,i)=>i===from ? h.filter(c=>uid(c)!==uid(card)) : i===to ? [...h,card] : h)
}
export function giveCard(s: Match, seat: number, card: Card): Match {
  if (!s.exchange || seat!==s.turn || !exchangeOptions(s).some(c=>uid(c)===uid(card))) throw new Error('這張牌不符合本次進貢或還貢的條件。')
  const x: Exchange = {...s.exchange,gifts:[...s.exchange.gifts],returned:[...s.exchange.returned]}
  const next: Match = {...s,exchange:x,events:[...s.events]}
  if (s.phase==='donate') {
    x.gifts.push({from:seat,card})
    if (x.gifts.length<x.donors.length) {next.turn=x.donors[x.gifts.length];return next}
    const nextToFirst = (x.winners[0]+1)%4
    const sorted = x.gifts.sort((a,b)=>power(b.card.rank,s.level)-power(a.card.rank,s.level) ||
      Number(b.from===nextToFirst)-Number(a.from===nextToFirst))
    x.gifts = sorted.map((g,index)=>({...g,to:x.winners[index]}))
    for (const g of x.gifts) {
      next.hands=transfer(next.hands,g.card,g.from,g.to!)
      next.events.push({...note(s,seatName[g.from]+' 進貢 '+describe([g.card])+' 給 '+seatName[g.to!]+'。'),reveal:{from:g.from,to:g.to!,card:g.card}})
    }
    x.leader=x.gifts[0].from;next.turn=x.winners[0];next.phase='return'
  } else {
    const g=x.gifts.find(g=>g.to===seat)!
    x.returned.push({from:seat,to:g.from,card})
    const waiting=x.winners.find(i=>!x.returned.some(gift=>gift.from===i))
    if (waiting!==undefined) next.turn=waiting
    else {
      // Double returns are revealed together after both recipients choose.
      for(const gift of x.returned) {
        next.hands=transfer(next.hands,gift.card,gift.from,gift.to!)
        next.events.push({...note(s,seatName[gift.from]+' 還貢 '+describe([gift.card])+' 給 '+seatName[gift.to!]+'。'),reveal:{from:gift.from,to:gift.to!,card:gift.card}})
      }
      next.phase='play';next.turn=x.leader;next.exchange=null;next.events.push(note(s,seatName[next.turn]+' 領出。'))
    }
  }
  return next
}

export function publicTable(s: Match,seat=s.turn): PublicTable {
  const shown: PublicTable['shown']=[[],[],[],[]], played: PublicTable['played']=[]
  function consume(owner: number,c: Card) {
    const index=shown[owner].findIndex(e=>e.rank===c.rank && e.suit===c.suit)
    if (index!==-1) shown[owner].splice(index,1)
  }
  for (const event of s.events) {
    if (event.reveal) {
      const {from,to,card}=event.reveal
      if (from!==undefined) consume(from,card)
      shown[to].push({suit:card.suit,rank:card.rank})
    }
    if (event.kind==='play' && event.move) {
      for (const c of event.move.cards) {consume(event.seat,c);played.push({suit:c.suit,rank:c.rank})}
    }
  }
  // Only lengths cross this boundary. Double tribute choices in progress are private.
  return {seat, counts:s.hands.map(h=>h.length), holder:s.holder, pending:[...s.pending], finish:[...s.finish], shown, played}
}
export function adviceInput(s: Match, strength: Difficulty='standard', style?: PlayStyle) {
  // A public declaration needs its kind, comparison value and number of cards.
  // Give visible faces local IDs so another seat's physical copies stay private.
  const target=s.target && {...s.target,as:{},cards:s.target.cards.map(({suit,rank},i)=>({suit,rank,id:'table-'+i}))}
  return {hand:s.hands[s.turn],level:s.level,target,table:publicTable(s),...(strength==='standard' ? {} : {strength}),...(style ? {style} : {})}
}
export type TeamAdviceInput = ReturnType<typeof adviceInput>
export function adviseTurn(s: Match, strength: Difficulty='standard', style?: PlayStyle) {
  const {hand,level,target,table}=adviceInput(s)
  return teamSuggestion(hand,level,target,table,strength,style)
}
export function botStep(s: Match, strength: Difficulty='standard', style?: PlayStyle): Match {
  if (s.phase==='result') return s
  if (s.phase!=='play') {
    const allowed=exchangeOptions(s)
    const chosen=[...allowed].sort((a,b)=>power(a.rank,s.level)-power(b.rank,s.level))[0]
    return giveCard(s,s.turn,chosen)
  }
  const chosen=adviseTurn(s,strength,style)
  return takeTurn(s,s.turn,chosen.move)
}
