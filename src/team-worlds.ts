import { deck, uid, type Card, type Move } from './rules.ts'
import type { PublicTable } from './team-coach.ts'
import { dealLikelihood } from './public-behavior.ts'

type Face = Pick<Card, 'suit' | 'rank'>
const faceKey = (card: Face) => card.suit + ':' + card.rank
const faceList = (cards: Face[]) => cards.map(faceKey).sort().join(',')
const stock = deck()

// Common random deals let every candidate face the same opposition. The seed
// contains public faces only, independent of physical copies and event order.
function generator(observation: string) {
  let state = 2166136261
  for (const char of observation) state = Math.imul(state ^ char.charCodeAt(0), 16777619)
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

export function samplePublicHands(hand: Card[], level: string, target: Move | null, table: PublicTable,
    samples = 10, inferFromHistory = false): Card[][][] {
  const { counts, played, shown, seat } = table
  if (counts.length !== 4 || shown.length !== 4 || counts[seat] !== hand.length ||
      counts.some((n, s) => !Number.isInteger(n) || n < shown[s].length || n > 27) ||
      counts.reduce((sum, n) => sum + n, played.length) !== stock.length) return []

  const pool = new Map<string, Card[]>()
  for (const card of stock) {
    const key = faceKey(card)
    const copies = pool.get(key) ?? []
    copies.push(card)
    pool.set(key, copies)
  }
  // Respect the root's real IDs for moves checked by the match engine. Consume
  // everything else by face, since a public observation cannot identify a copy.
  if (new Set(hand.map(uid)).size !== hand.length) return []
  for (const card of hand) {
    const copies = pool.get(faceKey(card))
    if (!copies?.length) return []
    const physical = copies.findIndex(c => uid(c) === uid(card))
    copies.splice(physical >= 0 ? physical : 0, 1)
  }
  for (const card of played) if (!pool.get(faceKey(card))?.pop()) return []

  const ownFaces = hand.map(faceKey)
  for (const card of shown[seat]) {
    const index = ownFaces.indexOf(faceKey(card))
    if (index < 0) return []
    ownFaces.splice(index, 1)
  }
  const known = shown.map((_, s): Card[] => s === seat ? [...hand] : [])
  for (let s = 0; s < 4; s++) {
    if (s === seat) continue
    for (const face of [...shown[s]].sort((a, b) => faceKey(a).localeCompare(faceKey(b)))) {
      const card = pool.get(faceKey(face))?.pop()
      if (!card) return []
      known[s].push(card)
    }
  }

  const unseen = [...pool.values()].flat()
  const missing = counts.map((count, s) => count - known[s].length)
  const observation = [level, seat, counts.join(','), table.holder, table.pending.join(','),
    table.finish.join(','), target?.kind, target?.value, target?.cards.length, faceList(hand),
    faceList(played), ...shown.map(faceList)].join('|')
  function deal(random: () => number) {
    const draw = [...unseen]
    for (let i = draw.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[draw[i], draw[j]] = [draw[j], draw[i]]
    }
    let dealt = 0
    return known.map((cards, s) => {
      const result = cards.concat(draw.slice(dealt, dealt + missing[s]))
      dealt += missing[s]
      return result
    })
  }
  const worlds: Card[][][] = []
  const ways = missing.filter(Boolean).length <= 1 ? Math.min(samples, 1) : samples
  const likelihood = inferFromHistory && ways > 1 ? dealLikelihood(table.history,missing,level) : null
  const random = generator(observation)
  const alternativeRandom = likelihood && generator(observation + '|behavior')
  for (let sample = 0; sample < ways; sample++) {
    let world = deal(random)
    if (likelihood && alternativeRandom) {
      const other = deal(alternativeRandom)
      const base = likelihood(world), alternative = likelihood(other)
      // For an unordered pair, each deal is retained with probability
      // proportional to its weight. Ties preserve the original uniform sample.
      if (alternativeRandom() < (alternative - base) / (alternative + base)) world = other
    }
    worlds.push(world)
  }
  return worlds
}
