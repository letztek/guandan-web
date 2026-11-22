import { useEffect, useState, type CSSProperties } from 'react'
import { assetPath } from './assets'
import { translate, useLanguage } from './i18n'
import { cardCount, describeCards, moveName } from './match-l10n'
import { uid } from './rules'
import { LessonGuide } from './lesson-guide'
import { StyleLesson } from './style-lesson'
import { lessonDialogue } from './tutorial-dialogue'
import { checkLesson, lessons, type Lesson, type LessonAction } from './tutorial-lessons'
import { lessonFeedback, lessonQuestion, localizedLesson } from './tutorial-l10n'
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
const chapterLabels = {
  入門: ['Basics','基礎'], 組合: ['Combinations','役'], 隊友: ['Teamwork','チーム戦'],
  換副: ['Between deals','次の配札'], 實戰: ['At the table','実戦'],
} as const

export function Tutorial({onHome,onStart,onReady,backLabel='主選單',startWithStyleLesson=false}: TutorialProps) {
  const language=useLanguage()
  const t = (zh:string,en:string,ja:string) => translate(zh,en,ja,language)
  const title = (entry:(typeof catalog)[number]) => 'exercise' in entry
    ? localizedLesson(entry,language).title : t(entry.title,'One 8, Three Play Styles','8の1枚、3つの打ち方')
  const chapterName = (chapter:(typeof chapters)[number]) => t(chapter,chapterLabels[chapter][0],chapterLabels[chapter][1])
  const roomName=t('規則教學','How to Play','遊び方')
  const lessonList=t('課程目錄','Lesson list','レッスン一覧')
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
      <div className="lesson-brand"><Icon name="book" size={24}/><h1>{roomName}</h1></div>
      <label className="lesson-index"><span>{lessonList}</span>
        <select aria-label={lessonList} value={lesson.id} onChange={ev=>setId(ev.target.value)}>
          {chapters.map(chapter=><optgroup label={chapterName(chapter)} key={chapter}>
            {catalog.filter(item=>item.chapter===chapter).map(item=>
              <option key={item.id} value={item.id}>{completed.includes(item.id)?'✓ ':''}{title(item)}</option>)}
          </optgroup>)}
        </select>
      </label>
      <button type="button" className="btn border" onClick={onHome}>{backLabel==='主選單'
        ? t(backLabel,'Main Menu','メインメニュー') : backLabel==='返回牌桌' ? t(backLabel,'Back to Table','対局に戻る') : backLabel}</button>
    </header>
    <section className="lesson-workbench" data-lesson={id} aria-label={t('互動演練','Practice exercise','実践練習')}>
      <div className="lesson-heading">
        <div className="lesson-progress"><span>{chapterName(lesson.chapter)}</span><span>{t(
          `第 ${index+1} / ${catalog.length} 課`,`Lesson ${index+1} / ${catalog.length}`,`第${index+1} / ${catalog.length}課`,
        )}</span></div>
        <h2>{title(lesson)}</h2>
      </div>
      {'exercise' in lesson
        ? <GuidedExercise key={id} chapterLesson={lesson} onComplete={complete} onNext={next}/>
        : <StyleLesson onComplete={complete} onNext={next}/>}
    </section>
  </main>
}

