import { allMoves, ranks, uid, wild, type Card, type Move } from './rules.ts'
import type { PlayStyle } from './play-style.ts'

// At most 27 cards are in a hand. A bit denotes one physical card, so two
// overlapping straights cannot both be counted as ways to empty that hand.
function countBits(mask: number) {
  let count = 0
  for (let bits = mask; bits; bits &= bits - 1) count++
  return count
}

export function advancedHandPlanner(hand: Card[], level: string, style?: PlayStyle) {
  const cardsById = [...hand].sort((a, b) => uid(a).localeCompare(uid(b)))
  const bit = new Map(cardsById.map((card, index) => [uid(card), 1 << index]))
  const maskOf = (cards: Card[]) => cards.reduce((mask, card) => mask | bit.get(uid(card))!, 0)
  const fullMask = maskOf(hand)
  const rankMasks = [...ranks, 'SJ', 'BJ'].map(rank => maskOf(hand.filter(card => card.rank === rank)))
  const grouped = new Map<number, number>()

  // This is a playable partition: each rank is a single, pair, triple or
  // bomb; each available pair can travel with one triple as a full house.
  function rankTurns(mask: number) {
    const cached = grouped.get(mask)
    if (cached !== undefined) return cached
    let turns = 0, pairs = 0, triples = 0
    for (const rankMask of rankMasks) {
      const n = countBits(mask & rankMask)
      if (n) turns++
      if (n === 2) pairs++
      if (n === 3) triples++
    }
    const result = turns - Math.min(pairs, triples)
    grouped.set(mask, result)
    return result
  }

  const partitions = new Map<number, {turns: number, hasBomb: boolean}>()
  function partition(mask: number) {
    const cached = partitions.get(mask)
    if (cached) return cached
    // Generate declarations on the actual remainder. If a card was used,
    // another physical copy or a level heart can still complete a sequence.
    const rest = cardsById.filter((_, index) => (mask & (1 << index)) !== 0)
    const declarations = allMoves(rest, level)
    const hasBomb = declarations.some(move => ['bomb', 'flush', 'kings'].includes(move.kind))
    const special = new Set<number>()
    for (const move of declarations) {
      if (['straight', 'flush', 'pairs', 'steel', 'kings'].includes(move.kind) ||
          Object.keys(move.as).length) special.add(maskOf(move.cards))
    }

    let turns = rankTurns(mask)
    let frontier = [mask]
    // Compare a small number of packings; the estimate is an achievable
    // number of leads with this hand, not a guarantee of holding the table.
    for (let depth = 1; depth <= 3 && depth < turns && frontier.length; depth++) {
      const next = new Map<number, number>()
      for (const previous of frontier) {
        for (const group of special) {
          if ((previous & group) !== group) continue
          const left = previous ^ group
          const tail = rankTurns(left)
          turns = Math.min(turns, depth + tail)
          if (tail > 1) next.set(left, tail)
        }
      }
      frontier = [...next.keys()].sort((a, b) => next.get(a)! - next.get(b)! ||
        countBits(a) - countBits(b)).slice(0, 3)
    }
    const result = {turns, hasBomb}
    partitions.set(mask, result)
    return result
  }

  const starting = partition(fullMask)
  // A lead spends one of our own turns at the front of the trick. A follow
  // sheds cards on someone else's lead, so it costs no lead of our own.
  return (move: Move, following = false) => {
    const left = fullMask ^ maskOf(move.cards)
    const after = partition(left)
    const savedLeads = starting.turns - ((following ? 0 : 1) + after.turns)
    let score = savedLeads * (style === 'attack' ? 12 : 10)
    if (after.turns > 1) {
      // These are potential ways to regain the lead, not certified winners.
      if (starting.hasBomb && !after.hasBomb) score -= style === 'balanced' ? 8 : 5
      for (const card of move.cards) {
        if (card.suit === 'J' || wild(card, level)) score -= style === 'balanced' ? 3 : 2
        else if (card.rank === level) score -= 1
      }
    }
    return {score, turns: after.turns}
  }
}
