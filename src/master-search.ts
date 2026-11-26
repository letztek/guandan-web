// 大師 with look-ahead: the move model proposes a few candidates, each is
// played on the same sampled guesses of the hidden hands, the model plays all
// four seats for the next trick or two, and the model's own value of the
// position reached decides. The model's first choice stands unless another
// candidate is clearly better, and the search stops when its time is up.
import { takeTurn, type Match } from './match.ts'
import type { Move } from './rules.ts'
import type { MoveScorer } from './move-scorer.ts'
import type { PublicTable } from './team-coach.ts'
import { samplePublicHands } from './team-worlds.ts'

export type SearchOptions = {
  candidates?: number   // how many of the model's best plays to compare
  horizon?: number      // tricks to play forward before asking the model for a value
  worlds?: number       // most guesses of the hidden hands
  budgetMs?: number     // stop sampling more guesses after this long
  gap?: number          // skip the search when the model's first choice leads by this much
  z?: number            // how sure a challenger must be (paired z score) to replace the first choice
  maxCards?: number     // search only once at most this many cards are left in all hands (endgame)
  leaf?: 'q' | 'value'  // judge the look-ahead's end by our side's next best Q, or by the value head
                        // V for whoever moves next (one scale for all seats, so its sign flips across sides)
  now?: () => number
}
export type SearchLine = {move: Move | null, prior: number, values: number[], mean: number}
export type SearchResult = {move: Move | null, prior: {move: Move | null, q: number}[], searched: boolean,
  lines: SearchLine[], worlds: number, elapsedMs: number, changed: boolean}

const defaults = {candidates: 4, horizon: 1, worlds: 12, budgetMs: 600, gap: 0.6, z: 1.5, leaf: 'q' as 'q' | 'value'}

// Play `move` on one guess of the hidden hands, let the model play every seat
// until `horizon` tricks have ended, then on to the next decision by our own
// side, and return the model's value there (its best Q, our side's view). A
// finished hand counts what it actually scored. Values always come from our
// side's own decisions: the model's Q for an opponent, sign flipped, is not on
// the same scale (it overrates what our bombs win, for one).
export function playForward(world: Match['hands'], view: Match, move: Move | null, prior: number,
    scorer: MoveScorer, horizon: number, leaf: 'q' | 'value' = 'q') {
  const root = view.turn
  const ours = (seat: number) => seat % 2 === root % 2
  let g: Match = {...view, hands: world.map(h => [...h])}
  g = takeTurn(g, root, move)
  for (let ply = 0; ply < 80 && g.phase === 'play'; ply++) {
    const seat = g.turn
    if (leaf === 'value' && g.trick >= view.trick + horizon) {
      const v = scorer.stateValue(g)
      return ours(seat) ? v : -v
    }
    const {move: next, values} = scorer.choose(g)
    if (leaf === 'q' && g.trick >= view.trick + horizon && ours(seat)) return values[0].q
    g = takeTurn(g, seat, next)
  }
  if (g.phase === 'result') return (ours(g.finish[0]) ? 1 : -1) * g.gain
  return prior
}

const key = (m: Move | null) => m ? m.kind + '/' + m.label + '/' + m.cards.length : 'pass'

// view: the match as the seat to move sees it (publicView); table: its public
// table with history, used to guess hidden hands consistent with the play so far.
export function searchMove(view: Match, table: PublicTable, scorer: MoveScorer, options: SearchOptions = {}): SearchResult {
  const o = {...defaults, ...options}
  const clock = o.now ?? (() => (globalThis.performance ?? Date).now())
  const started = clock()
  const {move: first, values: prior} = scorer.choose(view)
  const result = (lines: SearchLine[] = [], worlds = 0, chosen = first): SearchResult =>
    ({move: chosen, prior, searched: lines.length > 0, lines, worlds, elapsedMs: clock() - started, changed: key(chosen) !== key(first)})
  if (prior.length < 2 || prior[0].q - prior[1].q > o.gap) return result()
  // Guessed hands are least reliable early on, when most cards are unseen; there the
  // search overrates plays that only work if the opponents lack specific cards.
  if (o.maxCards !== undefined && view.hands.reduce((n, h) => n + h.length, 0) > o.maxCards) return result()
  const hand = view.hands[view.turn]
  // A play that goes out is final; nothing to compare.
  if (first && first.cards.length === hand.length) return result()
  const guesses = samplePublicHands(hand, view.level, view.target, table, o.worlds, true)
  if (!guesses.length) return result()
  const lines: SearchLine[] = prior.slice(0, o.candidates).map(p => ({move: p.move, prior: p.q, values: [], mean: 0}))
  let worlds = 0
  for (const world of guesses) {
    for (const line of lines) line.values.push(playForward(world, view, line.move, line.prior, scorer, o.horizon, o.leaf))
    worlds++
    if (clock() - started > o.budgetMs) break
  }
  for (const line of lines) line.mean = line.values.reduce((a, b) => a + b, 0) / line.values.length
  // Keep the model's first choice unless a challenger beats it on the same guesses by z standard errors.
  const reference = lines[0]
  let best = reference
  for (const line of lines.slice(1)) {
    if (worlds < 2 || line.mean <= best.mean) continue
    const diffs = line.values.map((v, i) => v - reference.values[i])
    const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length
    const variance = diffs.reduce((a, d) => a + (d - mean) ** 2, 0) / (diffs.length - 1)
    if (mean > 0 && mean > o.z * Math.sqrt(variance / diffs.length + 1e-9)) best = line
  }
  return result(lines, worlds, best.move)
}
