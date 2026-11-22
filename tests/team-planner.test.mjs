import test from 'node:test'
import assert from 'node:assert/strict'
import { adviseTurn, publicTable, startMatch, takeTurn } from '../src/match.ts'
import { allMoves, deck, uid } from '../src/rules.ts'
import { quickTeamSuggestion } from '../src/team-coach.ts'
import { samplePublicHands } from '../src/team-worlds.ts'

const faceKey = card => card.suit + ':' + card.rank
const faces = cards => cards.map(faceKey).sort()
const worldFaces = worlds => worlds.map(hands => hands.map(faces))

// Every unheld card appears in the public play history. The planner can then
// sample a complete double deck without using any of the actual hidden hands.
function endgame(ranks, turn = 0) {
  const stock = deck()
  const hands = ranks.map(row => row.map(rank => {
    const index = stock.findIndex(card => card.rank === rank || card.id === rank)
    assert.notEqual(index, -1)
    return stock.splice(index, 1)[0]
  }))
  const events = stock.map(card => ({
    seat: 1,
    kind: 'play',
    trick: 1,
    text: '先前已出牌',
    move: allMoves([card], '2', true)[0]
  }))
  return { ...startMatch(deck(), () => 0), hands, turn, events, trick: 2 }
}

function reveal(state, seat, cards) {
  return {
    ...state,
    events: [...state.events, ...cards.map(card => ({
      seat: -1,
      kind: 'system',
      trick: state.trick,
      text: '公開明牌',
      reveal: { to: seat, card }
    }))]
  }
}

test('sampled worlds conserve both copies of every face and retain public cards at their seats', () => {
  let state = endgame([
    ['3', '3', '4', 'BJ'],
    ['8', '8', '8'],
    ['S9-0', 'S9-1'],
    ['J', 'Q', 'K']
  ])
  // Both physical copies of this face were publicly revealed at the same seat.
  assert.equal(faceKey(state.hands[2][0]), faceKey(state.hands[2][1]))
  state = reveal(state, 2, state.hands[2])
  state = reveal(state, 1, state.hands[1].slice(0, 1))
  const table = publicTable(state)
  const worlds = samplePublicHands(state.hands[0], state.level, state.target, table, 8)
  assert.ok(worlds.length > 0 && worlds.length <= 8)
  for (const hands of worlds) {
    assert.deepEqual(hands.map(hand => hand.length), table.counts)
    assert.equal(new Set(hands.flat().map(uid)).size, hands.flat().length)
    assert.deepEqual(faces(hands[0]), faces(state.hands[0]))
    assert.deepEqual(faces([...hands.flat(), ...table.played]), faces(deck()))
    for (let seat = 0; seat < 4; seat++) {
      const held = faces(hands[seat])
      for (const card of table.shown[seat]) {
        const index = held.indexOf(faceKey(card))
        assert.notEqual(index, -1, 'a public card must stay with its known owner')
        held.splice(index, 1)
      }
    }
  }
})

test('sampling is deterministic from public faces regardless of identifiers or observation ordering', () => {
  let state = endgame([
    ['3', '4', 'J', 'BJ'],
    ['5', '7', 'Q'],
    ['8', '9'],
    ['6', '10', 'K']
  ])
  state = reveal(state, 1, state.hands[1].slice(0, 2))
  const table = publicTable(state)
  const expected = samplePublicHands(state.hands[0], state.level, null, table, 8)
  const sameObservations = {
    ...table,
    shown: table.shown.map(cards => [...cards].reverse()),
    played: [...table.played].reverse()
  }
  const ownCards = [...state.hands[0]].reverse().map((card, index) => ({
    ...card, id: 'equivalent-own-card-' + index
  }))
  assert.ok(expected.length > 0)
  assert.deepEqual(
    worldFaces(samplePublicHands(ownCards, state.level, null, sameObservations, 8)),
    worldFaces(expected)
  )
})

test('incomplete legacy history or impossible public duplicates skip sampling safely', () => {
  const state = endgame([
    ['3', '4', 'J', 'BJ'], ['5', '7', 'Q'], ['8', '9'], ['6', '10', 'K']
  ])
  const table = publicTable(state)
  const missingHistory = { ...table, played: table.played.slice(1) }
  assert.deepEqual(samplePublicHands(state.hands[0], state.level, null, missingHistory), [])
  const repeated = state.hands[0][0]
  const impossible = {
    ...table,
    shown: [[], [repeated, repeated, repeated], [], []]
  }
  assert.deepEqual(samplePublicHands(state.hands[0], state.level, null, impossible), [])
})

