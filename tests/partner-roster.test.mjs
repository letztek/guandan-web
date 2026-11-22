import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { partners } from '../src/partner-roster.ts'
import { characterName, playStyleForSeat, tableSeatsFor } from '../src/table-seats.ts'
import { playStyleLabels } from '../src/play-style.ts'

test('existing character IDs resolve to game names and individual play styles', () => {
  assert.deepEqual(partners.map(person => [person.id, person.name, playStyleLabels[person.playStyle]]), [
    ['hanakomachi', '鈴音', '助攻'], ['high-waitress', '珊迪', '穩健留牌'], ['athena', '天宮', '主攻'],
  ])
})

test('the deck gallery and card printer use the game names for ranks five, seven and ten', () => {
  const prints = JSON.parse(readFileSync(new URL('../artwork/chibi/ranks.json', import.meta.url), 'utf8'))
  const printRank = {hanakomachi: '7', 'high-waitress': '5', athena: '10'}
  for (const person of partners) assert.equal(prints[printRank[person.id]].name, person.name)
})

test('the lobby selects the approved sleeve wave, curtsy and open-palm invitation', () => {
  assert.deepEqual(partners.map(({ id, selectionGreeting }) => [id, selectionGreeting]), [
    ['hanakomachi', 'A'], ['high-waitress', 'A'], ['athena', 'open-palm-invitation'],
  ])
})

for (const choice of partners) {
  test(`choosing ${choice.name} seats that model across from the player`, () => {
    const seats = tableSeatsFor(choice.id)
    const ally = seats.find(seat => seat.number === 2)
    assert.equal(ally.model, choice.rig)
    assert.equal(ally.name, choice.name)
    assert.equal(playStyleForSeat(0, choice.id), choice.playStyle)
    assert.equal(ally.portrait, choice.portrait)
    assert.deepEqual(new Set(seats.map(seat => seat.model)), new Set(partners.map(person => person.rig)))
    assert.equal(characterName(0, choice.id), '你')
    for (const seat of seats) {
      const person = partners.find(person => person.rig === seat.model)
      assert.equal(characterName(seat.number, choice.id), person.name)
      assert.equal(seat.playStyle, person.playStyle)
      assert.equal(playStyleForSeat(seat.number, choice.id), person.playStyle)
      assert.equal(seat.portrait, person.portrait)
      assert.ok(existsSync(new URL('../public/' + person.model, import.meta.url)))
      assert.ok(existsSync(new URL('../public/' + person.portrait, import.meta.url)))
    }
  })
}
