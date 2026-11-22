import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { translate, useLanguage } from './i18n'
import { adviceInput, takeTurn, type Match } from './match'
import { adviceReason, cardCount, describeCards, moveName, placeName } from './match-l10n'
import { defaultPartnerId } from './partner-roster'
import { allMoves, beats, uid, type Move } from './rules'
import { playStyleForSeat } from './table-seats'
import { Icon, PlayingCard } from './ui'
import { useTeamAdvice } from './use-team-advice'
import './style-playout.css'

const player = 2

type PlayoutProps = {
  initialGame: Match
  onFinish: () => void
  onRetry: () => void
  onNext: () => void
}

export function StylePlayout({initialGame,onFinish,onRetry,onNext}: PlayoutProps) {
  const language=useLanguage()
  const t = (zh:string,en:string,ja:string) => translate(zh,en,ja,language)
  const seats = [t('搭檔','Partner','パートナー'),t('上家對手','Previous opponent','前の相手'),
    t('你','You','あなた'),t('下家對手','Next opponent','次の相手')]
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
  const turnName = seats[game.turn]
  const turnText = game.target
    ? t('輪到'+turnName+'跟牌',myTurn?'Your turn to follow':turnName+' to follow',turnName+'が対抗する番')
    : t('輪到'+turnName+'領出',myTurn?'Your turn to lead':turnName+' to lead',turnName+'が先出しする番')
  const first = game.finish[0]%2===0
  const summary = first ? t('我方取得頭游','Your team took first place','あなたのチームが1位')
    : t('對方取得頭游','The opposing team took first place','相手チームが1位')
  const resultLabel=t('本副結算','Deal result','この配札の結果')
  const handLabel=t('你的手牌','Your hand','あなたの手札')
  const passLabel=t('過牌','Pass','パス')

  return <section className="style-playout" aria-label={t('教學續打','Play out the lesson','レッスンの続き')}>
    <div className="sp-table">
      <div className="sp-table-head"><h3><Icon name="cards"/>{t('目前牌桌','Current table','現在の場')}</h3><small>{t('級牌','Level','レベル')} <b>{game.level}</b></small></div>
      <ul className="sp-seats" aria-label={t('四家剩餘張數','Cards left by seat','各プレイヤーの残り枚数')}>{seats.map((name,seat)=>
        <li key={seat} data-turn={!done&&seat===game.turn}><span>{name}</span><b>{cardCount(game.hands[seat].length)}</b></li>)}</ul>
      {!done&&<div className="sp-trick">
        <h4>{game.target ? t(seats[game.holder]+'目前最大','Highest play: '+seats[game.holder],seats[game.holder]+'が一番強い')
          : t('由'+turnName+'領出','Leader: '+turnName,turnName+'が先出し')}</h4>
        {game.target&&<div className="lesson-trick" aria-label={t('桌面牌','Table cards','場のカード')+' '+describeCards(game.target.cards)}>
          {game.target.cards.map(card=><PlayingCard key={uid(card)} card={card} level={game.level} mini/>)}
        </div>}
      </div>}
      <div className="sp-log"><h4>{t('最近出牌','Recent plays','直近の手')}</h4>
        <ol>{actions.map((event,i)=><li key={game.events.length-actions.length+i}>
          <span>{seats[event.seat]}</span> {event.move?moveName(event.move):passLabel}
        </li>)}</ol>
      </div>
    </div>
    {done ? <section className="sp-panel sp-result" aria-label={resultLabel}>
      <span className="sp-kicker"><Icon name="flag"/>{resultLabel}</span>
      <h3>{summary}</h3>
      <ol>{game.finish.map((seat,i)=><li key={seat}><span>{placeName(i)}</span>{seats[seat]}</li>)}</ol>
      <div className="sp-controls"><button type="button" className="btn border" onClick={onRetry}>{t('重試這一手','Retry this play','この手をやり直す')}</button>
        <button type="button" className="btn gold" onClick={onNext}>{t('開始遊戲','Start game','ゲーム開始')}</button></div>
    </section> : <section className="sp-panel" aria-label={handLabel}>
      <div className="sp-hand-head"><h3>{handLabel} <small>{cardCount(mine.length)}</small></h3>
        <p className="sp-turn" role="status">{noReply ? t('手上沒有能跟的牌，將自動過牌。','No legal reply. You will pass automatically.','対抗できるカードがないため、自動でパスします。')
          : mine.length ? turnText : t('你已出完，等待本副結算。','You’re out of cards. Waiting for the result.','上がりました。結果をお待ちください。')}</p>
      </div>
      {!!mine.length && <div className="lesson-rack sp-rack" style={{'--hand-count':mine.length} as CSSProperties}>
        {mine.map(card=><PlayingCard key={uid(card)} card={card} selected={selected.includes(uid(card))}
          level={game.level} onClick={myTurn&&!noReply?()=>pick(uid(card)):undefined}/>)}
      </div>}
      {myTurn&&<div className="sp-selection" aria-live="polite">
        {declarations.length>1 ? <label>{t('打法','Pattern','役')} <select aria-label={t('指定牌型','Choose pattern','役を選ぶ')} value={declaration} onChange={e=>setDeclaration(Number(e.target.value))}>
          {declarations.map((move,i)=><option key={i} value={i}>{moveName(move)}</option>)}</select></label>
        : selected.length ? chosen ? t('已選 ','Selected: ','選択中：')+moveName(chosen)
          : t('這組牌無法出，點牌可重新選擇。','These cards can’t be played. Try a different selection.','この組み合わせでは出せません。カードを選び直してください。')
        : hint==='open' && advice && !advice.move ? t('建議過牌','Pass recommended','パスがおすすめ') : noReply ? ''
          : t('點選手牌，再按出牌。','Select cards, then press Play.','手札を選び、「出す」を押してください。')}
      </div>}
      {myTurn && hint!=='off'&&<p className="sp-hint" aria-live="polite">{hint==='pending'
        ? t('正在推演…','Considering your options…','手を検討中…') : advice ? adviceReason(advice.reason) : ''}</p>}
      <div className="sp-controls">
        <button type="button" className="lesson-hint-toggle" disabled={!myTurn||noReply} aria-expanded={hint!=='off'}
          onClick={()=>setHint(hint==='off'?'pending':'off')}><Icon name="spark" size={15}/>{hint==='off'
            ? t('看提示','Show hint','ヒントを見る') : t('收起提示','Hide hint','ヒントを閉じる')}</button>
        <button type="button" className="btn border" disabled={!myTurn||!game.target} onClick={()=>submit(null)}>{passLabel}</button>
        <button type="button" className="btn gold" disabled={!myTurn||!chosen||hint==='pending'} onClick={()=>chosen&&submit(chosen)}>{t('出牌','Play','出す')}</button>
      </div>
    </section>}
  </section>
}
