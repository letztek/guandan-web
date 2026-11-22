import { useCallback, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { SpeechLine } from './tutorial-dialogue'

type Cursor = {id:string; index:number; count:number}
const initial = (id:string):Cursor => ({id,index:0,count:1})

export function useLessonSpeech({id,lines,characterDelay=34}:{id:string; lines:SpeechLine[]; characterDelay?:number}) {
  const [cursor,setCursor]=useState(()=>initial(id))
  const [preference]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)'))
  const subscribe=useCallback((sync:()=>void)=>{
    preference.addEventListener('change',sync)
    return ()=>preference.removeEventListener('change',sync)
  },[preference])
  const reduced=useSyncExternalStore(subscribe,()=>preference.matches)

  // Cancel the previous cue immediately, even when its last line is still pending.
  useLayoutEffect(()=>{
    setCursor(current=>current.id===id ? current : initial(id))
  },[id])
  const {index,count}=cursor.id===id ? cursor : initial(id)
  const {speaker,text}=lines[index]
  const glyphs=useMemo(()=>Array.from(text),[text])
  const typing=!reduced && count<glyphs.length
  const hasNext=index+1<lines.length

  useEffect(()=>{
    function reveal(n:number) {
      setCursor(current=>current.id===id && current.index===index && current.count<n ? {...current,count:n} : current)
    }
    if (reduced) {reveal(glyphs.length);return}
    if (!typing) return
    // Measure from the start of the line so slow 3D frames do not delay every character.
    let shown=1, due=performance.now(), timer:number
    function tick() {
      const now=performance.now()
      while (shown<glyphs.length) {
        const next=due+(/[,.!?;:，。！？；、：]/u.test(glyphs[shown-1]) ? 115 : characterDelay)
        if (next>now) {timer=window.setTimeout(tick,next-now);break}
        due=next
        shown++
      }
      reveal(shown)
    }
    tick()
    return ()=>window.clearTimeout(timer)
  },[id,index,glyphs,reduced,typing,characterDelay])

  useEffect(()=>{
    if (typing || !hasNext) return
    const timer=window.setTimeout(()=>{
      setCursor(current=>current.id===id && current.index===index ? {id,index:index+1,count:1} : current)
    },1100+glyphs.length*characterDelay*1.6)
    return ()=>window.clearTimeout(timer)
  },[id,index,glyphs,hasNext,typing,characterDelay])

  function advance() {
    if (!typing && !hasNext) return
    setCursor(current=>{
      if (current.id!==id || current.index!==index) return current
      return typing ? {...current,count:glyphs.length} : {id,index:index+1,count:1}
    })
  }
  return {index,speaker,text,visibleText:typing?glyphs.slice(0,count).join(''):text,typing,hasNext,advance}
}
