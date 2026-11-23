// Translation between this game's cards/moves and the JSON protocol used by
// the NJUPT GuanDan AI competition (the protocol the published baseline bots
// and the OpenGuanDan server speak). Only the arena uses this file.
import { allMoves, beats, power, ranks, type Card, type Move } from '../../src/rules.ts'

// The protocol spells a pass as ["PASS", "PASS", "PASS"].
export type Action = [string, string, string[] | 'PASS']

export const rankCode = (rank: string) => rank === '10' ? 'T' : rank === 'SJ' ? 'B' : rank === 'BJ' ? 'R' : rank
export function cardCode(card: Card) {
  if (card.rank === 'SJ') return 'SB'
  if (card.rank === 'BJ') return 'HR'
  return card.suit + rankCode(card.rank)
}

const pattern: Record<string, string> = {
  single: 'Single', pair: 'Pair', triple: 'Trips', pairs: 'ThreePair', full: 'ThreeWithTwo',
  steel: 'TwoTrips', straight: 'Straight', flush: 'StraightFlush', bomb: 'Bomb', kings: 'Bomb',
}
const patternOrder = ['Single', 'Pair', 'Trips', 'ThreePair', 'ThreeWithTwo', 'TwoTrips', 'Straight', 'StraightFlush', 'Bomb']
const chain = ['A', ...ranks]

// The rank a declaration claims: grouped moves by their power, runs by their
// lowest rank (an A-low run claims A), four kings by the competition's JOKER.
export function declaredRank(move: Move, level: string) {
  if (move.kind === 'kings') return 'JOKER'
  if (['straight', 'flush', 'pairs', 'steel'].includes(move.kind)) return rankCode(chain[move.value])
  if (move.value === 16) return rankCode(level)
  if (move.value === 17) return 'B'
  if (move.value === 18) return 'R'
  return rankCode(ranks[move.value - 2])
}

export function toAction(move: Move | null, level: string): Action {
  if (!move) return ['PASS', 'PASS', 'PASS']
  return [pattern[move.kind], declaredRank(move, level), move.cards.map(cardCode)]
}

function sortKey(move: Move) {
  const order = patternOrder.indexOf(pattern[move.kind])
  return [order, move.kind === 'kings' ? 99 : move.kind === 'bomb' ? move.cards.length * 100 + move.value : move.value]
}

// Legal plays in the competition's layout: PASS first when following, then
// grouped by pattern and ascending in rank, the way the original server lists them.
export function legalActions(hand: Card[], level: string, target: Move | null) {
  const moves = allMoves(hand, level).filter(m => beats(m, target)).sort((a, b) => {
    const [pa, va] = sortKey(a), [pb, vb] = sortKey(b)
    return pa - pb || va - vb
  })
  const options: (Move | null)[] = target ? [null, ...moves] : moves
  return { options, actions: options.map(m => toAction(m, level)) }
}

export function handCodes(hand: Card[], level: string) {
  const suitOrder = 'SHCDJ'
  return [...hand].sort((a, b) => power(a.rank, level) - power(b.rank, level) ||
    suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit)).map(cardCode)
}
