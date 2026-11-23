import test from 'node:test'
import assert from 'node:assert/strict'
import { allMoves, deck } from '../src/rules.ts'
import { cardCode, handCodes, legalActions, toAction } from '../tools/arena/njupt.ts'

const pool = deck()
// Card ids are suit + rank + copy; jokers are JSJ-n / JBJ-n.
const take = (...ids) => ids.map(id => pool.find(c => c.id === id))
const find = (hand, level, kind, test = () => true) => allMoves(hand, level).find(m => m.kind === kind && test(m))

test('cards use the competition spelling: T for ten, SB and HR for the jokers', () => {
  assert.deepEqual(take('S10-0', 'HA-0', 'JSJ-0', 'JBJ-1').map(cardCode), ['ST', 'HA', 'SB', 'HR'])
})

test('runs claim their lowest rank, and an A-low straight claims A', () => {
  const low = take('SA-0', 'H2-0', 'C3-0', 'D4-0', 'S5-0')
  assert.deepEqual(toAction(find(low, '9', 'straight'), '9'), ['Straight', 'A', ['SA', 'H2', 'C3', 'D4', 'S5']])
  const high = take('S10-0', 'HJ-0', 'CQ-0', 'DK-0', 'SA-0')
  assert.equal(toAction(find(high, '9', 'straight'), '9')[1], 'T')
  const steel = take('S10-0', 'H10-0', 'C10-0', 'SJ-0', 'HJ-0', 'CJ-0')
  assert.deepEqual(toAction(find(steel, '2', 'steel'), '2').slice(0, 2), ['TwoTrips', 'T'])
})

test('a full house claims its triple; four kings are the JOKER bomb', () => {
  const hand = take('S7-0', 'H7-0', 'C7-0', 'S10-0', 'H10-0')
  assert.deepEqual(toAction(find(hand, '2', 'full'), '2'), ['ThreeWithTwo', '7', ['S7', 'H7', 'C7', 'ST', 'HT']])
  const kings = take('JSJ-0', 'JSJ-1', 'JBJ-0', 'JBJ-1')
  assert.deepEqual(toAction(find(kings, '2', 'kings'), '2'), ['Bomb', 'JOKER', ['SB', 'SB', 'HR', 'HR']])
})

test('the level rank and a wild keep the declared rank', () => {
  const hand = take('S5-0', 'H5-0', 'H9-0')
  assert.deepEqual(toAction(find(hand, '5', 'pair', m => m.cards.every(c => c.rank === '5')), '5'), ['Pair', '5', ['S5', 'H5']])
  const wildPair = find(hand, '5', 'pair', m => m.cards.some(c => c.rank === '9'))
  assert.deepEqual(toAction(wildPair, '5'), ['Pair', '9', ['H9', 'H5']])
})

test('following lists PASS first; leading has no PASS; hands sort by power', () => {
  const hand = take('S3-0', 'S9-0', 'H9-0')
  const target = find(take('C4-0'), '2', 'single')
  const following = legalActions(hand, '2', target)
  assert.deepEqual(following.actions[0], ['PASS', 'PASS', 'PASS'])
  assert.equal(following.options[0], null)
  assert.ok(following.actions.slice(1).every(a => a[0] !== 'PASS'))
  const leading = legalActions(hand, '2', null)
  assert.ok(leading.actions.every(a => a[0] !== 'PASS'))
  assert.deepEqual(leading.actions.map(a => a[0]), ['Single', 'Single', 'Pair'])
  assert.deepEqual(handCodes(take('JBJ-0', 'S9-0', 'H2-0', 'S3-0'), '2'), ['S3', 'S9', 'H2', 'HR'])
})
