import { useState, type ReactNode } from 'react'
import { assetPath } from './assets'
import { partners, type PartnerId } from './partner-roster'
import { TutorialActors, type TutorialMood } from './tutorial-actors'
import type { LessonDialogue, LessonTone } from './tutorial-dialogue'
import { useLessonSpeech } from './tutorial-subtitles'

export function LessonGuide({dialogue,tone,done,cue,table}: {
  dialogue:LessonDialogue; tone:LessonTone; done:boolean; cue:string; table:ReactNode
}) {
  const [painted,setPainted] = useState({left:false,right:false})
  const {left,right,lines} = dialogue
  const speech = useLessonSpeech({id:cue,lines})
  const {speaker} = speech
  const duo = lines.length>1
  const actorCue = cue+'-'+speech.index
  const mood:TutorialMood = tone === 'correct' ? (done ? 'success' : 'correct') : tone === 'retry' ? 'wrong' : tone === 'clue' ? 'clue' : 'explain'
  const label = {guide:'', clue:'線索', correct:done?'答對了':'接風成功', retry:'再試試'}[tone]
  const speakerName = partners.find(actor=>actor.id===dialogue[speaker])!.name
  function portrait(rig:PartnerId,side:'left'|'right') {
    let file=rig+'-seat'
    if (mood==='success' && side===speaker) file='postures/'+rig+'-tutorial-joy'
    else if (tone==='correct') file='postures/'+rig+'-win-hand'
    else if (tone==='retry' && side===speaker) file='postures/'+rig+'-lose-hand'
    return <div className={'lesson-cast-panel '+side} data-painted={painted[side]} aria-hidden="true">
      <img src={assetPath('character/'+file+'.webp')} alt="" draggable="false"/>
    </div>
  }
  return <div className="lesson-guide" data-shot={duo?'duo':'solo'} data-tone={tone} data-mood={mood} data-live={painted.left && (!duo || painted.right)} data-speaker={speaker} data-cue={actorCue}>
    <div className="lesson-actor-stage">
      {portrait(left,'left')}{duo && portrait(right,'right')}
      <div className="tutorial-actors-host">
        <TutorialActors left={left} right={right} paired={duo} speaker={speaker} mood={mood} cue={actorCue} painted={painted} onPaint={setPainted}/>
      </div>
      {duo ? <><div className="lesson-panel-shade left"/><div className="lesson-panel-shade right"/></>
        : <div className="lesson-table-cutaway">{table}</div>}
      <i className="lesson-cast-cut" aria-hidden="true"/>
    </div>
    <div className="lesson-bubble" id="lesson-guide-dialogue">
      <div className="lesson-speaker" aria-hidden="true">{speakerName}{label && <span>{label}</span>}</div>
      <p className="lesson-subtitle-copy" aria-hidden="true">
        <span className="lesson-subtitle-measure">{speech.text}</span>
        <span className="lesson-subtitle-visible">{speech.visibleText}</span>
      </p>
      <span className="lesson-spoken-announcement" role="status" aria-atomic="true">{speakerName}：{speech.text}</span>
      <button type="button" className="lesson-speech-advance" disabled={!speech.typing && !speech.hasNext}
        aria-label={speech.typing?'顯示整句':'下一句'} onClick={speech.advance}>
        <span aria-hidden="true">{speech.typing?'顯示整句':'下一句'} <b>›</b></span>
      </button>
    </div>
  </div>
}
