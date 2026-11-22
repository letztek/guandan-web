import { useEffect, useState, type CSSProperties } from 'react'
import { assetPath } from './assets'
import { describe, names, uid } from './rules'
import { LessonGuide } from './lesson-guide'
import { StyleLesson } from './style-lesson'
import { lessonDialogue } from './tutorial-dialogue'
import { checkLesson, lessons, type Lesson, type LessonAction, type LessonResult } from './tutorial-lessons'
import { Icon, PlayingCard } from './ui'
import './tutorial.css'

type TutorialProps = {
  onHome: () => void
  onStart: () => void
  onReady?: () => void
  backLabel?: string
  startWithStyleLesson?: boolean
}

const styleLessonEntry = {id:'three-styles',chapter:'實戰',title:'一張 8，三種牌風'} as const
export const styleLessonRoute = '#tutorial/'+styleLessonEntry.id
const catalog = [...lessons,styleLessonEntry]
const chapters = [...new Set(catalog.map(lesson=>lesson.chapter))]

export function Tutorial({onHome,onStart,onReady,backLabel='主選單',startWithStyleLesson=false}: TutorialProps) {
  const [id,setId] = useState(startWithStyleLesson?styleLessonEntry.id:lessons[0].id)
  const [completed,setCompleted] = useState<string[]>([])
  useEffect(()=>{onReady?.()},[onReady])
  const index = catalog.findIndex(lesson=>lesson.id===id)
  const lesson = catalog[index]
  function complete() {
    setCompleted(previous=>previous.includes(id) ? previous : [...previous,id])
  }
  function next() {
    if (index===catalog.length-1) onStart()
    else setId(catalog[index+1].id)
  }
  return <main className="lesson-room" style={{
    '--lesson-felt':'url("'+assetPath('art/felt.jpg')+'")',
    '--lesson-tavern':'url("'+assetPath('art/tavern.jpg')+'")',
  } as CSSProperties}>
    <header className="lesson-head">
      <div className="lesson-brand"><Icon name="book" size={24}/><h1>規則教學</h1></div>
      <label className="lesson-index"><span>課程目錄</span>
        <select aria-label="課程目錄" value={lesson.id} onChange={ev=>setId(ev.target.value)}>
          {chapters.map(chapter=><optgroup label={chapter} key={chapter}>
            {catalog.filter(item=>item.chapter===chapter).map(item=>
              <option key={item.id} value={item.id}>{completed.includes(item.id)?'✓ ':''}{item.title}</option>)}
          </optgroup>)}
        </select>
      </label>
      <button type="button" className="btn border" onClick={onHome}>{backLabel}</button>
    </header>
    <section className="lesson-workbench" data-lesson={id} aria-label="互動演練">
      <div className="lesson-heading">
        <div className="lesson-progress"><span>{lesson.chapter}</span><span>第 {index+1} / {catalog.length} 課</span></div>
        <h2>{lesson.title}</h2>
      </div>
      {'exercise' in lesson
        ? <GuidedExercise key={id} chapterLesson={lesson} onComplete={complete} onNext={next}/>
        : <StyleLesson onComplete={complete} onNext={next}/>}
    </section>
  </main>
}

