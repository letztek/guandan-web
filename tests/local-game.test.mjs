import assert from 'node:assert/strict'
import test from 'node:test'
import { allMoves, deck } from '../src/rules.ts'
import { startMatch, takeTurn, nextHand, settle, exchangeOptions, giveCard } from '../src/match.ts'

class StorageStub {
  values=new Map()
  writable=true
  getItem(key) {return this.values.get(key)??null}
  setItem(key,value) {
    if (!this.writable) throw Error('quota exceeded')
    this.values.set(key,value)
  }
  removeItem(key) {this.values.delete(key)}
}
let page=0
async function reopen(localStorage=new StorageStub(),sessionStorage=new StorageStub()) {
  globalThis.window={localStorage,sessionStorage}
  return import('../src/local-game.ts?page='+ ++page)
}
function opening() {return startMatch(deck(),()=>0)}

test('a closed tab resumes the same chosen partner, hands, moves and turn',async()=>{
  const disk=new StorageStub()
  const first=await reopen(disk)
  const original=first.startLocalGame('athena')
  const lead=original.game
  const move=allMoves(lead.hands[lead.turn],lead.level).find(m=>m.kind==='single')
  const played=takeTurn(lead,lead.turn,move)
  assert.ok(first.updateLocalGame(original,played))
  const second=await reopen(disk)
  const restored=second.readLocalGame()
  assert.equal(restored.storage,'device')
  assert.equal(restored.partnerId,'athena')
  assert.equal(restored.id,original.id)
  assert.deepEqual(restored.game,played)
  const passed=takeTurn(restored.game,restored.game.turn,null)
  assert.ok(second.updateLocalGame(restored,passed,'high-waitress'))
  const reopened=(await reopen(disk)).readLocalGame()
  assert.deepEqual(reopened.game,passed)
  assert.equal(reopened.partnerId,'high-waitress')
})

test('version 2 session migrates once, including results and unfinished double exchanges',async()=>{
  const disk=new StorageStub(), oldTab=new StorageStub(), prior=settle({...opening(),finish:[0,2]})
  oldTab.setItem('guandan.battle.v2',JSON.stringify(prior))
  oldTab.setItem('guandan.partner','high-waitress')
  let api=await reopen(disk,oldTab), saved=api.readLocalGame()
  assert.equal(saved.partnerId,'high-waitress')
  assert.deepEqual(saved.game,prior)
  assert.equal(oldTab.getItem('guandan.battle.v2'),null)
  const pack=deck()
  // Double tribute starts dealing at seat 1, so place both big jokers in winning seats.
  const jokers=pack.filter(c=>c.rank==='BJ')
  for(const [i,joker] of jokers.entries()) {
    const j=pack.indexOf(joker), win=[1,3][i]
    ;[pack[win],pack[j]]=[pack[j],pack[win]]
  }
  let current=nextHand(prior,pack)
  assert.equal(current.phase,'donate')
  const phases=[]
  while (current.phase==='donate'||current.phase==='return') {
    saved=api.updateLocalGame(saved,current)
    assert.ok(saved)
    api=await reopen(disk)
    saved=api.readLocalGame()
    assert.deepEqual(saved.game,current)
    phases.push(saved.game.phase)
    current=giveCard(saved.game,saved.game.turn,exchangeOptions(saved.game)[0])
  }
  assert.deepEqual(phases,['donate','donate','return','return'])
  assert.equal(current.phase,'play')
  assert.deepEqual(current.hands.map(h=>h.length),[27,27,27,27])
})

test('an old tab cannot overwrite a newer move or a newly started game',async()=>{
  const disk=new StorageStub(), api=await reopen(disk), original=api.startLocalGame('athena')
  const forward=api.updateLocalGame(original,opening())
  assert.equal(api.updateLocalGame(original,opening()),null)
  const restarted=api.startLocalGame('hanakomachi')
  assert.equal(api.updateLocalGame(forward,opening()),null)
  assert.equal(api.readLocalGame().id,restarted.id)
})

test('corrupt local data can recover a valid old session and invalid games are not offered',async()=>{
  const disk=new StorageStub(), tab=new StorageStub(), api=await reopen(disk,tab)
  disk.setItem(api.localGameKey,'{')
  tab.setItem('guandan.battle.v2',JSON.stringify({...opening(),hands:[['not a card'],[],[],[]]}))
  assert.equal(api.readLocalGame(),null)
  const valid=opening()
  tab.setItem('guandan.battle.v2',JSON.stringify(valid))
  assert.deepEqual(api.readLocalGame().game,valid)
})

test('storage failures preserve the latest turn at the available scope',async()=>{
  const disk=new StorageStub(), tab=new StorageStub()
  let api=await reopen(disk,tab), saved=api.startLocalGame('athena')
  const first=saved.game
  const move=allMoves(first.hands[first.turn],first.level)[0]
  const moved=takeTurn(first,first.turn,move)
  disk.writable=false
  saved=api.updateLocalGame(saved,moved)
  assert.equal(saved.storage,'tab')
  api=await reopen(disk,tab)
  assert.deepEqual(api.readLocalGame().game,moved)
  tab.writable=false
  const passed=takeTurn(moved,moved.turn,null)
  saved=api.updateLocalGame(saved,passed)
  assert.equal(saved.storage,'memory')
  assert.deepEqual(api.readLocalGame().game,passed)
  disk.writable=true
  assert.equal(api.updateLocalGame(saved,passed).storage,'device')
  assert.deepEqual((await reopen(disk)).readLocalGame().game,passed)
})

test('auto-pass preference migrates and survives closing the tab',async()=>{
  const disk=new StorageStub(), oldTab=new StorageStub()
  oldTab.setItem('guandan.auto-pass-last.v1','false')
  let api=await reopen(disk,oldTab)
  assert.equal(api.readAutoPass(),false)
  api=await reopen(disk)
  assert.equal(api.readAutoPass(),false)
  api.saveAutoPass(true)
  assert.equal((await reopen(disk)).readAutoPass(),true)
  const limitedTab=new StorageStub()
  api=await reopen(disk,limitedTab)
  disk.writable=false
  api.saveAutoPass(false)
  assert.equal(api.readAutoPass(),false)
  assert.equal((await reopen(disk,limitedTab)).readAutoPass(),false)
  assert.equal((await reopen(disk)).readAutoPass(),true)
})
