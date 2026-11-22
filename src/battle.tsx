import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SharedTable } from './shared-table'
import { characterName, playStyleForSeat } from './table-seats'
import type { PartnerId } from './partner-roster'
import type { MusicScene } from './room-music'
import { DeckProof } from './deck-proof'
import { MatchFinale } from './match-finale'
import { adviceInput, botStep, exchangeOptions, giveCard, nextHand, openingTributeNotice, places, seatName, startMatch, takeTurn, teamOf, type Match } from './match'
import { levelSelectionHint } from './level-selection'
import { useTeamAdvice } from './use-team-advice'
import { difficultyForSeat, type BotStrengths } from './difficulty'
import { autoPass, automaticPassText, canAutoPass } from './auto-pass'
import { allMoves, beats, describe, names, power, uid, type Card, type Move } from './rules'
import { Icon, Modal, PlayingCard } from './ui'
import { localGameKey, readLocalGame, updateLocalGame, type LocalGame } from './local-game'

function showMove(move: Move) { return names[move.kind]+' · '+move.label }
function castText(move: Move) {
  const as=Object.values(move.as)
  return as.length?'紅心級牌代 '+as.join('、'):''
}
const ruleBook = [
  ['整場勝利條件','雙方從 2 起級。輪到己方主打 A 的那一副，要由一位隊友先出完拿頭游，另一位拿二游或三游，才算過 A 並贏得整場。'],
  ['座位與領出','你選的隊友坐在對面，左右兩席是對手。兩副共 108 張，每人 27 張。首副由抓到翻牌的人領出，依你、右家、對家、左家的逆時針順序輪流行動。'],
  ['跟牌與過牌','領出可打任一合法牌型，跟牌要用較大的同型牌，或能壓住它的炸彈、同花順、四王。領出不能過牌。別人加壓後，先前過牌的人仍有機會再跟。'],
  ['三條（三張）','三張同點數的牌可單獨領出，或跟比它小的三條。打 5 時，兩張 A 加 ♥5 可當三條 A；若桌面是對子，就要用對子或炸彈類牌型來跟。'],
  ['連續牌型與逢人配','順子固定五張，三連對是三組連續對子，鋼板是兩組連續三張。A 可當最低或最高，K、A、2 不可相連。紅心級牌能代替普通牌，不能代王。選牌有多種合法解讀時可指定打法。'],
  ['炸彈大小','四王最大。六張以上炸彈可壓同花順，同花順可壓五張或四張炸彈。炸彈先比較張數，再比較點數。三帶對比較三張的點數。'],
  ['接風與升級','其餘仍有牌的玩家都過牌後，最後出牌者重新領出；若其手牌已空，由搭檔接風。頭游的隊友是二游、三游、末游，分別升 3、2、1 級。同隊包辦頭兩名，該副即結束。'],
  ['進貢、還貢、抗貢','從第二副起，末游向頭游進貢，雙下則兩人各貢一張。進貢選紅心級牌以外最大牌，還貢選牌力不高於 10 的牌；若全高於 10，還最小牌。雙貢較大者給頭游，同點由頭游右家貢給頭游。單貢時末游一人持兩張大王，或雙貢時兩位進貢者合持兩張大王，就自動抗貢，由上副頭游先出。'],
]
type TableDialog = 'menu' | 'rules' | 'history' | 'restart' | 'cards' | ''
const declarationKey = (move: Move) => [move.kind, move.value, move.label].join('/')

