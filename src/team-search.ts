import { names, type Card, type Move } from './rules.ts'
import { takeTurn, type Match } from './match.ts'
import { samplePublicHands } from './team-worlds.ts'
import { quickTeamSuggestion, type PublicTable } from './team-coach.ts'
import type { PlayStyle } from './play-style.ts'

type Face = Pick<Card, 'rank' | 'suit'>
export type Outcome = { value: number, teamFirst: number, teamDouble: number, enemyDouble: number }
export type SearchLine = { move: Move | null, outcomes: Outcome[], value: number }

// Play one sampled deal to the end of the hand. Every seat uses the standard
// table heuristic and sees only what it would see at the table: its own cards,
// hand sizes, played faces and still-held disclosures. The value is the deal
// result for our side, +3/+2/+1 when our team goes out first (by partner's
// place) and the negative of that when the opponents do.
export function playOut(world: Card[][], level: string, target: Move | null, table: PublicTable,
    first: Move | null, styles: (PlayStyle | undefined)[]): Outcome {
  const root = table.seat
  let game: Match = {version:2, hands:world, level, turn:root, scores:[level, level], owner:-1,
    handNo:1, trick:1, phase:'play', target, holder:table.holder, pending:table.pending,
    finish:table.finish, events:[], exchange:null, won:false, gain:0}
  const shown: Face[][] = table.shown.map(cards => cards.map(({rank, suit}) => ({rank, suit})))
  const played: Face[] = table.played.map(({rank, suit}) => ({rank, suit}))
  function record(seat: number, move: Move | null) {
    for (const card of move?.cards ?? []) {
      played.push({rank:card.rank, suit:card.suit})
      const index = shown[seat].findIndex(c => c.rank === card.rank && c.suit === card.suit)
      if (index >= 0) shown[seat].splice(index, 1)
    }
  }
  record(root, first)
  game = takeTurn(game, root, first)
  for (let ply = 0; ply < 400 && game.phase === 'play'; ply++) {
    const seat = game.turn
    const view: PublicTable = {seat, counts:game.hands.map(cards => cards.length), holder:game.holder,
      pending:[...game.pending], finish:[...game.finish], shown, played}
    // As at the table, the declaration on top is public but its physical copies are not.
    const top = game.target && {...game.target, as:{},
      cards:game.target.cards.map(({suit, rank}, i) => ({suit, rank, id:'table-' + i}))}
    const move = quickTeamSuggestion(game.hands[seat], level, top, view, styles[seat]).move
    record(seat, move)
    game = takeTurn(game, seat, move)
  }
  const ours = (seat: number) => seat % 2 === root % 2
  if (game.phase !== 'result') return {value:0, teamFirst:0, teamDouble:0, enemyDouble:0}
  const [winner, second] = game.finish
  const double = game.gain === 3
  return {value:ours(winner) ? game.gain : -game.gain, teamFirst:Number(ours(winner)),
    teamDouble:Number(double && ours(winner) && ours(second)), enemyDouble:Number(double && !ours(winner))}
}

// Every candidate faces the same sampled deals (common random numbers), so a
// difference reflects the choice rather than luckier hidden cards. Candidates
// are evaluated in order; past the time budget the remaining ones are skipped.
export function searchLines(hand: Card[], level: string, target: Move | null, table: PublicTable,
    candidates: (Move | null)[], samples: number, style?: PlayStyle, budgetMs = 3000): SearchLine[] | null {
  const worlds = samplePublicHands(hand, level, target, table, samples, true)
  if (!worlds.length) return null
  // Other seats' temperaments are not public; assume a steady player.
  const styles = [0, 1, 2, 3].map(seat => seat === table.seat ? style : 'balanced' as PlayStyle)
  const clock = globalThis.performance ?? Date
  const start = clock.now()
  const lines: SearchLine[] = []
  for (const move of candidates) {
    if (lines.length >= 2 && clock.now() - start > budgetMs) break
    const outcomes = worlds.map(world => playOut(world, level, target, table, move, styles))
    lines.push({move, outcomes, value:outcomes.reduce((sum, o) => sum + o.value, 0) / outcomes.length})
  }
  return lines
}

// A paired comparison on the same deals. With several unknown hands, the
// advantage must exceed z standard errors; a single deal is fully determined.
export function clearlyBetter(challenger: SearchLine, reference: SearchLine, z = 2) {
  const diffs = challenger.outcomes.map((o, i) => o.value - reference.outcomes[i].value)
  const mean = diffs.reduce((sum, d) => sum + d, 0) / diffs.length
  if (diffs.length === 1) return mean > 0
  const variance = diffs.reduce((sum, d) => sum + (d - mean) ** 2, 0) / (diffs.length - 1)
  return mean > z * Math.sqrt(variance / diffs.length)
}

function choiceName(move: Move | null) {
  return move ? names[move.kind] + ' ' + move.label : '過牌'
}
const percent = (line: SearchLine, key: Exclude<keyof Outcome, 'value'>) =>
  Math.round(100 * line.outcomes.reduce((sum, o) => sum + o[key], 0) / line.outcomes.length)

export function searchReason(chosen: SearchLine, reference: SearchLine) {
  const intro = '推演 ' + chosen.outcomes.length + ' 種可能的牌局到本副結束，選擇「' + choiceName(chosen.move) +
    '」而不是「' + choiceName(reference.move) + '」：'
  const [first, refFirst] = [percent(chosen, 'teamFirst'), percent(reference, 'teamFirst')]
  if (first > refFirst) return intro + '我方拿頭游的比例由 ' + refFirst + '% 提高到 ' + first + '%。'
  const [double, refDouble] = [percent(chosen, 'teamDouble'), percent(reference, 'teamDouble')]
  if (double > refDouble) return intro + '我方包辦前兩名的比例由 ' + refDouble + '% 提高到 ' + double + '%。'
  const [enemy, refEnemy] = [percent(chosen, 'enemyDouble'), percent(reference, 'enemyDouble')]
  if (enemy < refEnemy) return intro + '對手包辦前兩名的比例由 ' + refEnemy + '% 降到 ' + enemy + '%。'
  return intro + '平均每副多升 ' + (chosen.value - reference.value).toFixed(1) + ' 級。'
}
