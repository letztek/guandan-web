import test from 'node:test'
import assert from 'node:assert/strict'
import { advancedHandPlanner } from '../src/advanced-hand-plan.ts'
import { allMoves, deck } from '../src/rules.ts'

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

test('an advanced opening keeps a mixed straight instead of opening its lowest single', () => {
  const hand = handOf('S3-0','C4-0','D5-0','H6-0','S7-0','S9-0','HK-0','CK-0','DA-0')
  const plan = advancedHandPlanner(hand, '2', 'support')
  const spare = plan(play(hand, 'single', '9'))
  const split = plan(play(hand, 'single', '3'))
  assert.equal(spare.turns, 3) // straight, pair of kings and an ace
  assert.equal(split.turns, 7)
  assert.ok(spare.score > split.score)
})

test('a level heart fills a gap; either physical copy of an ordinary card preserves the same route', () => {
  const hand = handOf('C3-0','D4-0','S6-0','C7-0','H2-0','H9-0','SK-0','HK-0')
  const plan = advancedHandPlanner(hand, '2')
  assert.equal(plan(play(hand, 'single', '9')).turns, 2) // 3-4-(5)-6-7 plus kings
  assert.ok(plan(play(hand, 'single', '2')).turns > 2)
  const copies = handOf('S3-0','S3-1','C4-0','D5-0','H6-0','S7-0','H9-0','D9-0')
  const assess = advancedHandPlanner(copies, '2')
  for (const card of copies.slice(0,2)) {
    assert.equal(assess(allMoves([card], '2', true)[0]).turns, 2)
  }
})

test('equally long routes preserve the last bomb, particularly for the balanced style', () => {
  const hand = handOf('S8-0','C8-0','D8-0','H8-0','S3-0','C3-0','D3-0','S9-0','H9-0')
  const balanced = advancedHandPlanner(hand, '2', 'balanced')
  const attack = advancedHandPlanner(hand, '2', 'attack')
  const spend = play(hand, 'pair', '8 × 2')
  const keep = play(hand, 'pair', '9 × 2')
  assert.equal(balanced(spend).turns, balanced(keep).turns)
  assert.ok(balanced(keep).score > balanced(spend).score)
  assert.ok(attack(keep).score - attack(spend).score < balanced(keep).score - balanced(spend).score)
})
