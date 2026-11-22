import { allMoves, remaining, wild, type Card, type Move } from './rules.ts'

// allMoves builds a full house as three cards followed by the attached pair.
// The pair contributes no comparison value, even if its cards are level cards.
export function controlCost(move: Move, level: string) {
  if (move.kind !== 'full') return 0
  return move.cards.slice(3).reduce((cost, card) => {
    if (wild(card, level)) return cost + 15
    if (card.suit === 'J') return cost + 12
    return cost + (card.rank === level ? 10 : 0)
  }, 0)
}

export function preferredFullHouses(legal: Move[], hand: Card[], level: string) {
  const expensive = legal.filter(move => controlCost(move,level)>0)
  if (!expensive.length || hand.length===5) return legal
  const cleanPairs = legal.filter(move => {
    if (move.kind!=='full' || controlCost(move,level)>0) return false
    const rank = move.cards[3].rank
    return hand.filter(c=>c.rank===rank).length===2
  })
  if (!cleanPairs.length) return legal
  const excluded = new Set<Move>()
  const finishes = new Map<Move,boolean>()
  function leavesOnePlay(move: Move) {
    if (!finishes.has(move)) finishes.set(move,
      hand.length<=15 && allMoves(remaining(hand,move),level,true).length>0)
    return finishes.get(move)
  }
  for (const costly of expensive) {
    // Compare the same physical triple, so a different use of a wildcard in
    // the triple isn't accidentally discarded. Keep a route to a one-play finish.
    const substitute = cleanPairs.some(other =>
      other.value===costly.value && other.cards.slice(0,3).every((c,i)=>c===costly.cards[i]) &&
      (!leavesOnePlay(costly) || leavesOnePlay(other)))
    if (substitute) excluded.add(costly)
  }
  return legal.filter(move => !excluded.has(move))
}
