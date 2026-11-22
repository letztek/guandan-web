import assert from 'node:assert/strict'
import test from 'node:test'
import { difficultyForSeat, readStrengths, saveStrength, strengthKeys } from '../src/difficulty.ts'
import { adviceInput, adviseTurn, startMatch, takeTurn } from '../src/match.ts'
import { allMoves, deck } from '../src/rules.ts'

test('ally and opponent settings persist independently, including on older installations',()=>{
  const values=new Map([[strengthKeys.ally,'retired']])
  globalThis.window={localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}}
  try {
    assert.deepEqual(readStrengths(),{ally:'standard',opponents:'standard'})
    saveStrength('opponents','advanced')
    assert.deepEqual(readStrengths(),{ally:'standard',opponents:'advanced'})
    saveStrength('ally','beginner')
    assert.deepEqual([0,1,2,3].map(seat=>difficultyForSeat(seat,readStrengths())),['standard','advanced','beginner','advanced'])
  } finally {delete globalThis.window}
})

test('the three policies choose legal leads against a one-card opponent using only public information',()=>{
  const ids=[
    ['HA-0','C10-0','S8-0','SK-0','H3-1','D8-1','HK-1'],
    ['C2-1'],
    ['CA-0','S5-0','H10-0','S4-1','SQ-1','S9-1','H7-1'],
    ['SJ-0','H2-1','C4-1','SK-1','S2-0'],
  ]
  const stock=deck()
  const hands=ids.map(row=>row.map(id=>stock.find(card=>card.id===id)))
  const activeIds=new Set(ids.flat())
  const events=stock.filter(card=>!activeIds.has(card.id)).map(card=>({
    seat:1,kind:'play',trick:1,text:'先前已出',move:allMoves([card],'2',true)[0],
  }))
  const game={...startMatch(deck(),()=>0),turn:0,trick:2,hands,events}
  const hidden={...game,hands:hands.map((cards,seat)=>seat===0?cards:new Proxy(cards,{
    get(target,key){
      if(key==='length') return target.length
      throw Error('inspected a hidden card')
    },
  }))}
  const decisions={}
  for(const strength of ['beginner','standard','advanced']) {
    const input=adviceInput(hidden,strength)
    assert.equal(input.strength??'standard',strength)
    assert.deepEqual(input.hand,game.hands[0])
    const advice=adviseTurn(hidden,strength)
    assert.deepEqual(advice,adviseTurn(game,strength))
    assert.notEqual(takeTurn(game,0,advice.move),game)
    decisions[strength]=advice.move.label
  }
  assert.deepEqual(decisions,{beginner:'3',standard:'8 × 2',advanced:'K × 2'})
  const finishedMate={...game,finish:[2],hands:[hands[0],hands[1],[],hands[3]],
    events:[...events,...hands[2].map(card=>({seat:2,kind:'play',trick:1,text:'隊友已出',move:allMoves([card],'2',true)[0]}))]}
  const endgame=adviseTurn(finishedMate,'advanced')
  assert.match(endgame.reason,/隊友已出完/)
  assert.doesNotMatch(endgame.reason,/隊友若有更大/)
})

function publicEndgame(remainingRanks) {
  const stock = deck()
  const hands = remainingRanks.map(ranks => ranks.map(rank => {
    const index = stock.findIndex(card => card.rank === rank || card.id === rank)
    assert.notEqual(index, -1)
    return stock.splice(index, 1)[0]
  }))
  const events = stock.map(card => ({
    seat:1, kind:'play', trick:1, text:'先前已出', move:allMoves([card], '2', true)[0]
  }))
  return {...startMatch(deck(), () => 0), turn:0, trick:2, hands, events}
}

test('advanced remembers both played small jokers and uses the lowest certain control for first', () => {
  const ranks = [['C2-0','D4-0','H4-1'], ['HA-0','DK-0','CQ-0','SJ-0','S9-0'],
    ['DA-0','CK-0','HQ-0','S8-0','H7-0'], ['C6-0','H5-0','C4-0','D3-0','S10-0']]
  const game = publicEndgame(ranks)
  const standard = adviseTurn(game, 'standard')
  assert.equal(standard.move.label, '4 × 2')
  const advice = adviseTurn(game, 'advanced')
  assert.equal(advice.move.label, '2')
  assert.match(advice.reason, /兩張小王都已出過.*先出單張 2.*下一圈領出對子 4 × 2.*頭游/)

  const guarded = {...game, hands:game.hands.map((hand, seat) => seat === 0 ? hand : new Proxy(hand, {
    get(target, key) {
      if (key === 'length') return target.length
      throw Error('inspected an opponent or ally card')
    }
  }))}
  assert.deepEqual(adviseTurn(guarded, 'advanced'), advice)

  let next = takeTurn(game, 0, advice.move)
  for (const seat of [1,2,3]) next = takeTurn(next, seat, null)
  assert.equal(next.turn, 0)
  next = takeTurn(next, 0, adviseTurn(next, 'advanced').move)
  assert.deepEqual(next.finish, [0])

  const lastSmallJokerUnplayed = publicEndgame(ranks.map((hand, seat) => seat === 1 ? [...hand.slice(1), 'SJ'] : hand))
  assert.doesNotMatch(adviseTurn(lastSmallJokerUnplayed, 'advanced').reason, /兩張小王都已出過|能連續保住牌權/)
  const bombPossible = publicEndgame([['2','4'], ['K','K','K','K'], ['10'], ['Q']])
  assert.doesNotMatch(adviseTurn(bombPossible, 'advanced').reason, /能連續保住牌權/)
})

test('advanced can secure two successive leads and keep a lower last card for first', () => {
  let game = publicEndgame([['2','BJ','4'], ['K'], ['10'], ['Q']])
  const first = adviseTurn(game, 'advanced')
  assert.match(first.reason, /先出單張 2.*再由單張 大王.*最後領出單張 4.*頭游/)
  for (const label of ['2','大王','4']) {
    const advice = adviseTurn(game, 'advanced')
    assert.equal(advice.move.label, label)
    game = takeTurn(game, 0, advice.move)
    if (label !== '4') for (const seat of [1,2,3]) game = takeTurn(game, seat, null)
  }
  assert.deepEqual(game.finish, [0])
})

test('standard spends the lowest proven cover against a short opponent and accounts for bombs and jokers',async () => {
  const {quickTeamSuggestion}=await import('../src/team-coach.ts')
  function follow(opponents) {
    const state=publicEndgame([
      ['CK-0','DA-0','S3-0','D6-0','C9-0','SJ-0'],opponents,
      ['C6-1','D7-1','H8-0','S9-1','CJ-1'],['S7-0','SQ-0'],
    ])
    state.turn=3
    const queen=state.hands[3].find(c=>c.rank==='Q')
    const game=takeTurn(state,3,allMoves([queen],'2',true)[0])
    const {hand,level,target,table}=adviceInput(game)
    return quickTeamSuggestion(hand,level,target,table)
  }
  const safe=follow(['C3-0','D4-0','H5-0'])
  assert.equal(safe.move?.label,'K')
  assert.match(safe.reason,/這手就能守住牌權/)
  for (const cards of [['JBJ-0','D4-0','H5-0'],['C5-0','D5-0','S5-0','H5-0']]) {
    assert.doesNotMatch(follow(cards).reason,/這手就能守住牌權/)
  }
})
