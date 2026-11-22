import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { adviceInput, places, takeTurn, type Match } from './match'
import { defaultPartnerId } from './partner-roster'
import { allMoves, beats, describe, names, uid, type Move } from './rules'
import { playStyleForSeat } from './table-seats'
import { Icon, PlayingCard } from './ui'
import { useTeamAdvice } from './use-team-advice'
import './style-playout.css'

const player = 2
const seats = ['搭檔','上家對手','你','下家對手']
const moveName = (move: Move) => names[move.kind]+' '+move.label

type PlayoutProps = {
  initialGame: Match
  onFinish: () => void
  onRetry: () => void
  onNext: () => void
}

export function StylePlayout({initialGame,onFinish,onRetry,onNext}: PlayoutProps) {
  const [game,setGame] = useState(initialGame)
  const [selected,setSelected] = useState<string[]>([])
  const [declaration,setDeclaration] = useState(0)
  const [hint,setHint] = useState<'off'|'pending'|'open'>('off')
  const finished = useRef(false)
  const done = game.phase==='result'
  const mine = game.hands[player]
  const myTurn = !done && game.turn===player
  const legal = useMemo(()=>myTurn ? allMoves(mine,game.level).filter(move=>beats(move,game.target)) : [],
    [myTurn,mine,game.level,game.target])
  const noReply = myTurn && !!game.target && !legal.length
  const declarations = useMemo(()=>selected.length ? allMoves(mine.filter(card=>selected.includes(uid(card))),game.level,true)
    .filter(move=>beats(move,game.target)) : [],[mine,selected,game.level,game.target])
  const chosen = declarations[declaration]
  const ask = !done && (!myTurn || hint!=='off')
  const input = useMemo(()=>ask ? adviceInput(game,'advanced',playStyleForSeat(game.turn,defaultPartnerId)) : null,
    [game,ask])
  const {advice} = useTeamAdvice(input)

  useEffect(()=>{
    if (!done || finished.current) return
    finished.current=true
    onFinish()
  },[done,onFinish])

  useEffect(()=>{
    if (!myTurn || hint!=='pending' || !advice) return
    const suggestion=advice.move
    const ids=suggestion?.cards.map(uid) ?? []
    const possible=allMoves(mine.filter(card=>ids.includes(uid(card))),game.level,true)
      .filter(move=>beats(move,game.target))
    setSelected(ids)
    setDeclaration(Math.max(0,possible.findIndex(move=>move.kind===suggestion?.kind && move.value===suggestion.value && move.label===suggestion.label)))
    setHint('open')
  },[myTurn,hint,advice,mine,game.level,game.target])

  useEffect(()=>{
    if (done || (myTurn ? !noReply : !advice)) return
    const move = myTurn ? null : advice!.move
    const timer=window.setTimeout(()=>{
      setSelected([])
      setDeclaration(0)
      setHint('off')
      setGame(current=>current===game ? takeTurn(current,current.turn,move) : current)
    },myTurn ? 950 : 680)
    return ()=>window.clearTimeout(timer)
  },[game,done,myTurn,noReply,advice])

  function submit(move: Move|null) {
    if (!myTurn || (!move && !game.target)) return
    setSelected([])
    setDeclaration(0)
    setHint('off')
    setGame(current=>current===game ? takeTurn(current,player,move) : current)
  }
  function pick(id: string) {
    setHint('off')
    setDeclaration(0)
    setSelected(previous=>previous.includes(id) ? previous.filter(card=>card!==id) : [...previous,id])
  }
  const actions=game.events.slice(initialGame.events.length-1).filter(event=>event.kind==='play'||event.kind==='pass').slice(-4)
  const turnText=(myTurn?'輪到你':'輪到'+seats[game.turn])+(game.target?'跟牌':'領出')

  return <section className="style-playout" aria-label="教學續打">
    <div className="sp-table">
      <div className="sp-table-head"><h3><Icon name="cards"/>目前牌桌</h3><small>級牌 <b>{game.level}</b></small></div>
      <ul className="sp-seats" aria-label="四家剩餘張數">{seats.map((name,seat)=>
        <li key={name} data-turn={!done&&seat===game.turn}><span>{name}</span><b>{game.hands[seat].length} 張</b></li>)}</ul>
      {!done&&<div className="sp-trick">
        <h4>{game.target ? seats[game.holder]+'目前最大' : '由'+seats[game.turn]+'領出'}</h4>
        {game.target&&<div className="lesson-trick" aria-label={'桌面牌 '+describe(game.target.cards)}>
          {game.target.cards.map(card=><PlayingCard key={uid(card)} card={card} level={game.level} mini/>)}
        </div>}
      </div>}
      <div className="sp-log"><h4>最近出牌</h4>
        <ol>{actions.map((event,i)=><li key={game.events.length-actions.length+i}>
          <span>{seats[event.seat]}</span> {event.move?moveName(event.move):'過牌'}
        </li>)}</ol>
      </div>
    </div>
    {done ? <section className="sp-panel sp-result" aria-label="本副結算">
      <span className="sp-kicker"><Icon name="flag"/>本副結算</span>
      <h3>{game.finish[0]%2===0?'我方':'對方'}取得頭游</h3>
      <ol>{game.finish.map((seat,i)=><li key={seat}><span>{places[i]}</span>{seats[seat]}</li>)}</ol>
      <div className="sp-controls"><button type="button" className="btn border" onClick={onRetry}>重試這一手</button>
        <button type="button" className="btn gold" onClick={onNext}>開始遊戲</button></div>
    </section> : <section className="sp-panel" aria-label="你的手牌">
      <div className="sp-hand-head"><h3>你的手牌 <small>{mine.length} 張</small></h3>
        <p className="sp-turn" role="status">{noReply ? '手上沒有能跟的牌，將自動過牌。' : mine.length ? turnText : '你已出完，等待本副結算。'}</p>
      </div>
      {!!mine.length && <div className="lesson-rack sp-rack" style={{'--hand-count':mine.length} as CSSProperties}>
        {mine.map(card=><PlayingCard key={uid(card)} card={card} selected={selected.includes(uid(card))}
          level={game.level} onClick={myTurn&&!noReply?()=>pick(uid(card)):undefined}/>)}
      </div>}
      {myTurn&&<div className="sp-selection" aria-live="polite">
        {declarations.length>1 ? <label>打法 <select aria-label="指定牌型" value={declaration} onChange={e=>setDeclaration(Number(e.target.value))}>
          {declarations.map((move,i)=><option key={i} value={i}>{moveName(move)}</option>)}</select></label>
        : selected.length ? chosen ? '已選 '+moveName(chosen) : '這組牌無法出，點牌可重新選擇。'
        : hint==='open' && advice && !advice.move ? '建議過牌' : noReply ? '' : '點選手牌，再按出牌。'}
      </div>}
      {myTurn && hint!=='off'&&<p className="sp-hint" aria-live="polite">{hint==='pending'?'正在推演…':advice?.reason}</p>}
      <div className="sp-controls">
        <button type="button" className="lesson-hint-toggle" disabled={!myTurn||noReply} aria-expanded={hint!=='off'}
          onClick={()=>setHint(hint==='off'?'pending':'off')}><Icon name="spark" size={15}/>{hint==='off'?'看提示':'收起提示'}</button>
        <button type="button" className="btn border" disabled={!myTurn||!game.target} onClick={()=>submit(null)}>過牌</button>
        <button type="button" className="btn gold" disabled={!myTurn||!chosen||hint==='pending'} onClick={()=>chosen&&submit(chosen)}>出牌</button>
      </div>
    </section>}
  </section>
}