test('multi-round advice cannot inspect or depend on actual hidden hands', () => {
  const state = endgame([
    ['3', '4', 'J', 'BJ'], ['5', '7', 'Q'], ['8', '9'], ['6', '10', 'K']
  ])
  const expected = adviseTurn(state)
  const hidden = state.hands.slice(1).flat().reverse()
  const permuted = {
    ...state,
    hands: state.hands.map((cards, seat) => seat === 0
      ? cards
      : hidden.splice(0, cards.length).map((card, index) => ({ ...card, id: 'hidden-' + seat + '-' + index })))
  }
  assert.deepEqual(adviseTurn(permuted), expected)
  const guarded = {
    ...state,
    hands: state.hands.map((cards, seat) => seat === 0 ? cards : new Proxy(cards, {
      get(target, key) {
        if (key === 'length') return target.length
        throw new Error('Planner inspected hidden cards at seat ' + seat)
      }
    }))
  }
  assert.deepEqual(adviseTurn(guarded), expected)
  const renamedHistory = {
    ...state,
    events: state.events.map(event => ({
      ...event,
      text: '同一組公開牌面的其他說明',
      move: { ...event.move, cards: event.move.cards.map(card => ({ ...card, id: 'history-' + card.id })) }
    }))
  }
  assert.deepEqual(adviseTurn(renamedHistory), expected)
})

test('planning is repeatable, preserves its input and never recommends passing on a fresh lead', () => {
  const state = endgame([
    ['3', '4', 'J', 'BJ'], ['5', '7', 'Q'], ['8', '9'], ['6', '10', 'K']
  ])
  const before = structuredClone(state)
  const first = adviseTurn(state)
  assert.ok(first.move, 'a fresh trick requires a legal opening play')
  assert.doesNotThrow(() => takeTurn(state, state.turn, first.move))
  assert.deepEqual(adviseTurn(state), first)
  assert.deepEqual(state, before)
  assert.ok(first.move.cards.every(card => state.hands[0].some(held => uid(held) === uid(card))))
})

test('two hidden scattered partner cards can be relayed across tricks to take first and second', () => {
  const initial = endgame([
    ['3', '3', 'Q', 'BJ'],
    ['6', '6', '6'],
    ['8', '9'],
    ['7', '7', '7']
  ])
  assert.deepEqual(publicTable(initial).shown[2], [])

  function playToResult(planOurTeam) {
    let state = initial
    const actions = []
    for (let turn = 0; turn < 80 && state.phase === 'play'; turn++) {
      // Hold both opponents' policy constant when comparing the two teams.
      const advice = planOurTeam && state.turn % 2 === 0
        ? adviseTurn(state)
        : quickTeamSuggestion(state.hands[state.turn], state.level, state.target, publicTable(state))
      actions.push({ seat: state.turn, trick: state.trick, ...advice })
      state = takeTurn(state, state.turn, advice.move)
    }
    assert.equal(state.phase, 'result', 'the local policies must reach a result')
    return { state, actions }
  }

  const baseline = playToResult(false)
  assert.equal(baseline.actions[0].move.kind, 'pair')
  assert.equal(baseline.state.finish[0], 1, 'the immediate policy lets a pair-then-single opponent take first')

  const planned = playToResult(true)
  assert.equal(planned.actions[0].move.kind, 'single')
  assert.match(planned.actions[0].reason, /若|可能/)
  assert.deepEqual([...planned.state.finish.slice(0, 2)].sort(), [0, 2])
  const partnerPlays = planned.actions.filter(action => action.seat === 2 && action.move)
  assert.equal(partnerPlays.length, 2)
  assert.ok(partnerPlays.every(action => action.move.kind === 'single'))
  assert.equal(new Set(partnerPlays.map(action => action.trick)).size, 2)
  assert.ok(planned.actions.some(action => action.seat === 0 && action.move?.label === 'Q'))
})

test('pass over a partner holding the trick with two unknown cards when covering costs their lead', () => {
  let state = endgame([['3','5','BJ'], ['4','5','7'], ['8','9','K'], ['3','4','5']], 2)
  const king = state.hands[2].find(card => card.rank === 'K')
  state = takeTurn(state, 2, allMoves([king], '2', true)[0])
  state = takeTurn(state, 3, null)
  const advice = adviseTurn(state)
  assert.ok(advice.moves.some(move => move.cards[0].rank === 'BJ'))
  assert.equal(advice.move, null)
  assert.match(advice.reason, /若是散牌/)
  assert.match(advice.reason, /過.*隊友.*先出/)
})
