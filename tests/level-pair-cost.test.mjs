import test from 'node:test'
import assert from 'node:assert/strict'
import { allMoves, beats, coach, deck, power, remaining } from '../src/rules.ts'
import { quickTeamSuggestion, teamSuggestion } from '../src/team-coach.ts'

const level = '5'
const tens = ['S10-0', 'C10-0', 'D10-0']
const fives = ['S5-0', 'C5-0']
const sevens = ['S7-0', 'D7-0']
const previousHouse = ['S9-0', 'C9-0', 'D9-0', 'S6-0', 'C6-0']

function position(ownIds, previousIds = previousHouse) {
  const pack = deck()
  const byId = id => {
    const card = pack.find(c => c.id === id && c.suit !== 'J')
    assert.ok(card, id)
    return card
  }
  const hand = ownIds.map(byId)
  const target = previousIds.length ? allMoves(previousIds.map(byId), level, true)[0] : null
  const hidden = [['S3-1','C4-1','C8-1'], ['SJ-1','CQ-1','CA-1'], ['D3-1','D4-1','D8-1']]
  const unplayed = new Set([...ownIds, ...hidden.flat()])
  const table = {
    seat: 0, counts: [hand.length, ...hidden.map(h=>h.length)], holder: target ? 3 : -1,
    pending: target ? [0,1,2] : [], finish: [], shown: [[],[],[],[]],
    played: pack.filter(c=>!unplayed.has(c.id)).map(({suit,rank})=>({suit,rank}))
  }
  return {hand, target, table}
}

function suggestions({hand, target, table}) {
  return [
    ['battle hint', teamSuggestion(hand, level, target, table)?.move],
    ['quick hint', quickTeamSuggestion(hand, level, target, table)?.move],
    ['practice hint', coach(hand, level, target, allMoves(hand, level))[0]?.move]
  ]
}

test('a full house of tens uses the ordinary pair regardless of the order ranks are enumerated', () => {
  for (const rank of ['4', '7']) {
    const state = position([...tens, ...fives, 'S'+rank+'-0', 'D'+rank+'-0'])
    const legal = allMoves(state.hand, level).filter(move => beats(move, state.target))
    assert.ok(legal.some(move=>move.label==='10 帶 5'))
    assert.ok(legal.some(move=>move.label==='10 帶 '+rank))
    const practice = coach(state.hand, level, state.target, allMoves(state.hand, level))
    assert.equal(practice.filter(({move})=>move.kind==='full' && move.value===10).length, 1)
    for (const [name, move] of suggestions(state)) {
      assert.equal(move?.label, '10 帶 '+rank, name)
      assert.deepEqual(remaining(state.hand, move).map(c=>c.id).sort(), [...fives].sort(), name)
    }
  }
})

test('a natural side pair preserves the heart-level wildcard as well as the natural level card', () => {
  const state = position([...tens, 'S5-0', 'H5-0', ...sevens])
  for (const [name, move] of suggestions(state)) {
    assert.equal(move?.label, '10 帶 7', name)
    assert.deepEqual(remaining(state.hand, move).map(c=>c.id).sort(), ['H5-0', 'S5-0'], name)
  }
})

test('when leading from a scattered hand, three tens need not drag a pair of level fives along', () => {
  const state = position([...tens, ...fives, 'S2-0','D4-0','D7-0','SJ-0','SK-0'], [])
  const quick = quickTeamSuggestion(state.hand, level, null, state.table)
  const practice = coach(state.hand, level, null, allMoves(state.hand, level))[0]
  for (const advice of [quick, practice]) {
    assert.ok(advice.move)
    assert.ok(advice.move.cards.every(card=>card.rank!==level), advice.move.label)
  }
})

test('spending a level pair remains correct when that full house immediately wins a place', () => {
  const state = position([...tens, ...fives])
  for (const [name, move] of suggestions(state)) {
    assert.equal(move?.label, '10 帶 5', name)
    assert.equal(remaining(state.hand, move).length, 0)
  }
})

test('a natural level five still beats an ace when it is the last card', () => {
  const state = position(['S5-0'], ['DA-0'])
  for (const [name, move] of suggestions(state)) {
    assert.equal(move?.value, power(level, level), name)
    assert.equal(move?.cards[0].id, 'S5-0')
  }
})
