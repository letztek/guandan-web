import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { assetPath } from './assets'
import { places, teamOf, type Match } from './match'
import { tableSeatsFor } from './table-seats'
import { defaultPartnerId, type PartnerId } from './partner-roster'
import { startsNewTableHand, tablePosture, tableReactions } from './table-reactions'
import type { Card } from './rules'
import type { mountTable } from './tabletop'

type Table = ReturnType<typeof mountTable>
type Mode = 'loading'|'3d'|'portrait'

function seatPortrait(game:Match,seat:ReturnType<typeof tableSeatsFor>[number]){
  const empty=game.hands[seat.number].length===0
  let pose='rest'
  if(game.phase==='result'){
    const outcome=teamOf(game.finish[0])===teamOf(seat.number)?'win':'lose'
    pose=outcome+(empty?'-rest':'-hand')
  }else if(!empty)return seat.portrait
  return 'character/postures/'+seat.model+'-'+pose+'.webp'
}

type TableProps = {game:Match;cards:Card[];player:number;playKey:string;hand:Card[];selected:string[];onSceneReady:(mode:'battle')=>void}

export function SharedTable({partnerId=defaultPartnerId,...props}:TableProps & {partnerId?:PartnerId}){
  return <SeatedTable key={partnerId} partnerId={partnerId} {...props}/>
}

function SeatedTable({game,cards,player,playKey,hand,selected,onSceneReady,partnerId}:TableProps & {partnerId:PartnerId}){
  const seats=useMemo(()=>tableSeatsFor(partnerId),[partnerId])
  const partner=seats.find(seat=>seat.number===2)!
  const canvas=useRef<HTMLCanvasElement>(null), table=useRef<Table|null>(null)
  const labels=useRef(new Map<number,HTMLButtonElement>())
  const portraitCanvas=useRef<HTMLCanvasElement>(null)
  const [focusSeat,setFocusSeat]=useState<number|null>(null)
  const [faceFallback,setFaceFallback]=useState(false)
  const [visible,setVisible]=useState(false),[error,setError]=useState(false)
  const [modes,setModes]=useState<Record<number,Mode>>({})
  const current=useRef({game,cards,player,playKey,hand,selected})
  current.current={game,cards,player,playKey,hand,selected}
  const lastShown=useRef(playKey)
  const lastGame=useRef(game)
  useEffect(()=>{
    if(error||seats.every(seat=>Boolean(modes[seat.number])))onSceneReady('battle')
  },[modes,error,onSceneReady,seats])
  useEffect(()=>{
    let active=true
    function fallback(){if(active){setVisible(false);setError(true)}}
    import('./tabletop').then(({mountTable})=>{
      if(!active||!canvas.current)return
      const instance=mountTable(canvas.current,
        (id,mode)=>{if(active)setModes(previous=>({...previous,[id]:mode}))},
        (id,x,y)=>{const tag=labels.current.get(id);if(tag){tag.style.left=x+'%';tag.style.top=y+'%'}}, fallback, partnerId)
      table.current=instance
      const state=current.current
      instance.setCounts(state.game.hands.map(h=>h.length))
      instance.setHand(state.hand,state.selected)
      instance.showPlay(state.cards,state.player,false)
      instance.showReactions(tablePosture(state.game),false)
      lastGame.current=state.game
      lastShown.current=state.playKey;setVisible(true)
    }).catch(fallback)
    return ()=>{active=false;table.current?.dispose();table.current=null}
  },[partnerId])
  useEffect(()=>{table.current?.setCounts(game.hands.map(h=>h.length))},[game.hands])
  useEffect(()=>{table.current?.setHand(hand,selected)},[hand,selected])
  const focusPerson=seats.find(seat=>seat.number===focusSeat)
  const liveFace=focusSeat!==null&&!error&&!faceFallback&&modes[focusSeat]==='3d'
  function chooseSeat(id:number){setFaceFallback(false);setFocusSeat(focusSeat===id?null:id)}
  function closeFace(){if(focusSeat!==null)labels.current.get(focusSeat)?.focus({preventScroll:true});setFocusSeat(null)}
  useEffect(()=>{
    const instance=table.current
    if(focusSeat!==null&&liveFace&&portraitCanvas.current){
      instance?.setFaceView(focusSeat,portraitCanvas.current,()=>setFaceFallback(true))
    }
    return ()=>instance?.setFaceView(null)
  },[focusSeat,liveFace])
  useEffect(()=>{
    if(focusSeat===null)return
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]'))closeFace()}
    window.addEventListener('keydown',escape)
    return ()=>window.removeEventListener('keydown',escape)
  },[focusSeat])
  useEffect(()=>{
    const previous=lastGame.current, instance=table.current
    const restarted=startsNewTableHand(previous,game)
    if(restarted)instance?.resetReactions()
    if(lastShown.current!==playKey||restarted)instance?.showPlay(current.current.cards,current.current.player,!restarted)
    if(instance&&previous!==game){
      const cues=tableReactions(previous,game)
      if(cues.length)instance.showReactions(cues,!restarted)
    }
    lastGame.current=game
    lastShown.current=playKey
  },[game,playKey])
  return <div className={'table-render '+(visible?'has-scene':'flat-scene')} data-rendering={visible?'3d':error?'fallback':'loading'}
    style={{'--room-wall':'url("'+assetPath('art/room.jpg')+'")'} as CSSProperties}>
    <canvas ref={canvas} className="room-canvas" role="img" aria-label={`三維牌桌，對面的${partner.name}是你的隊友`}/>
    {seats.map(info=>{
      const id=info.number,rank=game.finish.indexOf(id)
      const mode=error?'portrait':modes[id]??'loading'
      return <div className={'table-seat seat-marker-'+id} key={id} data-rendering={mode} data-model={info.model}>
        {mode==='portrait'&&<img className="fallback-seat" src={assetPath(seatPortrait(game,info))} alt={info.name}/>}
        <button type="button" aria-label={info.name+'，表情近看'} aria-expanded={focusSeat===id} aria-controls="seat-closeup-slot" title={info.name+' · 表情近看'}
          onClick={()=>chooseSeat(id)} className={'seat-tag '+(id===2?'ally':'rival')+(game.phase!=='result'&&game.turn===id?' acting':'')+(rank<0&&game.hands[id].length===1?' short-hand':'')}
          ref={el=>{if(el)labels.current.set(id,el);else labels.current.delete(id)}}>
          <span className="affiliation">{id===2?'隊友':'對手'}</span><strong>{info.name}</strong><span>{rank>=0?places[rank]:'剩 '+game.hands[id].length+' 張'}</span>
        </button>
      </div>
    })}
    {error&&<span className="table-compatibility">靜態相容模式</span>}
    {focusPerson&&document.getElementById('seat-closeup-slot')&&createPortal(
      <section className="seat-closeup" aria-label={focusPerson.name+'的表情近看'}>
        <div className="seat-closeup-picture">
          {liveFace?<canvas ref={portraitCanvas} aria-label={focusPerson.name+'即時表情'} role="img"/>:
            <img src={assetPath(seatPortrait(game,focusPerson))} alt={focusPerson.name+'靜態肖像'}/>}
        </div>
        <div className="seat-closeup-caption"><span>{liveFace?'表情近看':'靜態肖像'}</span><strong>{focusPerson.name}</strong></div>
        <button type="button" className="size-btn" onClick={closeFace}>關閉近看</button>
      </section>,document.getElementById('seat-closeup-slot')!
    )}
  </div>
}
