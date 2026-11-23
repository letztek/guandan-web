// Feature encoding for the learned move scorer, version 1.
//
// Q(state, action) is scored for every legal play of the seat to move. Every
// feature is a small non-negative integer stored as one byte; the model
// multiplies by STATE_SCALE / ACTION_SCALE, which ship with the weights.
// Only what that seat can see is used: its own hand, hand sizes, faces played
// this hand, tribute faces still held (publicTable), levels and the table.
// Browser-safe: no Node imports, so the game can use the same code.
import { partner, publicTable, teamOf, type Match } from '../../src/match.ts'
import { allMoves, beats, ranks, remaining, wild, type Card, type Move } from '../../src/rules.ts'

export const FEATURE_VERSION = 1
export const KINDS = ['single', 'pair', 'triple', 'full', 'straight', 'pairs', 'steel', 'bomb', 'flush', 'kings']
const RANKS = [...ranks, 'SJ', 'BJ']
const SUITS = ['S', 'H', 'C', 'D']
const rankIndex = (rank: string) => RANKS.indexOf(rank)
const COPIES = RANKS.map(rank => rank === 'SJ' || rank === 'BJ' ? 2 : 8)

class Writer {
  values: number[] = []
  scales: number[] = []
  put(value: number, scale = 1) {
    this.values.push(Math.max(0, Math.min(255, Math.round(value))))
    this.scales.push(scale)
  }
  oneHot(index: number, size: number) {
    for (let i = 0; i < size; i++) this.put(Number(i === index))
  }
}

// Non-wild cards by rank, and wild cards (hearts of the level rank) separately.
function rankCounts(cards: Pick<Card, 'rank' | 'suit'>[], level: string) {
  const counts = RANKS.map(() => 0)
  let wilds = 0
  for (const c of cards) {
    if (wild(c as Card, level)) wilds++
    else counts[rankIndex(c.rank)]++
  }
  return {counts, wilds}
}
const relative = (seat: number, other: number) => (other - seat + 4) % 4
function bucket(count: number) {
  return count === 0 ? 0 : count <= 5 ? count : count <= 6 ? 6 : count <= 10 ? 7 : 8
}

function encodeState(w: Writer, s: Match, seat: number) {
  const hand = s.hands[seat], level = s.level
  const table = publicTable(s, seat)
  const mine = rankCounts(hand, level)
  for (const c of mine.counts) {
    w.put(c, 1 / 4)
    for (let t = 1; t <= 4; t++) w.put(Number(c >= t))
  }
  w.put(mine.wilds, 1 / 2)
  for (const suit of SUITS) for (const rank of ranks) {
    w.put(hand.filter(c => c.suit === suit && c.rank === rank && !wild(c, level)).length, 1 / 2)
  }
  // Faces each seat has played this hand, by relative seat.
  const played = [0, 1, 2, 3].map(() => RANKS.map(() => 0))
  for (const e of s.events) {
    if (e.kind === 'play' && e.move) for (const c of e.move.cards) played[relative(seat, e.seat)][rankIndex(c.rank)]++
  }
  for (const row of played) for (const n of row) w.put(n, 1 / 4)
  // Copies not in this hand and not yet played, wherever they are.
  const allPlayed = RANKS.map((_, r) => played.reduce((sum, row) => sum + row[r], 0))
  const own = RANKS.map((rank, r) => hand.filter(c => c.rank === rank).length)
  RANKS.forEach((_, r) => w.put(COPIES[r] - own[r] - allPlayed[r], 1 / 4))
  // Tribute and return faces another seat still holds.
  for (let k = 1; k < 4; k++) {
    const shown = table.shown[(seat + k) % 4]
    RANKS.forEach(rank => w.put(shown.filter(c => c.rank === rank).length, 1 / 2))
  }
  for (let k = 0; k < 4; k++) {
    const other = (seat + k) % 4, count = s.hands[other].length
    w.put(count, 1 / 27)
    w.oneHot(bucket(count), 9)
    w.put(s.finish.includes(other) ? s.finish.indexOf(other) + 1 : 0, 1 / 4)
  }
  w.oneHot(ranks.indexOf(level), ranks.length)
  w.put(ranks.indexOf(s.scores[teamOf(seat)]), 1 / 12)
  w.put(ranks.indexOf(s.scores[1 - teamOf(seat)]), 1 / 12)
  w.put(Number(s.owner === teamOf(seat)))
  const target = s.target
  w.put(Number(!target))
  w.oneHot(target ? KINDS.indexOf(target.kind) : -1, KINDS.length)
  w.put(target ? target.value : 0, 1 / 20)
  w.put(target ? target.cards.length : 0, 1 / 10)
  w.oneHot(target ? relative(seat, s.holder) : -1, 4)
  const after = s.pending.slice(1)
  w.put(Number(after.includes(partner(seat))))
  w.put(after.filter(other => teamOf(other) !== teamOf(seat)).length, 1 / 2)
}

function encodeAction(w: Writer, s: Match, seat: number, move: Move | null) {
  const hand = s.hands[seat], level = s.level
  w.put(Number(!move))
  w.oneHot(move ? KINDS.indexOf(move.kind) : -1, KINDS.length)
  w.put(move ? move.value : 0, 1 / 20)
  w.put(move ? move.cards.length : 0, 1 / 10)
  const used = rankCounts(move ? move.cards : [], level)
  for (const c of used.counts) w.put(c, 1 / 4)
  w.put(used.wilds, 1 / 2)
  const rest = move ? remaining(hand, move) : hand
  const left = rankCounts(rest, level)
  w.put(rest.length, 1 / 27)
  for (const c of left.counts) w.put(c, 1 / 4)
  w.put(left.wilds, 1 / 2)
  w.put(Number(!!move && rest.length === 0))
  w.put(Number(!!move && ['bomb', 'flush', 'kings'].includes(move.kind)))
  w.put(Number(!!move && !!s.target && s.holder === partner(seat)))
}

function dims() {
  const empty: Match = {version: 2, hands: [[], [], [], []], turn: 0, level: '2', scores: ['2', '2'], owner: 0, handNo: 1, trick: 1,
    phase: 'play', target: null, holder: -1, pending: [], finish: [], events: [], exchange: null, won: false, gain: 0}
  const st = new Writer(), ac = new Writer()
  encodeState(st, empty, 0)
  encodeAction(ac, empty, 0, null)
  return {state: st.scales, action: ac.scales}
}
const scales = dims()
export const STATE_DIM = scales.state.length
export const ACTION_DIM = scales.action.length
export const STATE_SCALE = scales.state
export const ACTION_SCALE = scales.action

export function stateFeatures(s: Match, seat = s.turn) {
  const w = new Writer()
  encodeState(w, s, seat)
  return Uint8Array.from(w.values)
}
export function actionFeatures(s: Match, move: Move | null, seat = s.turn) {
  const w = new Writer()
  encodeAction(w, s, seat, move)
  return Uint8Array.from(w.values)
}

// Every play this seat may make now; one per declaration, PASS first when following.
export function candidates(s: Match, seat = s.turn): (Move | null)[] {
  const moves = allMoves(s.hands[seat], s.level).filter(m => beats(m, s.target))
  return s.target ? [null, ...moves] : moves
}

// Two plays the model cannot tell apart (same features) count as one.
export function actionKey(s: Match, move: Move | null, seat = s.turn) {
  return actionFeatures(s, move, seat).join(',')
}