function GuidedExercise({chapterLesson,onComplete,onNext}:{
  chapterLesson:Lesson; onComplete:()=>void; onNext:()=>void
}) {
  const [selected,setSelected] = useState<string[]>([])
  const [result,setResult] = useState<LessonResult|null>(null)
  const [showHint,setShowHint] = useState(false)
  const [leading,setLeading] = useState(false)
  const [event,setEvent] = useState(0)


  const lesson = leading ? {...chapterLesson,...chapterLesson.afterPass,target:undefined} : chapterLesson
  const {kind} = lesson.exercise
  const exchange = kind==='donate' || kind==='return'
  const reveal = kind==='resist'
  const done = result?.ok===true
  const played = done ? result.cards : []
  const visibleHand = reveal ? lesson.hand : lesson.hand.filter(card=>!played.some(sent=>uid(sent)===uid(card)))
  const tableCards = played.length ? played : lesson.target?.cards ?? []
  const playedLabel = reveal ? '你亮出的兩張大王' : exchange ? (kind==='donate'?'你進貢的牌':'你還的牌') : '你打出的牌'
  const boardLabel = played.length ? playedLabel : done && kind==='pass' ? '隊友收下這圈' : lesson.target
    ? '桌面上最大的一手' : exchange ? '換副交牌' : reveal ? '開局判定' : leading ? '接風後由你領出' : '由你領出'
  const canPass = Boolean(lesson.target) && !exchange && !reveal
  const justTookLead = leading && !selected.length && !result
  const tone = showHint ? 'clue' : result ? (done ? 'correct' : 'retry') : justTookLead ? 'correct' : 'guide'
  const line = showHint ? lesson.hint : result?.message ?? (justTookLead ? chapterLesson.success : lesson.prompt)
  const dialogue = lessonDialogue(lesson,tone,line)
  const duo = dialogue.lines.length>1
  const situation = !done && !leading ? chapterLesson.scene : ''
  const table = <div className="lesson-table" aria-label="目前牌桌">
    <div className="lesson-table-heading"><h3>{boardLabel}</h3><span>級牌 <b>{lesson.level}</b></span></div>
    {tableCards.length>0
      ? <div key={played.length?'played':'target'} className={'lesson-trick'+(played.length?' dealt':'')} aria-label={boardLabel+' '+describe(tableCards)}>
          {tableCards.map(card=><PlayingCard key={uid(card)} card={card} level={lesson.level} mini/>)}
        </div>
      : <div className="lesson-open-space" aria-hidden="true"><Icon name="cards" size={32}/></div>}
    {lesson.target && !played.length && <small>{names[lesson.target.kind]} · {lesson.target.label}</small>}
    {duo && situation && <p className="lesson-situation">{situation}</p>}
  </div>

  function toggle(id:string) {
    setResult(null)
    setSelected(previous=>previous.includes(id)?previous.filter(card=>card!==id):exchange?[id]:[...previous,id])
  }
  function attempt(action:LessonAction) {
    const answer=checkLesson(lesson,selected,action)
    setEvent(count=>count+1)
    setShowHint(false)
    if(answer.ok && action==='pass' && chapterLesson.afterPass) {
      setLeading(true)
      setSelected([])
      setResult(null)
      return
    }
    setResult(answer)
    if(answer.ok) onComplete()
  }
  function restart() {
    setEvent(count=>count+1)
    setResult(null)
    setSelected([])
    setShowHint(false)
    setLeading(false)
  }
  return <>
      <LessonGuide dialogue={dialogue} tone={tone} done={done} cue={lesson.id+'-'+tone+'-'+event} table={table}/>
      <div className="lesson-practice">
        {duo && table}
        {!duo && situation && <div className="lesson-context"><h3><Icon name="cards" size={17}/>牌桌情境</h3><p className="lesson-situation">{situation}</p></div>}
        <div className="lesson-hand">
          <div className="lesson-hand-heading"><h3>你的手牌</h3><span>{!done && selected.length>0 && '已選 '+selected.length+' 張 / '}{visibleHand.length} 張</span></div>
          {visibleHand.length>0 ? <div className="lesson-rack" style={{'--hand-count':visibleHand.length} as CSSProperties}>{visibleHand.map(card=>
            <PlayingCard key={uid(card)} card={card} level={lesson.level} selected={!done && selected.includes(uid(card))}
              onClick={done ? undefined : ()=>toggle(uid(card))}/>)}</div> : <p className="lesson-cleared">手牌已出完</p>}
          <div className="lesson-actions">
            {done ? <>
              <button className="btn border" onClick={restart} type="button">再試一次</button>
              <button className="btn gold" onClick={onNext} type="button">下一課</button>
            </> : <>
              <button type="button" className="lesson-hint-toggle" onClick={()=>{setShowHint(!showHint);setEvent(count=>count+1)}}
                aria-pressed={showHint} aria-controls="lesson-guide-dialogue"><Icon name="spark" size={16}/>{showHint?'收起線索':'看線索'}</button>
              {canPass && <button className="btn border" type="button" onClick={()=>attempt('pass')}>過牌</button>}
              <button className="btn gold" type="button" disabled={!selected.length}
                onClick={()=>attempt(reveal?'resist':exchange?kind:'play')}>{reveal?'亮牌抗貢':exchange?(kind==='donate'?'確認進貢':'確認還貢'):'出牌'}</button>
            </>}
          </div>
        </div>
      </div>
      <aside className="lesson-notes" aria-label="本課說明">
        <h3><Icon name="book" size={16}/>本課規則</h3><p>{lesson.rule}</p>
      </aside>
  </>
}
