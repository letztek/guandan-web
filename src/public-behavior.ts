import type { Event } from './match.ts'
import { power, type Card } from './rules.ts'

export type PublicSeatHistory = {
  singleLeads: number
  otherLeads: number
  passedOpponentPairs: number[]
}

// A pass is informative here only if an opponent actually won that trick
// with the pair. An intervening raise reopens bidding for every active seat.
export function publicSeatHistory(events: Event[], currentTrick: number): PublicSeatHistory[] {
  const seats: PublicSeatHistory[] = Array.from({length:4}, () => ({
    singleLeads:0, otherLeads:0, passedOpponentPairs:[]
  }))
  let trick = -1
  let lastPlay: Event | undefined
  const passed = new Set<number>()
  function recordClosedPair() {
    const move = lastPlay?.move
    // Passing kings, aces, level cards or jokers says little about ordinary pairs.
    if (move?.kind === 'pair' && move.value <= 12) {
      for (const seat of passed) seats[seat].passedOpponentPairs.push(move.value)
    }
  }
  for (const event of events) {
    if (event.kind === 'system' || event.seat < 0 ||
        event.trick < currentTrick - 8 || event.trick > currentTrick) continue
    if (event.trick !== trick) {
      recordClosedPair()
      trick = event.trick
      lastPlay = undefined
      passed.clear()
    }
    if (event.kind === 'play' && event.move) {
      if (!lastPlay) {
        if (event.move.kind === 'single') seats[event.seat].singleLeads++
        else seats[event.seat].otherLeads++
      }
      lastPlay = event
      passed.clear()
    } else if (event.kind === 'pass' && lastPlay && event.seat % 2 !== lastPlay.seat % 2) {
      passed.add(event.seat)
    }
  }
  if (trick < currentTrick) recordClosedPair()
  return seats
}

// Only combined, repeated cues affect the estimate. An ordinary higher pair
// or another pair used to hold a bomb / full house remains entirely possible.
export function dealLikelihood(history: PublicSeatHistory[] | undefined, missing: number[], level: string) {
  const seats = (history ?? []).flatMap((seen, seat) =>
    missing[seat] > 0 && seen.passedOpponentPairs.length >= 2 &&
    seen.singleLeads >= 2 && seen.singleLeads > seen.otherLeads ? [seat] : [])
  if (!seats.length || !history) return null
  return (world: Card[][]) => {
    let preference = 0
    for (const seat of seats) {
      const cards = world[seat]
      if (cards.length < 2) continue
      const ranks = new Map<number, number>()
      for (const card of cards) {
        // A player can decline to spend jokers, level cards, or a wildcard.
        if (card.suit === 'J' || card.rank === level) continue
        const rank = power(card.rank,level)
        ranks.set(rank,(ranks.get(rank) ?? 0) + 1)
      }
      const singletons = [...ranks.values()].filter(count => count === 1).length
      const ordinaryPairs = [...ranks].filter(([,count]) => count === 2)
      const passed = history[seat].passedOpponentPairs
      const affordableReplies = passed.filter(value =>
        ordinaryPairs.some(([rank]) => rank > value && rank <= value + 4)).length
      preference += singletons / cards.length - affordableReplies / passed.length
    }
    // Bound the influence even if multiple seats exhibited the same tendency.
    return 1 + .35 * Math.max(-1,Math.min(1,preference))
  }
}