function TurnContext({ game, partnerId }: { game: Match; partnerId: PartnerId }) {
  const { target, phase, turn } = game
  const exchanging = phase === 'donate' || phase === 'return'
  const action = phase === 'donate' ? '進貢' : phase === 'return' ? '還貢' : target ? '跟牌' : '領出'
  const cue = target ? (game.holder===2?'隊友':'')+characterName(game.holder,partnerId)+'目前最大' : '第 '+game.handNo+' 副 · 第 '+game.trick+' 圈'
  const title = exchanging ? action : target ? (target.kind==='single'?'單張 '+target.label:showMove(target)) : '自由領出'
  const tributeNotice = openingTributeNotice(game)
  let instruction = '輪到'+characterName(turn,partnerId)+action+'。'
  if (turn===0 && exchanging) instruction += '請從亮起的牌中選一張，再按確認。'
  if (turn===0 && !exchanging) instruction += target ? '可以壓過桌面，或過牌。' : '選一組手牌開始這圈。'
  if (turn!==0 && !exchanging && game.hands[0].length) instruction += '你可以先選牌。'
  return <div className="turn-context">
    {target && <div className="turn-context-print" aria-label={'桌面牌 '+describe(target.cards)}
      style={{'--card-total':target.cards.length} as React.CSSProperties}>
      {target.cards.map(c=><PlayingCard key={uid(c)} card={c} level={game.level} mini/>)}
    </div>}
    <div className="turn-context-text" aria-live="polite" aria-atomic="true">
      <small>{cue}</small><h2>{title}</h2><p>{instruction}{target&&castText(target) ? ' '+castText(target):''}</p>
      {tributeNotice && <p className="tribute-notice">{tributeNotice}</p>}
    </div>
  </div>
}

function HandResult({ game, partnerId }: { game: Match; partnerId: PartnerId }) {
  const winner=teamOf(game.finish[0])
  return <section className="result-panel" aria-label="本副結算">
    <small>第 {game.handNo} 副結算</small>
    <h2>{winner===0?'我方':'對方'}{game.won?'過 A 獲勝':'取得頭游'}</h2>
    <p>{game.finish.length===2?'頭游、二游同隊。':''}{game.won?'本場結束。':game.owner===winner&&game.level==='A'?'頭游的隊友為末游，下一副繼續主打 A。':'本副升 '+game.gain+' 級，下副主打 '+game.scores[winner]+'。'}</p>
    <ol className="finish-list">{game.finish.map((seat,i)=><li key={seat}>{places[i]} <b>{characterName(seat,partnerId)}</b></li>)}</ol>
  </section>
}

