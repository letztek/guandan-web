import assert from 'node:assert/strict'
import test from 'node:test'
import { publicSeatHistory } from '../src/public-behavior.ts'
import { samplePublicHands } from '../src/team-worlds.ts'
import { adviceInput, adviseTurn, publicTable, startMatch, takeTurn } from '../src/match.ts'
import { teamSuggestion } from '../src/team-coach.ts'
import { allMoves, deck, uid } from '../src/rules.ts'

const play = (trick,seat,kind,value) => ({trick,seat,kind:'play',move:{kind,value}})
const pass = (trick,seat) => ({trick,seat,kind:'pass'})

test('remember repeated opponent pairs that actually won, without treating a voluntary pass as a void', () => {
  const events = [
    play(1,0,'pair',6), pass(1,1), pass(1,2), pass(1,3),
    play(2,1,'single',3), play(2,3,'single',11),
    play(3,1,'single',5), play(3,2,'single',6),
    play(4,2,'pair',6), pass(4,1),
    play(5,3,'pair',5), pass(5,1), // own teammate
    play(6,0,'pair',7), pass(6,1), play(6,2,'pair',8), // a raise reopens bidding
    play(7,0,'pair',16), pass(7,1), // passing a level pair is unsurprising
    play(8,0,'pair',7), pass(8,1) // the current trick has not been settled
  ]
  assert.deepEqual(publicSeatHistory(events,8)[1], {
    singleLeads:2, otherLeads:0, passedOpponentPairs:[6,6]
  })
  assert.deepEqual(publicSeatHistory(events,9)[1].passedOpponentPairs,[6,6,7])
  assert.deepEqual(publicSeatHistory(events,17)[1], {
    singleLeads:0, otherLeads:0, passedOpponentPairs:[]
  })
})

test('advanced sampling modestly favors scattered singles only when multiple cues agree', () => {
  const stock = deck()
  const take = ids => ids.map(id => stock.splice(stock.findIndex(card => card.id === id),1)[0])
  const own = take(['C4-0','DA-0'])
  const hidden = take(['S8-0','H8-0','D9-0','C9-0','SJ-0','CJ-0','DQ-0','H4-0','S6-0'])
  const empty = () => ({singleLeads:0, otherLeads:0, passedOpponentPairs:[]})
  const history = [empty(),{singleLeads:3, otherLeads:1, passedOpponentPairs:[6,7]},empty(),empty()]
  const table = {seat:0, counts:[2,3,3,3], holder:-1, pending:[], finish:[], played:stock,
    shown:[[],[],[hidden[6]],[]]}
  const samples = (memo, infer) => samplePublicHands(own,'2',null,{...table,history:memo},1200,infer)
  const baseline = samples(undefined,false)
  assert.deepEqual(samples(history,false),baseline)
  for (const evidence of [{...history[1],singleLeads:0},{...history[1],passedOpponentPairs:[6]}]) {
    assert.deepEqual(samples([empty(),evidence,empty(),empty()],true),baseline)
  }
  const weighted = samples(history,true)
  const pairHoldings = worlds => worlds.filter(world =>
    new Set(world[1].map(card=>card.rank)).size < world[1].length).length
  assert.ok(pairHoldings(weighted) < pairHoldings(baseline))
  assert.ok(pairHoldings(weighted) > 0, 'passing never rules out a pair')
  assert.deepEqual(samples(history,true),weighted)
  for (const world of weighted) {
    assert.deepEqual(world.map(cards=>cards.length),table.counts)
    assert.equal(new Set(world.flat().map(uid)).size,11)
    assert.ok(world[2].some(card=>card.suit===hidden[6].suit && card.rank===hidden[6].rank))
  }
})

test('advanced public history and sampled hands stay identical when the real other hands change or are unreadable', () => {
  const stock = deck()
  const hands = [
    ['S4-0','D4-0','S5-0','D5-0','C3-0'], ['S6-0','C4-0','H5-0'], ['H9-0'], []
  ].map(ids => ids.map(id => stock.splice(stock.findIndex(card=>card.id===id),1)[0]))
  for (const hand of hands) hand.push(...stock.splice(0,27-hand.length))
  let state = {...startMatch(deck(),()=>0),hands,turn:0,events:[]}
  function lay(ids) {
    const cards = state.hands[state.turn].filter(card=>ids.includes(card.id))
    state = takeTurn(state,state.turn,allMoves(cards,state.level,true)[0])
  }
  function close() { while (state.target) state = takeTurn(state,state.turn,null) }
  lay(['S4-0','D4-0']); close()
  lay(['S5-0','D5-0']); close()
  lay(['C3-0']); lay(['S6-0']); close()
  lay(['C4-0']); close()
  lay(['H5-0']); lay(['H9-0']); close()
  assert.equal(state.turn,2)
  assert.ok(!Object.hasOwn(publicTable(state),'history'))
  for (const difficulty of ['beginner','standard']) {
    assert.ok(!Object.hasOwn(adviceInput(state,difficulty).table,'history'))
  }
  const expected = adviceInput(state,'advanced','balanced')
  assert.deepEqual(expected.table.history[1],{singleLeads:2,otherLeads:0,passedOpponentPairs:[4,5]})
  assert.deepEqual(adviseTurn(state,'advanced','balanced'),
    teamSuggestion(expected.hand,expected.level,expected.target,expected.table,expected.strength,expected.style))
  const hidden = state.hands.filter((_,seat)=>seat!==2).flat().reverse()
  const changed = state.hands.map((hand,seat)=>seat===2 ? hand : hidden.splice(0,hand.length))
  const guarded = changed.map((hand,seat)=>seat===2 ? hand : new Proxy(hand,{
    get(cards,key) {
      if (key === 'length') return cards.length
      throw Error('hidden cards were inspected')
    }
  }))
  const sample = view => samplePublicHands(view.hand,view.level,view.target,view.table,12,true)
  for (const holdings of [changed,guarded]) {
    const view = adviceInput({...state,hands:holdings},'advanced','balanced')
    assert.deepEqual(view,expected)
    assert.deepEqual(sample(view),sample(expected))
  }
})
