import test from 'node:test'
import assert from 'node:assert/strict'
import { adviceInput, adviseTurn, startMatch, takeTurn } from '../src/match.ts'
import { publicFinish } from '../src/public-finish.ts'
import { allMoves, beats, deck } from '../src/rules.ts'

function thirdPlaceGame(lastOpponentCard, first = 3) {
  const stock = deck()
  const take = id => stock.splice(stock.findIndex(c=>c.id===id),1)[0]
  const hands = [['S5-0','H5-0','C5-0','D5-0','C3-0'].map(take),[],[],[]]
  const opponent = (first+2)%4
  hands[opponent].push(take(lastOpponentCard))
  const target = allMoves([take('S9-0')],'A',true)[0]
  const events = stock.map(card => ({trick:1,seat:first,kind:'play',
    move:allMoves([card],'A',true)[0],text:'先前已出'}))
  events.push({trick:2,seat:2,kind:'play',move:target,text:'單張 9'})
  if (first === 1) events.push({trick:2,seat:3,kind:'pass',text:'過牌'})
  return {...startMatch(deck(),()=>0),level:'A',scores:['2','A'],owner:1,turn:0,trick:2,hands,
    holder:2,target,pending:first===3 ? [0,1] : [0],finish:[first,2],events}
}

test('covering a finished partner can secure third and deny the opposing team its match at A', () => {
  const game = thirdPlaceGame('DA-0')
  const passed = takeTurn(takeTurn(game,0,null),1,allMoves(game.hands[1],'A',true)[0])
  assert.deepEqual(passed.finish,[3,2,1,0])
  assert.equal(passed.won,true)

  const guarded = {...game,hands:game.hands.map((hand,seat)=>seat===0 ? hand : new Proxy(hand,{
    get(cards,key) {
      if (key === 'length') return cards.length
      throw Error('inspected hidden cards at seat '+seat)
    }
  }))}
  const cover = adviseTurn(guarded,'advanced','attack')
  assert.equal(cover.move?.kind,'bomb')
  assert.match(cover.reason,/隊友已出完.*對手直接走完.*守住三游/)
  const regain = takeTurn(takeTurn(game,0,cover.move),1,null)
  const blocked = takeTurn(regain,0,allMoves(regain.hands[0],'A',true)[0])
  assert.deepEqual(blocked.finish,[3,2,0,1])
  assert.equal(blocked.won,false)
})

test('the third-place proof preserves the wind and requires complete public accounting', () => {
  const safe = thirdPlaceGame('D7-0')
  const lastToAct = thirdPlaceGame('DA-0',1)
  const incomplete = thirdPlaceGame('DA-0')
  incomplete.events.shift()
  for (const game of [safe,lastToAct,incomplete]) {
    const {hand,target,table} = adviceInput(game,'advanced')
    const legal = allMoves(hand,game.level).filter(move=>beats(move,target))
    assert.ok(legal.some(move=>move.kind==='bomb'))
    assert.equal(publicFinish(hand,game.level,target,table,legal),null)
  }
  assert.equal(adviseTurn(safe,'advanced','attack').move,null)
  assert.equal(adviseTurn(lastToAct,'advanced','attack').move,null)
})