export function Battle({initialSave,autoPassEnabled,strengths,onMusicScene,onChoosePartner,onTutorial,onHome,onSettings,onSceneReady,arriving,paused}:{
  initialSave:LocalGame; autoPassEnabled:boolean; strengths:BotStrengths; onChoosePartner:()=>void
  onMusicScene:(scene:MusicScene)=>void
  onHome:()=>void; onSettings:()=>void; onTutorial:()=>void; onSceneReady:(mode:'battle')=>void; arriving:boolean; paused:boolean
}) {
  const [save,setSave]=useState(initialSave)
  const latest=useRef(initialSave)
  const {game,partnerId}=save
  const [conflict,setConflict]=useState(false)
  const [selected,setSelected]=useState<string[]>([])
  const [declared,setDeclared]=useState('')
  const [modal,setModal]=useState<TableDialog>(()=>location.hash==='#cards'?'cards':'')
  const [large,setLarge]=useState(false)
  const [hintState,setHintState]=useState<'closed'|'selecting'|'open'>('closed')
  const hintOpen=hintState!=='closed'
  const [readyTurn,setReadyTurn]=useState<Match|null>(null)
  const [error,setError]=useState('')
  const blocked=arriving||Boolean(modal)||paused||conflict
  const commit=useCallback((expected:LocalGame,next:Match)=>{
    if (latest.current!==expected) return false
    const updated=updateLocalGame(expected,next)
    if (!updated) {setModal('');setConflict(true);return false}
    // Persist in the action itself, including the final move before a tab closes.
    latest.current=updated
    setSave(updated)
    return true
  },[])
  useEffect(()=>{
    function changed(event:StorageEvent) {
      if (event.key!==localGameKey && event.key!==null) return
      const fresh=readLocalGame(), current=latest.current
      if (!fresh || fresh.id!==current.id || fresh.revision!==current.revision || fresh.savedAt!==current.savedAt) {
        setModal('');setConflict(true)
      }
    }
    window.addEventListener('storage',changed)
    return ()=>window.removeEventListener('storage',changed)
  },[])
  useEffect(()=>{
    const openProof=()=>{if(location.hash==='#cards')setModal('cards')}
    window.addEventListener('hashchange',openProof)
    return ()=>window.removeEventListener('hashchange',openProof)
  },[])
  const mine=game.hands[0], done=game.phase==='result', myTurn=!done && game.turn===0
  let musicScene:MusicScene='table'
  if (done) {
    const ourTeamWon=teamOf(game.finish[0])===0
    musicScene=game.won?(ourTeamWon?'matchWin':'matchLoss'):(ourTeamWon?'win':'loss')
  }
  else if (game.phase==='play' && game.hands.some(hand=>hand.length<=3)) musicScene='endgame'
  useEffect(()=>{onMusicScene(musicScene)},[musicScene,onMusicScene])
  const exchanging=game.phase==='donate'||game.phase==='return'
  const exchangeLabel=game.phase==='donate'?'進貢':'還貢'
  const target=game.target
  const hand=useMemo(()=>[...mine].sort((a,b)=>power(a.rank,game.level)-power(b.rank,game.level)||'SHCDJ'.indexOf(a.suit)-'SHCDJ'.indexOf(b.suit)),[mine,game.level])
  const selectedMoves=useMemo(()=>{
    if (game.phase!=='play'||!selected.length) return []
    return allMoves(mine.filter(card=>selected.includes(uid(card))),game.level,true)
  },[game.phase,game.level,mine,selected])
  const choices=selectedMoves.filter(option=>beats(option,target))
  const move=choices.find(option=>declarationKey(option)===declared)??choices[0]
  const strength=difficultyForSeat(game.turn,strengths)
  const style=playStyleForSeat(game.turn,partnerId)
  const analysisInput=useMemo(()=>game.phase==='play'&&!blocked&&(!myTurn||hintOpen)?adviceInput(game,strength,style):null,
    [game,blocked,myTurn,hintOpen,strength,style])
  const {advice,fallback}=useTeamAdvice(analysisInput)
  useEffect(()=>{
    if (hintState!=='selecting' || !myTurn || game.phase!=='play' || !advice) return
    const suggestion=advice.move
    setSelected(suggestion ? suggestion.cards.map(uid) : [])
    setDeclared(suggestion ? declarationKey(suggestion) : '')
    setError('')
    setHintState('open')
  },[hintState,myTurn,game.phase,advice])
  const gifts=exchanging&&myTurn?exchangeOptions(game):[]
  const giftPick=gifts.find(c=>selected.includes(uid(c)))
  const lastPlay=[...game.events].reverse().find(e=>e.kind==='play')
  const displayed=target??(done?lastPlay?.move:null)
  const lastEvent=game.events.at(-1)
  const lastAction=[...game.events].reverse().find(event=>event.kind!=='system')
  const justAutoPassed=lastAction?.seat===0 && lastAction.kind==='pass' &&
    (lastAction.text===automaticPassText || lastAction.text==='自動過牌（最後一張無法跟牌）')
  const autoPassPending=useMemo(()=>autoPassEnabled&&!blocked&&canAutoPass(game),[autoPassEnabled,blocked,game])
  const phaseText=exchanging?exchangeLabel:target?'跟牌':'領出'

  function clear() {setSelected([]);setDeclared('');setHintState('closed');setError('')}
  function toggleHint() {
    if (hintOpen) setHintState('closed')
    else setHintState(exchanging ? 'open' : 'selecting')
  }
  function editDeclaration(key: string) {
    setDeclared(key)
    // A manual edit takes priority if the local coach is still thinking.
    if (hintState==='selecting') setHintState('open')
  }
  function pick(card: Card) {
    const id=uid(card)
    setError('');editDeclaration('')
    setSelected(old=>{
      if (old.includes(id)) return old.filter(value=>value!==id)
      return exchanging?[id]:[...old,id]
    })
  }
  function submit(play: Move|null) {
    if (!myTurn || game.phase!=='play') return
    try {if (commit(save,takeTurn(game,0,play))) clear()} catch(e){setError((e as Error).message)}
  }
  function confirmSelection() {
    if (!myTurn || hintState==='selecting') return
    if (exchanging && giftPick) {
      try {if (commit(save,giveCard(game,0,giftPick))) clear()} catch(e){setError((e as Error).message)}
    } else if (move) submit(move)
  }
  function newDeal(next: Match) {if (commit(save,next)) {clear();setModal('')}}
  function reloadSave() {
    const fresh=readLocalGame()
    if (!fresh) {onHome();return}
    latest.current=fresh;setSave(fresh);clear();setModal('');setConflict(false)
  }
  useEffect(()=>{
    if(!autoPassPending)return
    let cancelled=false
    const timer=window.setTimeout(()=>{
      if(cancelled)return
      if (commit(save,autoPass(game))) clear()
    },500)
    return ()=>{cancelled=true;window.clearTimeout(timer)}
  },[save,game,autoPassPending,commit])
  useEffect(()=>{
    setReadyTurn(null)
    if(blocked||done||myTurn)return
    const timer=window.setTimeout(()=>setReadyTurn(game),game.phase==='play'?1050:650)
    return ()=>window.clearTimeout(timer)
  },[game,done,myTurn,blocked])
  useEffect(()=>{
    if(readyTurn!==game||blocked||done||myTurn)return
    if(game.phase==='play'&&!advice)return
    commit(save,game.phase==='play'?takeTurn(game,game.turn,advice!.move):botStep(game))
  },[readyTurn,save,game,advice,blocked,done,myTurn,commit])

  let status='尚未選牌'
  if (done) status=game.won?'本場已結束':'本副已結算'
  else if (!mine.length) status='你已出完手牌'
  else if (giftPick) status='已選 '+describe([giftPick])
  else if (exchanging) status=myTurn?'請選一張'+exchangeLabel+'的牌':'等待'+characterName(game.turn,partnerId)+exchangeLabel
  else if (selected.length) {
    const selection=myTurn?'已選':'預選'
    if (move) status=selection+' '+showMove(move)+(castText(move)?' · '+castText(move):'')
    else status=levelSelectionHint(mine.filter(c=>selected.includes(uid(c))),game.level,target) ??
      (selection+' '+selected.length+' 張 · '+(selectedMoves.length?'壓不過目前桌面':'尚未組成牌型'))
  }
  const invalid=Boolean(selected.length && !exchanging && !move && !done)
  return <div className="battle play-table"><main>
    <header className="match-bar">
      <div className="match-title"><span className="crest" aria-hidden="true"><Icon name="cards" size={26}/></span><h1>二對二對戰</h1></div>
      <div className="match-score" aria-label="雙方級數"><span>我方 <b>{game.scores[0]}</b></span><span>對方 <b>{game.scores[1]}</b></span></div>
      <div className="match-tools"><button className="btn border" onClick={onTutorial}><Icon name="book" size={15}/>規則教學</button>
        <button className="btn border" onClick={()=>setModal('menu')} aria-haspopup="dialog"><Icon name="tune" size={15}/>牌桌選單</button></div>
    </header>
    {save.storage!=='device'&&<p className="inline-hint" role="status">{save.storage==='tab'?'進度僅存於本分頁，關閉分頁後可能遺失。':'瀏覽器目前無法儲存，重新載入或關閉分頁後會失去目前進度。'}</p>}
    <div className="match-layout">
      <div className="battle-overview">
      <section className="stage battle-stage" aria-label="四人對戰牌桌">
        <div className="stage-border"/><div className="table-caption">第 {game.handNo} 副 · 第 {game.trick} 圈</div>
        <div className="table-grade">級牌 <b>{game.level}</b></div>
        <SharedTable partnerId={partnerId} onSceneReady={onSceneReady} game={game} hand={hand} selected={selected} cards={displayed?.cards??[]} player={lastPlay?.seat??0}
          playKey={game.handNo+'-'+game.trick+'-'+(displayed&&lastPlay?game.events.indexOf(lastPlay):'clear')}/>
        <div className={'turn-strip'+(myTurn?' your-turn':'')}><i/>{done?'本副結算':justAutoPassed&&!myTurn?'你已自動過牌':lastEvent?.kind==='pass'?characterName(lastEvent.seat,partnerId)+' 已過牌':myTurn?'輪到你'+phaseText:characterName(game.turn,partnerId)+' '+phaseText}</div>
      </section>
      <div id="seat-closeup-slot"/>
      {!done&&<TurnContext game={game} partnerId={partnerId}/>}
      </div>
      <section className="hand-panel battle-hand" aria-label="玩家操作區">
        {done&&<HandResult game={game} partnerId={partnerId}/>}
        {done&&game.won&&<MatchFinale key={save.id+'-'+game.handNo} game={game} partnerId={partnerId} available={!blocked}
          onReview={()=>setModal('history')} onRematch={()=>setModal('restart')}/>}
        <header className="panel-heading"><div className="heading-pair"><Icon name="cards" size={19}/><h2>我的手牌</h2><span className="count">{mine.length} 張</span></div>
          <div className="hand-tools"><button className="size-btn" onClick={()=>setLarge(!large)} aria-pressed={large}><Icon name="expand" size={15}/>{large?'縮小':'放大'}</button>
            {!done&&<button className="size-btn hint-toggle" disabled={!myTurn} aria-expanded={hintOpen} aria-controls="turn-hint" onClick={toggleHint}>
              <Icon name="spark" size={15}/>{hintOpen?'收起提示':'看提示'}</button>}</div>
        </header>
        {game.phase==='play'&&(autoPassPending||justAutoPassed)&&<p className="inline-hint auto-pass-option" role="status">
          {autoPassPending?'手上沒有能壓過桌面的牌，稍後自動過牌。':'手上沒有能壓過桌面的牌，已自動過牌。'}
        </p>}
        {hintOpen&&myTurn&&<div className="inline-hint" id="turn-hint" role="region" aria-label="本手提示" aria-live="polite" aria-busy={!exchanging&&!advice}>
          {exchanging?<><strong>{exchangeLabel}提示</strong><p>{game.phase==='donate'?'可從亮起的牌選一張進貢。逢人配留在手上，其他牌取牌力最高者。':'可還牌力不高於 10 的牌；若全都超過 10，還牌力最低的一張。'}</p></>:
            advice?<><strong>你的提示（{characterName(2,partnerId)}牌風） · {advice.move?'建議出 '+describe(advice.move.cards):'建議過牌'}</strong><p>{advice.reason}</p>{fallback&&<p>多輪推演暫時無法使用，這次採用本機快速判斷。</p>}</>:
              <p>正在本機推演後續出牌與隊友配合…</p>}
        </div>}
        <div className={'battle-rack '+(large?'large':'')}>{hand.map((card,i)=>{
          const allowed=!exchanging||gifts.some(g=>uid(g)===uid(card))
          return <div key={uid(card)} style={{'--card-i':i} as React.CSSProperties} className={exchanging&&myTurn?(allowed?'exchange-ok':'ineligible'):''}>
            <PlayingCard card={card} selected={selected.includes(uid(card))} level={game.level} onClick={!done&&allowed?()=>pick(card):undefined}/>
          </div>
        })}</div>
        {choices.length>1&&myTurn&&<label className="declare">這手牌的打法 <select aria-label="指定牌型" value={declarationKey(move)} onChange={e=>editDeclaration(e.target.value)}>
          {choices.map(option=><option key={declarationKey(option)} value={declarationKey(option)}>{showMove(option)} {castText(option)}</option>)}
        </select></label>}
        <div className="hand-footer"><span className={'selection-note'+(invalid||error?' invalid':'')} aria-live="polite">{error||status}</span>
          <div className="hand-actions">{done?<button className="btn gold" onClick={()=>newDeal(game.won?startMatch():nextHand(game))}>{game.won?'再開一場':'開始下一副'}<Icon name="arrow" size={15}/></button>:<>
            {!exchanging&&<button className="btn border" disabled={!myTurn||!target} onClick={()=>submit(null)}>過牌</button>}
            <button className="btn gold" disabled={!myTurn||hintState==='selecting'||!(exchanging?giftPick:move)} onClick={confirmSelection}>{exchanging?'確認'+exchangeLabel:'出牌'}<Icon name="arrow" size={15}/></button>
          </>}</div>
        </div>
      </section>
    </div></main>
    {modal==='menu'&&!conflict&&<Modal title="牌桌選單" onClose={()=>setModal('')}><div className="table-menu">
      <button onClick={onHome}><Icon name="undo"/>{save.storage==='device'?'儲存並回主選單':'回主選單'}</button>
      <button onClick={onChoosePartner}><Icon name="cards"/>選擇隊友</button>
      <button onClick={()=>{setModal('');onSettings()}}><Icon name="tune"/>設定</button>
      <button onClick={()=>setModal('history')}><Icon name="history"/>本副牌譜</button>
      <button onClick={()=>setModal('cards')}><Icon name="cards"/>Q 版牌樣</button>
      <button onClick={()=>setModal('rules')}><Icon name="book"/>本桌規則</button>
      <button onClick={()=>setModal('restart')}><Icon name="shuffle"/>開新場</button>
    </div><p className="history">{save.storage==='device'?'本局已自動存到這台裝置，可關閉分頁後再繼續。':save.storage==='tab'?'目前進度只存在本分頁。':'目前進度只保留到頁面關閉或重新載入。'}</p></Modal>}
    {conflict&&<Modal title="其他分頁已更新存檔" onClose={onHome}><div className="history"><p>牌桌已暫停。你可以載入最新進度，或回主選單。</p></div><footer><button className="btn border" onClick={onHome}>回主選單</button><button className="btn gold" onClick={reloadSave}>載入最新進度</button></footer></Modal>}
    {modal==='cards'&&!arriving&&<Modal title="Q 版牌樣" wide onClose={()=>{setModal('');if(location.hash==='#cards')history.replaceState(null,'','#battle')}}><DeckProof/></Modal>}
    {modal==='rules'&&<Modal title="本桌摜蛋規則" onClose={()=>setModal('')}><div className="manual">{ruleBook.map(([k,v])=><section key={k}><h3>{k}</h3><p>{v}</p></section>)}<p className="rule-source"><a href="https://xgh.scau.edu.cn/_upload/article/files/cb/dc/a3903c0746239ff0ac31b8f5b343/e48c50d8-d766-45ee-9c9b-7605f74b71e8.pdf" target="_blank" rel="noreferrer">對照競賽規則（PDF）</a></p></div></Modal>}
    {modal==='history'&&<Modal title={'第 '+game.handNo+' 副牌譜'} onClose={()=>setModal('')}><div className="history battle-log">{[...game.events].reverse().map((e,i)=><div key={i}><small>第 {e.trick} 圈</small><b>{e.kind==='system'?'牌局':seatName[e.seat]}</b><span>{e.move?showMove(e.move)+'　'+describe(e.move.cards):e.text}</span></div>)}</div></Modal>}
    {modal==='restart'&&<Modal title="開新場" onClose={()=>setModal('')}><div className="history"><p>雙方將從 2 重新起級，四個座位重新發牌。</p></div><footer><button className="btn border" onClick={()=>setModal('')}>繼續這場</button><button className="btn gold" onClick={()=>newDeal(startMatch())}>重新開場</button></footer></Modal>}
  </div>
}
