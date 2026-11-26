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

test('DanLM names runs by their highest rank, and the flush flag separates wild-built runs', async () => {
  const { danlmRank, danlmMove } = await import('../tools/arena/danlm-client.ts')
  const run = (ids, level, kind) => find(take(...ids), level, kind)
  assert.equal(danlmRank(run(['SA-0', 'H2-0', 'C3-0', 'D4-0', 'S5-0'], '9', 'straight'), '9'), '5')
  assert.equal(danlmRank(run(['S10-0', 'HJ-0', 'CQ-0', 'DK-0', 'SA-0'], '9', 'straight'), '9'), 'A')
  assert.equal(danlmRank(run(['S3-0', 'H3-0', 'S4-0', 'H4-0', 'S5-0', 'H5-0'], '9', 'pairs'), '9'), '5')
  assert.equal(danlmRank(run(['S7-0', 'H7-0', 'C7-0', 'S8-0', 'H8-0', 'C8-0'], '2', 'steel'), '2'), '8')
  assert.equal(danlmRank(find(take('S9-0', 'H9-0'), '2', 'pair'), '2'), '9')
  // Four hearts and the heart level card: a straight flush or a plain straight, both up to 7.
  const hand = take('H3-0', 'H4-0', 'H5-0', 'H6-0', 'H2-0')
  const s = {hands: [hand, [], [], []], level: '2', target: null}
  const cards = hand.map(cardCode)
  assert.equal(danlmMove(s, 0, {cards, rank: '7', type: 'flushbomb'}).move.kind, 'flush')
  const plain = danlmMove(s, 0, {cards, rank: '7', type: 'straight'})
  assert.equal(plain.move.kind, 'straight')
  assert.equal(danlmRank(plain.move, '2'), '7')
  assert.equal(plain.guessed, false)
  // Teacher labels recorded before bridge version 3 carry only the flush flag.
  assert.equal(danlmMove(s, 0, {cards, rank: '7', flush: true}).move.kind, 'flush')
  assert.equal(danlmMove(s, 0, {cards, rank: '7', flush: false}).move.kind, 'straight')
})

// Cards by competition code; repeated codes take the second copy.
function deal(...seats) {
  const left = deck()
  return seats.map(codes => codes.split(' ').map(code => left.splice(left.findIndex(c => cardCode(c) === code), 1)[0]))
}
const table = (hands, level) => ({version: 2, hands, turn: 0, level, scores: [level, level], owner: 0, handNo: 1, trick: 1,
  phase: 'play', target: null, holder: -1, pending: [], finish: [], events: [], exchange: null, won: false, gain: 0})

test('DanLM type and rank find every declaration of the plays seen in dropped games', async () => {
  const { danlmMove, danlmRank, danlmType } = await import('../tools/arena/danlm-client.ts')
  // [cards, level, every [DanLM type, rank, this game's kind, value] the cards can declare]
  const plays = [
    ['H5 S6 C6 D5 D6', '5', [['fullhouse', '6', 'full', 6]]],        // H5 wild: pair of 5s
    ['H5 S6 C6 D5 D6', '6', [['fullhouse', '6', 'full', 16]]],       // triple of the level rank
    ['H8 S7 C8 D7 D8', '8', [['fullhouse', '7', 'full', 7], ['fullhouse', '8', 'full', 16]]],  // H8 joins either triple
    ['H8 S7 C8 D7 D8', '7', [['fullhouse', '8', 'full', 8]]],
    ['HK CK CK DK', 'K', [['normalbomb', 'K', 'bomb', 16]]],
    ['HK CK CK DK', '2', [['normalbomb', 'K', 'bomb', 13]]],
  ]
  for (const [codes, level, expected] of plays) {
    const [hand] = deal(codes)
    const named = [...new Set(allMoves(hand, level, true).map(m => [danlmType(m), danlmRank(m, level), m.kind, m.value].join()))]
    assert.deepEqual(named.sort(), expected.map(e => e.join()).sort(), `${codes} at level ${level}`)
    for (const [type, rank, kind, value] of expected) {
      const {move, guessed} = danlmMove(table([hand, [], [], []], level), 0, {cards: codes.split(' '), rank, type})
      assert.deepEqual([move.kind, move.value, guessed], [kind, value, false], `${codes} at level ${level} as ${type} ${rank}`)
    }
  }
})

