import test from 'node:test'
import assert from 'node:assert/strict'
import { adviceInput, shufflePack, startMatch, takeTurn } from '../src/match.ts'
import { advancedHandPlanner } from '../src/advanced-hand-plan.ts'
import { allMoves, beats, deck, wild } from '../src/rules.ts'
import { quickTeamSuggestion, teamSuggestion } from '../src/team-coach.ts'

const stock = new Map(deck().map(card => [card.id, card]))
const handOf = (...ids) => ids.map(id => {
  assert.ok(stock.has(id), id)
  return stock.get(id)
})
const play = (hand, kind, label) => {
  const move = allMoves(hand, '2').find(move => move.kind === kind && move.label === label)
  assert.ok(move, kind + ' ' + label)
  return move
}
function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

test('following sheds a pair on someone else\'s lead without spending one of our own leads', () => {
  // The fives would otherwise travel with the nines as a full house.
  const hand = handOf('S9-0','C9-0','D9-0','S5-0','C5-0','S7-0','HK-0','CQ-0','DA-0')
  const plan = advancedHandPlanner(hand, '2')
  const fives = play(hand, 'pair', '5 × 2')
  assert.equal(plan(fives, true).turns, plan(fives, false).turns)
  assert.ok(plan(fives, true).score >= 0, 'a follow never costs a lead')
  assert.ok(plan(fives, false).score < 0, 'leading the fives does cost one')
})

test('advanced seats contest an opening low pair when they hold a natural pair that beats it', () => {
  let faced = 0, followed = 0
  for (let seed = 1; seed <= 40; seed++) {
    const random = seeded(seed * 7919)
    let game = {...startMatch(shufflePack(random), random), turn: 0}
    const lowPair = allMoves(game.hands[0], game.level)
      .filter(m => m.kind === 'pair' && m.value <= 8 && !m.cards.some(c => wild(c, game.level)))
      .sort((a, b) => a.value - b.value)[0]
    if (!lowPair) continue
    game = takeTurn(game, 0, lowPair)
    const canBeat = allMoves(game.hands[1], game.level).some(m => m.kind === 'pair' &&
      beats(m, game.target) && !m.cards.some(c => wild(c, game.level)))
    if (!canBeat) continue
    for (const style of ['support', 'balanced', 'attack']) {
      const {hand, level, target, table} = adviceInput(game, 'advanced', style)
      faced++
      if (quickTeamSuggestion(hand, level, target, table, style, true).move) followed++
    }
  }
  assert.ok(faced >= 30, 'enough openings to compare')
  // Before this was fixed, about half of these pairs were let through.
  assert.ok(followed / faced >= .9, followed + '/' + faced)
})

test('the last seat to act does not hand an opponent the lead just to keep a triple intact', () => {
  // Seat 0 leads a pair of fours. Seat 3's partner (seat 1) and seat 2 have passed.
  const hand = handOf('S9-0','C9-0','D9-0','S3-0','D6-0','CJ-0','DQ-0','SK-0','HA-0','S10-0')
  const target = allMoves(handOf('S4-1','C4-1'), '2', true).find(m => m.kind === 'pair')
  const table = {seat:3, holder:0, pending:[3], counts:[25,20,22,hand.length], finish:[],
    shown:[[],[],[],[]], played:target.cards}
  const advice = teamSuggestion(hand, '2', target, table, 'standard', 'balanced')
  assert.equal(advice.move?.kind, 'pair')
  assert.equal(advice.move.label, '9 × 2')
  // While the partner holds the trick, the same hand still lets it run.
  const partnerTable = {...table, holder:1}
  assert.equal(teamSuggestion(hand, '2', target, partnerTable, 'standard', 'balanced').move, null)
})
