import { partner, takeTurn, type Match } from './match.ts'
import { allMoves, beats, uid, type Card, type Move } from './rules.ts'
import type { PublicTable } from './team-coach.ts'
import { controlCost } from './control-cost.ts'

const seats = [0, 1, 2, 3]
type MoveCache = Map<string, Move[]>

function declarations(hand: Card[], level: string, cache: MoveCache) {
  const key = level + '/' + hand.map(uid).join(',')
  let moves = cache.get(key)
  if (!moves) {
    moves = allMoves(hand, level)
    cache.set(key, moves)
  }
  return moves
}

// Rough willingness to follow when only the count is known. A fully shown
// short hand can instead be tested against the declaration exactly.
function finishThreat(move: Move, count: number, exposedFinish: Move[] | null) {
  if (exposedFinish) return exposedFinish.some(candidate => beats(candidate, move)) ? 1 : 0
  if (count === 0 || move.cards.length !== count) return 0
  const chance = Math.max(0, (18 - move.value) / 15)
  if (move.kind === 'single') return chance
  if (move.kind === 'pair') return chance * .25
  if (move.kind === 'triple') return chance * .1
  return 0
}

function continuePlay(hand: Card[], level: string, turn: number, target: Move | null, holder: number,
    pending: number[], counts: number[], shown: Card[][], cache: MoveCache): Move | null {
  const legal = declarations(hand, level, cache).filter(move => beats(move, target))
  if (!legal.length) return null
  const finishes = legal.filter(move => move.cards.length === hand.length)
  if (finishes.length) return finishes.reduce((best, next) => beats(next, best) ? next : best)

  const mate = partner(turn)
  const enemies = [(turn + 1) % 4, (turn + 3) % 4]
  const exposedFinish = seats.map(seat => {
    if (seat === turn || !counts[seat] || counts[seat] > 6 || counts[seat] !== shown[seat].length) return null
    return declarations(shown[seat], level, cache).filter(move => move.cards.length === counts[seat])
  })
  function danger(move: Move, responders: number[]) {
    return Math.max(0, ...enemies.filter(s => responders.includes(s))
      .map(s => finishThreat(move, counts[s], exposedFinish[s])))
  }
  const partnerHolds = !!target && holder === mate
  const dangerIfPassed = target ? danger(target, pending.slice(1)) : 0
  const twoSingles = hand.length === 2 && !declarations(hand, level, cache).some(move => move.kind === 'pair')
  // With two singles, crossing a teammate's low lead can be the handoff
  // that lets us shed the first card now and lead the last next trick.
  const acceptFeed = twoSingles && target?.kind === 'single' && counts[mate] > 1
  if (partnerHolds && dangerIfPassed < .18 && !acceptFeed) return null
  const shortEnemyLeads = target && enemies.includes(holder) && counts[holder] <= 2
  const mateCount = counts[mate]
  const countsByRank = new Map<string, number>()
  for (const card of hand) countsByRank.set(card.rank, (countsByRank.get(card.rank) ?? 0) + 1)
  let best: Move | null = null
  let bestScore = target ? (partnerHolds ? 0 : -5 - (shortEnemyLeads ? 19 : 0)) - 65 * dangerIfPassed : -Infinity
  for (const move of legal) {
    const size = move.cards.length
    const risk = danger(move, enemies)
    const bomb = ['bomb','flush','kings'].includes(move.kind)
    let score = size * 2 - move.value * .25 - 65 * risk - controlCost(move,level)
    if (bomb) score -= hand.length - size <= 2 || shortEnemyLeads ? 8 : 29
    if (move.kind === 'single' && (countsByRank.get(move.cards[0].rank) ?? 0) > 1) score -= 4
    if (twoSingles && move.kind === 'single') score += move.value * 1.3
    if (partnerHolds && !acceptFeed) score -= 15

    if (mateCount > 0 && mateCount <= 2) {
      const chance = finishThreat(move, mateCount, exposedFinish[mate])
      score += 38 * chance
      // Two hidden cards can be separate singles. Initiate a handoff
      // with a small card if the partner has room to play over it.
      const canFeedSingle = !exposedFinish[mate]?.length
      if (!target && mateCount === 2 && canFeedSingle && move.kind === 'single') {
        score += Math.max(0, 17 - move.value)
      }
    }
    if (score > bestScore) { best = move; bestScore = score }
  }
  return best
}

// The cheapest non-bomb play that beats the target, if any.
function plainAnswer(hand: Card[], level: string, target: Move, cache: MoveCache) {
  const plain = declarations(hand, level, cache).filter(move =>
    !['bomb','flush','kings'].includes(move.kind) && beats(move, target))
  plain.sort((a, b) => a.value - b.value || Object.keys(a.as).length - Object.keys(b.as).length)
  return plain[0] ?? null
}