function GuidedExercise({chapterLesson:sourceLesson,onComplete,onNext}:{
  chapterLesson:Lesson; onComplete:()=>void; onNext:()=>void
}) {
  const language=useLanguage()
  const t = (zh:string,en:string,ja:string) => translate(zh,en,ja,language)
  const [selected,setSelected] = useState<string[]>([])
  const [attemptedAction,setAttemptedAction] = useState<LessonAction|null>(null)
  const [showHint,setShowHint] = useState(false)
  const [leading,setLeading] = useState(false)
  const [event,setEvent] = useState(0)
  const chapterLesson=localizedLesson(sourceLesson,language)
  const lesson = leading ? {...chapterLesson,...chapterLesson.afterPass,target:undefined} : chapterLesson
  const feedback=lessonFeedback(language)
  const result=attemptedAction && checkLesson(lesson,selected,attemptedAction,feedback)
  const {kind} = lesson.exercise
  const exchange = kind==='donate' || kind==='return'
  const reveal = kind==='resist'
  const done = result?.ok===true
  const played = done ? result.cards : []
  const visibleHand = reveal ? lesson.hand : lesson.hand.filter(card=>!played.some(sent=>uid(sent)===uid(card)))
  const tableCards = played.length ? played : lesson.target?.cards ?? []
  const playedLabel = reveal ? t('你亮出的兩張大王','Your revealed big jokers','公開した大ジョーカー') : exchange
    ? (kind==='donate' ? t('你進貢的牌','Your tribute card','渡した貢ぎ札') : t('你還的牌','Your returned card','返礼のカード'))
    : t('你打出的牌','Your play','出したカード')
  const boardLabel = played.length ? playedLabel : done && kind==='pass' ? t('隊友收下這圈','Your partner takes the trick','パートナーが取りました') : lesson.target
    ? t('桌面上最大的一手','Current highest play','場の一番強い役') : exchange ? t('換副交牌','Card exchange','カードの交換')
    : reveal ? t('開局判定','Opening check','配札後の確認') : leading ? t('接風後由你領出','You take over the lead','あなたが先出しを引き継ぎます')
    : t('由你領出','You lead','あなたの先出し')
  const canPass = Boolean(lesson.target) && !exchange && !reveal
  const justTookLead = leading && !selected.length && !result
  const tone = showHint ? 'clue' : result ? (done ? 'correct' : 'retry') : justTookLead ? 'correct' : 'guide'
  const line = showHint ? lesson.hint : result?.message ?? (justTookLead ? chapterLesson.success : lesson.prompt)
  const dialogue = lessonDialogue(lesson,tone,line,lessonQuestion(lesson,language))
  const duo = dialogue.lines.length>1
  const situation = !done && !leading ? chapterLesson.scene : ''
  const table = <div className="lesson-table" aria-label={t('目前牌桌','Current table','現在の場')}>
    <div className="lesson-table-heading"><h3>{boardLabel}</h3><span>{t('級牌','Level','レベル')} <b>{lesson.level}</b></span></div>
    {tableCards.length>0
      ? <div key={played.length?'played':'target'} className={'lesson-trick'+(played.length?' dealt':'')} aria-label={boardLabel+' '+describeCards(tableCards)}>
          {tableCards.map(card=><PlayingCard key={uid(card)} card={card} level={lesson.level} mini/>)}
        </div>
      : <div className="lesson-open-space" aria-hidden="true"><Icon name="cards" size={32}/></div>}
    {lesson.target && !played.length && <small>{moveName(lesson.target)}</small>}
    {duo && situation && <p className="lesson-situation">{situation}</p>}
  </div>

  function toggle(id:string) {
    setAttemptedAction(null)
    setSelected(previous=>previous.includes(id)?previous.filter(card=>card!==id):exchange?[id]:[...previous,id])
  }
  function attempt(action:LessonAction) {
    const answer=checkLesson(lesson,selected,action,feedback)
    setEvent(count=>count+1)
    setShowHint(false)
    if(answer.ok && action==='pass' && chapterLesson.afterPass) {
      setLeading(true)
      setSelected([])
      setAttemptedAction(null)
      return
    }
    setAttemptedAction(action)
    if(answer.ok) onComplete()
  }
  function restart() {
    setEvent(count=>count+1)
    setAttemptedAction(null)
    setSelected([])
    setShowHint(false)
    setLeading(false)
  }
  return <>
      <LessonGuide dialogue={dialogue} tone={tone} done={done} cue={lesson.id+'-'+tone+'-'+event} table={table}/>
      <div className="lesson-practice">
        {duo && table}
        {!duo && situation && <div className="lesson-context"><h3><Icon name="cards" size={17}/>{t('牌桌情境','Table setup','場の状況')}</h3><p className="lesson-situation">{situation}</p></div>}
        <div className="lesson-hand">
          <div className="lesson-hand-heading"><h3>{t('你的手牌','Your hand','あなたの手札')}</h3><span>{!done && selected.length>0 && t(
            '已選 '+selected.length+' 張 / ',selected.length+' selected / ',selected.length+'枚選択 / ',
          )}{cardCount(visibleHand.length)}</span></div>
          {visibleHand.length>0 ? <div className="lesson-rack" style={{'--hand-count':visibleHand.length} as CSSProperties}>{visibleHand.map(card=>
            <PlayingCard key={uid(card)} card={card} level={lesson.level} selected={!done && selected.includes(uid(card))}
              onClick={done ? undefined : ()=>toggle(uid(card))}/>)}</div> : <p className="lesson-cleared">{t('手牌已出完','You’re out of cards','手札を出し切りました')}</p>}
          <div className="lesson-actions">
            {done ? <>
              <button className="btn border" onClick={restart} type="button">{t('再試一次','Try again','もう一度')}</button>
              <button className="btn gold" onClick={onNext} type="button">{t('下一課','Next lesson','次のレッスン')}</button>
            </> : <>
              <button type="button" className="lesson-hint-toggle" onClick={()=>{setShowHint(!showHint);setEvent(count=>count+1)}}
                aria-pressed={showHint} aria-controls="lesson-guide-dialogue"><Icon name="spark" size={16}/>{showHint?t('收起線索','Hide clue','ヒントを閉じる'):t('看線索','Show clue','ヒントを見る')}</button>
              {canPass && <button className="btn border" type="button" onClick={()=>attempt('pass')}>{t('過牌','Pass','パス')}</button>}
              <button className="btn gold" type="button" disabled={!selected.length}
                onClick={()=>attempt(reveal?'resist':exchange?kind:'play')}>{reveal?t('亮牌抗貢','Reveal jokers','ジョーカーを公開')
                  :exchange?(kind==='donate'?t('確認進貢','Give tribute','貢ぎ札を渡す'):t('確認還貢','Return card','返礼する')):t('出牌','Play','出す')}</button>
            </>}
          </div>
        </div>
      </div>
      <aside className="lesson-notes" aria-label={t('本課說明','Lesson notes','レッスンの説明')}>
        <h3><Icon name="book" size={16}/>{t('本課規則','Lesson rule','このレッスンのルール')}</h3><p>{lesson.rule}</p>
      </aside>
  </>
}
