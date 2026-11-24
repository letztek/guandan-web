// Feature encoding for the learned move scorer, version 2 (version 1 plus play history).
//
// Q(state, action) is scored for every legal play of the seat to move. Every
// feature is a small non-negative integer stored as one byte; the model
// multiplies by STATE_SCALE / ACTION_SCALE, which ship with the weights.
// Only what that seat can see is used: its own hand, hand sizes, faces played
// this hand, tribute faces still held (publicTable), levels and the table.
// Browser-safe: no Node imports, so the game can use the same code.
import { partner, publicTable, teamOf, type Match } from '../../src/match.ts'
import { allMoves, beats, ranks, remaining, wild, type Card, type Move } from '../../src/rules.ts'

export const FEATURE_VERSION = 2
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
  encodeHistory(w, s, seat)
}

// Version 2: what the public play record says beyond the faces played.
// Seats are relative to the viewer: 0 itself, 1 the next seat, 2 partner, 3 the previous seat.
const READ_KINDS = ['single', 'pair', 'triple', 'full']
export function playHistory(s: Match, seat = s.turn) {
  // latest[k]: undefined has not acted this trick, null passed, else the play.
  const latest: (Move | null | undefined)[] = [undefined, undefined, undefined, undefined]
  const tally = [0, 1, 2, 3].map(() => ({plays: 0, passes: 0, leads: 0, bombs: 0, ledKinds: KINDS.map(() => 0),
    passedUnder: READ_KINDS.map(() => 0)}))
  let target: Move | null = null, holder = -1, trick = -1, playsThisTrick = 0
  let lastTrick = {winner: -1, lead: ''}, thisTrick = {winner: -1, lead: ''}
  for (const e of s.events) {
    if (e.kind !== 'play' && e.kind !== 'pass') continue
    if (e.trick !== trick) {
      if (trick !== -1) lastTrick = thisTrick
      thisTrick = {winner: -1, lead: ''}
      trick = e.trick
      target = null
      holder = -1
      playsThisTrick = 0
      latest.fill(undefined)
    }
    const k = relative(seat, e.seat), t = tally[k]
    if (e.kind === 'play' && e.move) {
      t.plays++
      if (!target) {t.leads++; t.ledKinds[KINDS.indexOf(e.move.kind)]++; thisTrick.lead = e.move.kind}
      if (['bomb', 'flush', 'kings'].includes(e.move.kind)) t.bombs++
      target = e.move
      holder = e.seat
      thisTrick.winner = e.seat
      playsThisTrick++
      latest[k] = e.move
    } else {
      t.passes++
      latest[k] = null
      // Passing on an opponent's trick suggests nothing bigger of that kind.
      const r = target ? READ_KINDS.indexOf(target.kind) : -1
      if (target && r >= 0 && teamOf(holder) !== teamOf(e.seat)) t.passedUnder[r] = Math.max(t.passedUnder[r], target.value)
    }
  }
  // The last trick may have just ended, with nothing played yet in the new one.
  if (trick !== -1 && trick !== s.trick) {
    lastTrick = thisTrick
    latest.fill(undefined)
    playsThisTrick = 0
  }
  return {latest, tally, playsThisTrick,
    lastWinner: lastTrick.winner < 0 ? -1 : relative(seat, lastTrick.winner), lastLead: lastTrick.lead}
}

function encodeHistory(w: Writer, s: Match, seat: number) {
  const h = playHistory(s, seat)
  for (let k = 1; k < 4; k++) {
    const m = h.latest[k]
    w.oneHot(m === undefined ? 0 : m === null ? 1 : 2, 3)
    w.oneHot(m ? KINDS.indexOf(m.kind) : -1, KINDS.length)
    w.put(m ? m.value : 0, 1 / 20)
    w.put(m ? m.cards.length : 0, 1 / 10)
  }
  w.put(s.trick, 1 / 30)
  w.put(h.playsThisTrick, 1 / 8)
  w.oneHot(h.lastWinner, 4)
  w.oneHot(KINDS.indexOf(h.lastLead), KINDS.length)
  for (const t of h.tally) {
    w.put(t.plays, 1 / 10)
    w.put(t.passes, 1 / 10)
    w.put(t.leads, 1 / 10)
    w.put(t.bombs, 1 / 4)
  }
  for (let k = 1; k < 4; k++) for (const n of h.tally[k].ledKinds) w.put(n, 1 / 4)
  for (let k = 1; k < 4; k++) for (const v of h.tally[k].passedUnder) w.put(v, 1 / 20)
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
