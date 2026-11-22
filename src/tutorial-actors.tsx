import { useEffect, useRef } from 'react'
import type { createTutorialRenderer, PaintedActors, TutorialShot } from './tutorial-renderer'
export type { TutorialMood, TutorialSide } from './tutorial-performance'

const empty = {left:false,right:false}

export function TutorialActors({left,right,paired,speaker,mood,cue,painted,onPaint}:TutorialShot & {
  painted:PaintedActors; onPaint:(actors:PaintedActors)=>void
}) {
  const canvas=useRef<HTMLCanvasElement>(null)
  const stage=useRef<ReturnType<typeof createTutorialRenderer>|null>(null)
  const snapshot=useRef<TutorialShot>({left,right,paired,speaker,mood,cue})
  const notify=useRef(onPaint)
  useEffect(()=>{notify.current=onPaint},[onPaint])
  useEffect(()=>{
    snapshot.current={left,right,paired,speaker,mood,cue}
    stage.current?.change(snapshot.current)
  },[left,right,paired,speaker,mood,cue])
  useEffect(()=>{
    let active=true
    function display(value:PaintedActors) {
      if (!active) return
      notify.current(value)
    }
    display(empty)
    void import('./tutorial-renderer').then(({createTutorialRenderer})=>{
      if (!active || !canvas.current) return
      stage.current=createTutorialRenderer(canvas.current,display)
      stage.current.change(snapshot.current)
    }).catch(()=>display(empty))
    return ()=>{
      active=false
      stage.current?.dispose()
      stage.current=null
    }
  },[])
  return <canvas ref={canvas} className="tutorial-actors-canvas" aria-hidden="true"
    data-ready={painted.left && (!paired || painted.right)} data-mood={mood} data-speaker={speaker} data-cue={cue}
    style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',opacity:painted.left||painted.right?1:0}}/>
}
