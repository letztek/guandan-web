import test from 'node:test'
import assert from 'node:assert/strict'
import { adviceInput, adviseTurn, botStep, takeTurn } from '../src/match.ts'
import { allMoves, beats, deck, uid } from '../src/rules.ts'
import { createStyleLessonGame, playStyleChoice, styleLessonAdvice } from '../src/style-lesson-game.ts'
import { playStyleForSeat } from '../src/table-seats.ts'

test('the style lesson begins on the recorded spade eight with a complete two-deck history', () => {
  const game=createStyleLessonGame()
  const {hand,level,target,table}=adviceInput(game,'advanced')
  assert.equal(level,'2')
  assert.equal(table.seat,2)
  assert.equal(table.holder,0)
  assert.deepEqual(table.pending,[2,3])
  assert.deepEqual(table.counts,[2,13,6,1])
  assert.deepEqual(table.finish,[])
  assert.deepEqual(table.shown,[[],[],[],[]])
  assert.equal(table.played.length,86)
  assert.deepEqual(hand.map(c=>c.suit+c.rank),['C9','D10','HJ','SQ','DK','CA'])
  assert.equal(target.kind,'single')
  assert.deepEqual(target.cards.map(c=>c.suit+c.rank),['S8'])
  assert.equal(game.events.at(-1).kind,'pass')
  assert.equal(game.events.at(-1).seat,1)
  const played=game.events.filter(event=>event.kind==='play').flatMap(event=>event.move.cards)
  assert.deepEqual([...game.hands.flat(),...played].map(uid).sort(),deck().map(uid).sort())
})

test('character previews compare one public decision without changing a previously chosen branch', () => {
  const game=createStyleLessonGame()
  const branch=playStyleChoice(game,'nine')
  const checkpoint=structuredClone(branch)
  const hidden={...game,hands:game.hands.map((hand,seat)=>seat===2?hand:new Proxy(hand,{
    get(cards,key) {
      if (key==='length') return cards.length
      throw new Error('Compared a concealed holding at seat '+seat)
    },
  }))}
  for (const [id,label,reason] of [
    ['hanakomachi',undefined,/過牌保留他的領出機會/],
    ['high-waitress','9',/用較省的牌提高門檻/],
    ['athena','A',/主動把門檻拉高/],
  ]) {
    const advice=styleLessonAdvice(hidden,id)
    assert.deepEqual(advice,adviseTurn(game,'advanced',playStyleForSeat(2,id)))
    assert.equal(advice.move?.label,label)
    assert.match(advice.reason,reason)
  }
  assert.deepEqual(branch,checkpoint)
  assert.deepEqual(game,createStyleLessonGame())
})

test('each chosen move is applied once and leads to a playable hand settlement', () => {
  for (const [choice,cardId] of [['pass',null],['nine','C9-0'],['ace','CA-0']]) {
    const start=createStyleLessonGame()
    let game=playStyleChoice(start,choice)
    assert.equal(game.turn,3)
    assert.equal(game.events.length,start.events.length+1)
    assert.equal(game.events.at(-1).seat,2)
    assert.equal(game.events.at(-1).kind,cardId?'play':'pass')
    assert.equal(game.events.at(-1).move?.cards[0].id??null,cardId)
    assert.throws(()=>playStyleChoice(game,choice))
    for (let turn=0;turn<100 && game.phase==='play';turn++) {
      game=botStep(game,'advanced',playStyleForSeat(game.turn,'hanakomachi'))
    }
    assert.equal(game.phase,'result')
    assert.ok(game.finish.length>=2)
  }
})

test('after the ace the learner regains the lead and can play the remaining straight to take first', () => {
  let game=playStyleChoice(createStyleLessonGame(),'ace')
  for (const seat of [3,0,1]) {
    assert.equal(game.turn,seat)
    assert.ok(!allMoves(game.hands[seat],game.level).some(move=>beats(move,game.target)))
    game=takeTurn(game,seat,null)
  }
  assert.equal(game.turn,2)
  assert.equal(game.target,null)
  const straight=allMoves(game.hands[2],game.level,true).find(move=>move.kind==='straight')
  assert.equal(straight?.label,'9·10·J·Q·K')
  assert.deepEqual(takeTurn(game,2,straight).finish,[2])
})
