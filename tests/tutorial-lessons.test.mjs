import assert from 'node:assert/strict'
import test from 'node:test'
import { checkLesson, lessons } from '../src/tutorial-lessons.ts'
import { lessonDialogue } from '../src/tutorial-dialogue.ts'
import { allMoves, beats, uid } from '../src/rules.ts'

const drills = [
  ['lead', 'play', 'S7 H7 C7'],
  ['pair', 'play', 'D9 C9'],
  ['wild', 'play', 'DA SA H5'],
  ['full', 'play', 'H10 D10 S10 S6 C6'],
  ['run', 'play', 'D6 S7 C8 H9 S10'],
  ['pairs', 'play', 'S7 H7 D8 C8 S9 D9'],
  ['steel', 'play', 'S8 H8 D8 C9 H9 D9'],
  ['bomb', 'play', 'S6 H6 C6 D6'],
  ['flush', 'play', 'S9 S10 SJ SQ SK'],
  ['team', 'pass', ''],
  ['wind', 'pass', ''],
  ['rank', 'play', 'C9 H9'],
  ['ace', 'play', 'SA'],
  ['donate', 'donate', 'S5'],
  ['return', 'return', 'D7'],
  ['resist', 'resist', 'JBJ-0 JBJ-1'],
]
const get = id => lessons.find(lesson => lesson.id === id)

test('the listener appears only for a question they answer about the current hand', () => {
  for (const lesson of lessons) {
    for (const tone of ['guide','retry','correct']) {
      const {lines}=lessonDialogue(lesson,tone,lesson.prompt)
      assert.deepEqual(lines,[{speaker:'left',text:lesson.prompt}])
    }
    const {lines}=lessonDialogue(lesson,'clue',lesson.hint)
    assert.deepEqual(lines.map(line=>line.speaker),['left','right'])
    assert.match(lines[0].text,/？/)
    assert.equal(lines[1].text,lesson.hint)
  }
  const first=get('wind')
  const next={...first,...first.afterPass,target:undefined}
  assert.match(lessonDialogue(first,'clue',first.hint).lines[0].text,/怎麼讓對家接風/)
  assert.match(lessonDialogue(next,'clue',next.hint).lines[0].text,/已經接風/)
})
function select(lesson, faces) {
  if (!faces) return []
  return faces.split(' ').map(face => uid(lesson.hand.find(card => card.id === (face.includes('-') ? face : face + '-0'))))
}

test('every tutorial situation can be finished using the displayed hand', () => {
  assert.deepEqual(lessons.map(lesson => lesson.id), drills.map(([id]) => id))
  for (const [id, action, faces] of drills) {
    const lesson = get(id)
    const inUse = [...lesson.hand, ...(lesson.target?.cards ?? [])].map(uid)
    assert.equal(new Set(inUse).size, inUse.length, id + ' uses distinct physical cards')
    const selected = select(lesson, faces)
    const result = checkLesson(lesson, selected, action)
    assert.equal(result.ok, true, id + ': ' + result.message)
    assert.deepEqual(result.cards.map(uid).sort(), selected.sort(), id)
    if (action === 'play') {
      const legal = allMoves(result.cards, lesson.level, true).filter(move => beats(move, lesson.target ?? null))
      assert.ok(legal.some(move => move.kind === lesson.exercise.pattern), id)
      assert.equal(checkLesson(lesson, selected.slice(1), action).ok, false)
    }
  }
})

test('a legal alternative explains the current objective and keeps the player in the lesson', () => {
  assert.equal(checkLesson(get('lead'), select(get('lead'), 'D9'), 'play').ok, false)
  assert.equal(checkLesson(get('team'), select(get('team'), 'DA'), 'play').ok, false)
  assert.equal(checkLesson(get('lead'), [], 'pass').ok, false)
  assert.equal(checkLesson(get('wild'), select(get('wild'), 'DA SA S5'), 'play').ok, false)
})

test('the tribute exercises use the same eligible cards as the table', () => {
  assert.equal(checkLesson(get('donate'), select(get('donate'), 'H5'), 'donate').ok, false)
  assert.equal(checkLesson(get('return'), select(get('return'), 'C10'), 'return').ok, true)
  assert.equal(checkLesson(get('return'), select(get('return'), 'S5'), 'return').ok, false)
  assert.equal(checkLesson(get('resist'), [], 'donate').ok, false)
  const resist=get('resist')
  for (const faces of ['', 'JBJ-0', 'JBJ-0 JBJ-0', 'JBJ-1 JSJ-0']) {
    assert.equal(checkLesson(resist,select(resist,faces),'resist').ok,false)
  }
})

test('after catching the wind, the player must lead the newly cleared trick', () => {
  const first=get('wind')
  assert.equal(checkLesson(first, [], 'pass').ok,true)
  const lead={...first,...first.afterPass,target:undefined}
  assert.equal(checkLesson(lead,[],'pass').ok,false)
  assert.equal(checkLesson(lead,select(lead,'D3 S8'),'play').ok,false)
  for (const face of ['D3','S8']) assert.equal(checkLesson(lead,select(lead,face),'play').ok,true)
})