test('two wild cards: the type separates a 5-card bomb from a full house, and two triples from three pairs', async () => {
  const { danlmMove, danlmRank, danlmStep } = await import('../tools/arena/danlm-client.ts')
  const read = (codes, level, rank, type) => {
    const [hand] = deal(codes)
    return danlmMove(table([hand, [], [], []], level), 0, {cards: codes.split(' '), rank, type})
  }
  // Three 4s and both heart 5s at level 5: DanLM's full house of 4s reads the wild cards as a pair of 5s.
  const full = read('S4 C4 D4 H5 H5', '5', '4', 'fullhouse')
  assert.deepEqual([full.move.kind, full.move.label, full.guessed], ['full', '4 帶 5', false])
  assert.deepEqual(full.move.as, {})
  const bomb = read('S4 C4 D4 H5 H5', '5', '4', 'normalbomb')
  assert.deepEqual([bomb.move.kind, bomb.move.cards.length, bomb.guessed], ['bomb', 5, false])
  // Both cross back to DanLM with their type; the rank is 4 either way.
  assert.deepEqual([danlmStep(0, full.move, '5').type, danlmStep(0, full.move, '5').rank], ['fullhouse', '4'])
  assert.deepEqual([danlmStep(0, bomb.move, '5').type, danlmStep(0, bomb.move, '5').rank], ['normalbomb', '4'])
  // Two 4s, two 5s and both heart 5s: two triples up to 5, or three pairs up to 5 or 6.
  const steel = read('C4 H4 C5 S5 H5 H5', '5', '5', 'plate')
  assert.deepEqual([steel.move.kind, danlmRank(steel.move, '5'), steel.guessed], ['steel', '5', false])
  const low = read('C4 H4 C5 S5 H5 H5', '5', '5', 'tube')
  assert.deepEqual([low.move.kind, danlmRank(low.move, '5'), low.guessed], ['pairs', '5', false])
  const high = read('C4 H4 C5 S5 H5 H5', '5', '6', 'tube')
  assert.deepEqual([high.move.kind, danlmRank(high.move, '5'), high.guessed], ['pairs', '6', false])
  assert.equal(danlmStep(0, low.move, '5').type, 'tube')
  assert.equal(danlmStep(0, steel.move, '5').type, 'plate')
})

test('after DanLM plays a full house with two wild cards, a higher full house or a 4-card bomb may follow', async () => {
  const { danlmMove } = await import('../tools/arena/danlm-client.ts')
  const { takeTurn } = await import('../src/match.ts')
  // The plays from the dropped games, each after a full house of 4s whose pair is both wild cards.
  // A level where the logged play holds a wild itself cannot follow such a play: both copies are on the table.
  const cases = [
    ['6', 'S4 C4 D4 H6 H6', 'H5 S6 C6 D5 D6', {rank: '6', type: 'fullhouse'}, 'full'],
    ['7', 'S4 C4 D4 H7 H7', 'H8 S7 C8 D7 D8', {rank: '8', type: 'fullhouse'}, 'full'],
    ['2', 'S4 C4 D4 H2 H2', 'HK CK CK DK', {rank: 'K', type: 'normalbomb'}, 'bomb'],
  ]
  for (const [level, lead, follow, declared, kind] of cases) {
    const hands = deal(lead + ' S3', follow + ' C3', 'D3', 'SA')
    let s = table(hands, level)
    const first = danlmMove(s, 0, {cards: lead.split(' '), rank: '4', type: 'fullhouse'})
    assert.equal(first.move.kind, 'full', `${lead} at level ${level}`)
    s = takeTurn(s, 0, first.move)
    const second = danlmMove(s, 1, {cards: follow.split(' '), ...declared})
    assert.deepEqual([second.move.kind, second.guessed], [kind, false], `${follow} after ${lead} at level ${level}`)
    s = takeTurn(s, 1, second.move)
    assert.equal(s.target.kind, kind)
  }
})
