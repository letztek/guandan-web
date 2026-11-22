import { adviseTurn, startMatch, takeTurn, type Match } from './match.ts'
import type { PartnerId } from './partner-roster.ts'
import { deck, interpret, power, wild, type Card } from './rules.ts'
import { playStyleForSeat } from './table-seats.ts'

export type StyleChoice = 'pass' | 'nine' | 'ace'

// The four holdings just before seat 0 led the eight in the recorded example.
// Physical IDs distinguish the two club nines. Seat 2 is the learner's seat.
const endingIds = [
  ['D3-0','H7-0','S8-0'],
  ['C3-0','H4-0','D5-0','S6-0','C7-0','H8-0','D8-0','D9-0','C9-1','HQ-0','D4-0','C5-0','S7-0'],
  ['C9-0','D10-0','HJ-0','SQ-0','DK-0','CA-0'],
  ['SJ-0'],
]
const learner = 2

function playSingle(game: Match, seat: number, card: Card) {
  const single = interpret([card],game.level,game.target)
  if (!single) throw new Error('這張單牌無法跟上桌面。')
  return takeTurn(game,seat,single)
}

export function createStyleLessonGame(): Match {
  const stock = deck()
  const byId = new Map(stock.map(card => [card.id,card]))
  const ending = endingIds.map(ids => ids.map(id => byId.get(id)!))
  const reserved = new Set(ending.flat())
  const dealtEarlier = stock.filter(card => !reserved.has(card))
  const prior = ending.map(hand => dealtEarlier.splice(0,27-hand.length)
    .sort((a,b) => power(b.rank,'2')-power(a.rank,'2')))

  // Replay the original deal through the game engine, including cut, passes
  // and changes of lead. The coach sees the same public history as at the table.
  const deal = ending.map((hand,seat) => [...hand,...prior[seat]])
  const cut = byId.get('DA-0')!
  const start = (power(cut.rank,'')-1)%4
  const pack = Array.from({length:27},(_,i) => [0,1,2,3].map(offset => deal[(start+offset)%4][i])).flat()
  const eligible = pack.filter(card => card.suit!=='J' && !wild(card,'2'))
  let game = startMatch(pack,() => (eligible.indexOf(cut)+.5)/eligible.length)
  for (const seat of [1,2,3,0]) {
    for (const card of prior[seat]) {
      while (game.turn!==seat) game=takeTurn(game,game.turn,null)
      game=playSingle(game,seat,card)
    }
  }
  while (game.turn!==0 || game.target) game=takeTurn(game,game.turn,null)
  game=playSingle(game,0,byId.get('S8-0')!)
  return takeTurn(game,1,null)
}

export function playStyleChoice(game: Match, choice: StyleChoice): Match {
  if (choice==='pass') return takeTurn(game,learner,null)
  const id = choice==='nine' ? 'C9-0' : 'CA-0'
  const card = game.hands[learner].find(card => card.id===id)
  if (!card) throw new Error('這張牌已不在手上。')
  return playSingle(game,learner,card)
}

export function styleLessonAdvice(game: Match, partnerId: PartnerId) {
  return adviseTurn(game,'advanced',playStyleForSeat(learner,partnerId))
}
