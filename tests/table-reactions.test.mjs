import test from 'node:test'
import assert from 'node:assert/strict'
import { startMatch, takeTurn } from '../src/match.ts'
import { allMoves, deck } from '../src/rules.ts'
import { autoPass } from '../src/auto-pass.ts'
import { startsNewTableHand, tablePosture, tableReactions } from '../src/table-reactions.ts'

function table(rows, turn=0) {
  const pack=deck()
  const hands=rows.map(row=>row.map(rank=>pack.splice(pack.findIndex(card=>card.rank===rank),1)[0]))
  return {...startMatch(), hands, turn}
}
function play(game, rank) {
  const single=allMoves(game.hands[game.turn],game.level).find(move=>move.kind==='single'&&move.cards[0].rank===rank)
  assert.ok(single)
  return takeTurn(game,game.turn,single)
}

test('personal finish precedes team result, including an opponent team passing A',()=>{
  const start={...table([['3','4'],['7'],['5','6'],['8']],1),level:'A',owner:1}
  const first=play(start,'7')
  assert.deepEqual(tableReactions(start,first).filter(c=>c.kind==='finish'),[{seat:1,kind:'finish',lookAt:3}])
  assert.ok(!tableReactions(start,first).some(c=>c.kind==='win'))
  const passed=takeTurn(first,2,null)
  assert.deepEqual(tableReactions(first,passed),[
    {seat:2,kind:'pass',lookAt:3},{seat:3,kind:'follow',lookAt:'table'}
  ])
  const last=play(passed,'8')
  assert.deepEqual(last.finish,[1,3])
  assert.deepEqual(tableReactions(passed,last),[
    {seat:3,kind:'finish',lookAt:1},
    {seat:1,kind:'matchWin',lookAt:3},{seat:2,kind:'matchLose',lookAt:0},{seat:3,kind:'matchWin',lookAt:1}
  ])
  assert.deepEqual(tableReactions(last,last),[])
  assert.deepEqual(tablePosture(last),tableReactions(passed,last).slice(1))
})

test('assigned fourth with cards receives only team outcome; no personal finish',()=>{
  const previous={...table([[],[],['8'],['3','4']],2),finish:[1,0]}
  const result=play(previous,'8')
  assert.deepEqual(result.finish,[1,0,2,3])
  const changes=tableReactions(previous,result)
  assert.deepEqual(changes.filter(c=>c.kind==='finish').map(c=>c.seat),[2])
  assert.deepEqual(changes.filter(c=>c.seat===3).map(c=>c.kind),['win'])
  assert.deepEqual(changes.filter(c=>c.seat===2).map(c=>c.kind),['finish','lose'])
})

test('partner of a finisher can lead the next trick; the last passer still reacts',()=>{
  let s=play(table([['7'],['3','4'],['5','6'],['8','9']]),'7')
  s=takeTurn(s,1,null)
  s=takeTurn(s,2,null)
  const next=takeTurn(s,3,null)
  assert.deepEqual(tableReactions(s,next),[
    {seat:3,kind:'pass',lookAt:2},{seat:2,kind:'lead',lookAt:'hand'}
  ])
})

test('new or restored hand uses current posture; exchange choices remain quiet',()=>{
  const first=table([['4'],['6'],['3'],['7']],2)
  const next={...startMatch(),handNo:2,turn:1,phase:'donate'}
  assert.ok(startsNewTableHand(first,next))
  assert.deepEqual(tableReactions(first,next),[])
  assert.deepEqual(tableReactions(next,{...next,phase:'return',turn:2}),[])
  assert.deepEqual(tableReactions(next,{...next,phase:'play'}),[{seat:1,kind:'lead',lookAt:'hand'}])
  assert.ok(startsNewTableHand(first,structuredClone(first)))
  assert.deepEqual(tablePosture(first),[{seat:2,kind:'lead',lookAt:'hand'}])
})

test('restoring seat attention and auto-passing the human hand respect seat ownership',()=>{
  const start=table([['3'],['4','5'],['6','9'],['8','J']],3)
  const afterLead=play(start,'8')
  assert.equal(afterLead.turn,0)
  assert.deepEqual(tablePosture(afterLead),[{seat:1,kind:'watch',lookAt:'table'}])
  const afterHumanPass=autoPass(afterLead)
  assert.equal(afterHumanPass.turn,1)
  assert.deepEqual(tableReactions(afterLead,afterHumanPass),[{seat:1,kind:'follow',lookAt:'table'}])
  assert.deepEqual(tableReactions(afterHumanPass,afterHumanPass),[])
})

test('thinking ends after a real play, without assigning a new pass to the outgoing player',()=>{
  const start=table([['3','4'],['7','K'],['5','6'],['8','9']],2)
  const played=play(start,'5')
  assert.deepEqual(tableReactions(start,played),[
    {seat:3,kind:'follow',lookAt:'table'},{seat:2,kind:'idle',lookAt:'table'},
  ])
})
