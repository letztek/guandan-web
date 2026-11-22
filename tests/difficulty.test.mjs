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
