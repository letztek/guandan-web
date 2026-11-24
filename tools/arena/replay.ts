// Rebuild every hand of collect.ts output with this game's engine and check
// it ends the way it was recorded. Also the starting point for a training loader.
//   node --experimental-strip-types tools/arena/replay.ts ~/danlm-data/*.jsonl.gz
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { takeTurn, type Match } from '../../src/match.ts'
import { allMoves, deck, type Card, type Move } from '../../src/rules.ts'
import { cardCode } from './njupt.ts'

export type HandRecord = {game: string, hand: number, level: string, scores: [string, string], owner: number,
  dealt: string[][], resisted: boolean, exchange: [number, number, string, string][], first: number,
  moves: {seat: number, cards: string[], kind?: string, value?: number, label?: string, q?: [string, string, string, number][],
    teacher?: {cards: string[], rank: string | null, flush?: boolean}}[],
  order: number[], gain: number, won: boolean}

export function readRecords(file: string): HandRecord[] {
  const text = file.endsWith('.gz') ? gunzipSync(readFileSync(file)).toString() : readFileSync(file, 'utf8')
  return text.split('\n').filter(Boolean).map(line => JSON.parse(line))
}

// The hand right after tribute and return, ready for the first play.
export function startOf(r: HandRecord): Match {
  const pool = deck()
  const take = (code: string) => {
    const index = pool.findIndex(c => cardCode(c) === code)
    if (index < 0) throw new Error('card ' + code + ' dealt twice')
    return pool.splice(index, 1)[0]
  }
  const hands: Card[][] = r.dealt.map(codes => codes.map(take))
  // Tribute and return cards are shown to the table, as in the game's own events.
  const events: Match['events'] = []
  for (const [from, to, code] of r.exchange) {
    const index = hands[from].findIndex(c => cardCode(c) === code)
    const card = hands[from].splice(index, 1)[0]
    hands[to].push(card)
    events.push({seat: -1, text: '', kind: 'system', trick: 1, reveal: {from, to, card}})
  }
  if (r.resisted) events.push({seat: -1, text: '', kind: 'system', trick: 1, resistedTribute: true})
  return {version: 2, hands, turn: r.first, level: r.level, scores: r.scores, owner: r.owner, handNo: r.hand, trick: 1,
    phase: 'play', target: null, holder: -1, pending: [], finish: [], events, exchange: null, won: false, gain: 0}
}

// Calls visit(state before the play, play index, the play) for each play, then checks the ending.
export function replay(r: HandRecord, visit?: (s: Match, index: number, move: Move | null) => void) {
  let s = startOf(r)
  r.moves.forEach((m, index) => {
    if (s.turn !== m.seat) throw new Error(`move ${index}: seat ${m.seat} played but it is seat ${s.turn}'s turn`)
    let move: Move | null = null
    if (m.cards.length) {
      const pool = [...s.hands[m.seat]]
      const cards = m.cards.map(code => pool.splice(pool.findIndex(c => cardCode(c) === code), 1)[0])
      move = allMoves(cards, s.level, true).find(x => x.kind === m.kind && x.value === m.value && x.label === m.label) ?? null
      if (!move) throw new Error(`move ${index}: ${m.cards.join(' ')} does not declare ${m.kind} ${m.label}`)
    }
    visit?.(s, index, move)
    s = takeTurn(s, m.seat, move)
  })
  const order = [...s.finish, ...[0, 1, 2, 3].filter(i => !s.finish.includes(i))]
  if (s.phase !== 'result' || order.join() !== r.order.join() || s.gain !== r.gain) {
    throw new Error(`ends ${order.join(',')} +${s.gain}, recorded ${r.order.join(',')} +${r.gain}`)
  }
  return s
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let hands = 0, decisions = 0, scored = 0, failed = 0
  for (const file of process.argv.slice(2)) {
    for (const r of readRecords(file)) {
      try {
        replay(r)
        hands++
        decisions += r.moves.length
        scored += r.moves.filter(m => m.q).length
      } catch (error) {
        failed++
        if (failed <= 5) console.log(`${file} ${r.game} hand ${r.hand}: ${(error as Error).message}`)
      }
    }
  }
  console.log(`${hands} hands replayed, ${failed} failed; ${decisions} plays, ${scored} with DanLM values`)
}