export function rollout(world: Card[][], level: string, target: Move | null, table: PublicTable,
    first: Move | null, cache: MoveCache, watchTen = false, advanced = false) {
  const root = table.seat, mate = partner(root)
  const sameTeam = (seat: number) => seat === root || seat === mate
  // Reuse actual match transitions for pass re-entry, wind and settlement.
  // Input hands here are always synthetic deals conditioned on public faces.
  let game: Match = {version:2, hands:world, level, turn:root, scores:[level, level], owner:-1,
    handNo:1, trick:1, phase:'play', target, holder:table.holder, pending:table.pending,
    finish:table.finish, events:[], exchange:null, won:false, gain:0}
  const shown = table.shown.map(cards => cards.map((card, i) =>
    ({...card, id:'public-' + card.suit + '-' + card.rank + '-' + i})))
  let matePlays = 0, mateLeads = 0, ownLeads = 0
  let nextRootLead: Move | null = null
  for (let ply = 0; ply < 36 && game.phase === 'play'; ply++) {
    // Once first place is settled, see whether its partner can also go out.
    // Two extra tricks are useful only when someone still in play is close.
    const raceForPlaces=advanced && game.finish.length>0 &&
      game.hands.some(cards=>cards.length>0 && cards.length<=6)
    if (game.trick>(raceForPlaces ? 5 : 3)) break
    const turn = game.turn
    let move = ply === 0 ? first : continuePlay(game.hands[turn], level, turn, game.target,
      game.holder, game.pending, game.hands.map(cards => cards.length), shown, cache)
    // Real opponents seldom let our trick stand when a plain answer beats it.
    if (ply > 0 && !move && game.target && !sameTeam(turn) && sameTeam(game.holder)) {
      move = plainAnswer(game.hands[turn], level, game.target, cache)
    }
    if (!game.target && turn === mate) mateLeads++
    if (!game.target && turn === root) ownLeads++
    if (ply > 0 && turn === root && !game.target && !nextRootLead) nextRootLead = move
    if (move) {
      if (turn === mate) matePlays++
      for (const card of move.cards) {
        const index = shown[turn].findIndex(c => c.rank === card.rank && c.suit === card.suit)
        if (index >= 0) shown[turn].splice(index, 1)
      }
    }
    game = takeTurn(game, turn, move)
  }

  const finish = game.finish
  const mateOut = Number(finish.includes(mate) && !game.hands[mate].length)
  const rootOut = Number(finish.includes(root) && !game.hands[root].length)
  const enemyFirst = Number(finish.length > 0 && !sameTeam(finish[0]))
  let enemyReady = 0
  let score = 0
  if (finish.length) {
    const firstTeam = sameTeam(finish[0]) ? 1 : -1
    const partnerPlace = finish.indexOf(partner(finish[0]))
    score = firstTeam * (150 + (partnerPlace === 1 ? 50 : partnerPlace === 2 ? 23 : 0))
  }
  // Break horizon ties using progress and who can act next. The partial
  // position has less weight than a place actually secured in play.
  if (game.phase !== 'result') {
    const progress = (seat: number) => {
      const count = game.hands[seat].length
      if (count === 0) return 9
      return Math.min(5, table.counts[seat] - count) + 6 / count
    }
    score += progress(root) + progress(mate) * 1.2 - progress((root + 1) % 4) - progress((root + 3) % 4)
    const nextLead = game.target ? game.holder : game.turn
    const liveLead = game.hands[nextLead].length ? nextLead : partner(nextLead)
    score += sameTeam(liveLead) ? 3 : -3
    // Estimate the risk beyond the horizon on this hypothetical deal: a seat
    // that can go out in one play is more dangerous when it also holds the lead.
    if (watchTen && !finish.length) {
      for (const enemy of [(root+1)%4,(root+3)%4]) {
        if (table.counts[enemy] > 10) continue
        const left = game.hands[enemy]
        if (declarations(left,level,cache).some(play => play.cards.length===left.length)) {
          enemyReady = 1
          score -= enemy===liveLead ? 24 : 10
        }
      }
    }
  }
  const teamFirst=Number(finish.length>0 && sameTeam(finish[0]))
  const teamDouble=Number(teamFirst && finish.length>1 && sameTeam(finish[1]))
  const enemyDouble=Number(enemyFirst && finish.length>1 && !sameTeam(finish[1]))
  const teamThird=Number(finish.length>2 && sameTeam(finish[2]))
  return {score, mateOut, rootOut, matePlays, mateLeads, ownLeads, nextRootLead, enemyFirst, enemyReady,
    teamFirst, teamDouble, enemyDouble, teamThird, tricks:game.trick - 1}
}
