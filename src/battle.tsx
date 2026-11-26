import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SharedTable } from './shared-table'
import { characterName, playStyleForSeat } from './table-seats'
import type { PartnerId } from './partner-roster'
import type { MusicScene } from './room-music'
import { DeckProof } from './deck-proof'
import { MatchFinale } from './match-finale'
import { adviceInput, botStep, exchangeOptions, giveCard, nextHand, openingTributeNotice, seatName, startMatch, takeTurn, teamOf, type Match } from './match'
import { levelSelectionHint } from './level-selection'
import { useTeamAdvice } from './use-team-advice'
import { difficultyForSeat, type BotStrengths } from './difficulty'
import { autoPass, automaticPassText, canAutoPass } from './auto-pass'
import { allMoves, beats, power, uid, type Card, type Move } from './rules'
import { GameVersion, Icon, Modal, PlayingCard } from './ui'
import { localGameKey, readLocalGame, updateLocalGame, type LocalGame } from './local-game'
import { translate as t, useLanguage } from './i18n'
import { actionName, adviceReason, cardCount, describeCards, displayName, handNumber, localizeGameEvent, localizeSelectionHint, moveLabel, moveName, placeName, rankName, trickNumber } from './match-l10n'

function playerName(seat: number, partnerId: PartnerId) {
  return displayName(characterName(seat,partnerId))
}
function castText(move: Move) {
  const as=Object.values(move.as).join(t('、',', ','、'))
  return as?t('紅心級牌代 '+as,'Wild level cards count as '+as,'ハートのレベル札は'+as+'として使用'):''
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
const rulesEnglish = [
  ['Winning the match','Both teams start at level 2. On a deal where your team sets the level to A, finish first and either second or third to clear A and win the match.'],
  ['Seats and the lead','Your partner sits opposite you, with an opponent on each side. The two decks have 108 cards, 27 per player. The player who draws the cut card leads the first deal. Play proceeds counterclockwise from you to the right-hand opponent, your partner, then the left-hand opponent.'],
  ['Responding and passing','Lead any legal combination. To respond, play a larger combination of the same type, or a bomb, straight flush, or four jokers that can beat it. The leader cannot pass. A player who passed may respond again after someone raises the play.'],
  ['Triples','Three cards of the same rank can lead or beat a lower triple. At level 5, two aces and the ♥5 make a triple of aces. To beat a pair, use a higher pair or an eligible bomb.'],
  ['Sequences and wild cards','Straights use five cards. Three consecutive pairs use six cards, as do two consecutive triples. An ace can be low or high, but K–A–2 cannot be consecutive. A heart of the active level can substitute for any non-joker. If the selection has several meanings, choose the intended combination.'],
  ['Ranking bombs','Four jokers are strongest. A bomb of six cards or more beats a straight flush, which beats five- and four-card bombs. Compare bombs by card count, then by rank. Compare full houses by the triple’s rank.'],
  ['Taking over the lead and leveling','When everyone else with cards passes, the last player to play leads. If that player has finished, their partner leads. The first finisher’s team advances 3, 2, or 1 levels if the partner finishes second, third, or fourth. The deal ends as soon as one team takes the first two places.'],
  ['Tribute and return','From the second deal, the last-place player gives a card to the previous winner. If both teammates finished last, both give tribute. Give the highest card other than a heart of the active level. Return a card with strength 10 or below, or your weakest card if all are above 10. In double tribute, the highest tribute goes to the previous winner. Ties go to that winner from their right-hand opponent. Tribute is waived if the single giver holds both big jokers, or if the two givers hold them between them. The previous winner then leads.'],
]
const rulesJapanese = [
  ['マッチの勝利条件','両チームともレベル2から始めます。自チームがAを主レベルとする局で、片方が1位、もう片方が2位か3位になればAを突破し、マッチに勝利します。'],
  ['座席と先出し','向かいがパートナー、左右が対戦相手です。トランプ2組、計108枚を27枚ずつ配ります。初局はめくり札を引いた人が先出しします。手番は自分、右の対戦相手、パートナー、左の対戦相手の反時計回りです。'],
  ['フォローとパス','先出しでは有効な組み合わせを自由に出せます。場に返すには、同じ種類のより強い組み合わせか、場に勝てるボム、ストレートフラッシュ、ジョーカー4枚を出します。先出しはパスできません。別のプレイヤーが場を更新すると、先にパスした人にも再び手番が回ります。'],
  ['スリーカード','同じランクの3枚は先出しにも、より弱いスリーカードへのフォローにも使えます。レベル5ではA2枚と♥5でAのスリーカードを作れます。ペアに返すときは、より強いペアか条件を満たすボムを出します。'],
  ['連続する組み合わせとワイルド','ストレートは5枚、連続3ペアと連続スリーカードは6枚です。Aは最低にも最高にもなりますが、K・A・2はつながりません。ハートのレベル札はジョーカー以外の札の代わりに使えます。選んだカードに複数の有効な組み合わせがある場合は、出し方を指定できます。'],
  ['ボムの強さ','ジョーカー4枚が最強です。6枚以上のボムはストレートフラッシュより強く、ストレートフラッシュは5枚以下のボムより強いです。ボム同士は枚数、次にランクを比べます。フルハウスは3枚組のランクを比べます。'],
  ['先出しの引き継ぎと昇級','手札のある他の全員がパスすると、最後に出した人が次の先出しをします。その人が上がっていれば、パートナーが引き継ぎます。1位のパートナーが2位・3位・4位なら、そのチームは順に3・2・1レベル上がります。同じチームが1位と2位になった時点で局は終了します。'],
  ['貢ぎ札、返礼札、免除','第2局以降は前局の4位が1位に貢ぎます。負けたチームが3位と4位なら、2人とも貢ぎます。ハートのレベル札を除く最強の札を渡します。返礼札は強さ10以下から選び、なければ最も弱い札を返します。両者が貢ぐとき、前局1位にはより強い札が渡り、同じ強さなら右隣から受け取ります。4位が大ジョーカーを2枚持つ場合、または貢ぎ手2人が合わせて2枚持つ場合は免除され、前局1位が先出しします。'],
]
type TableDialog = 'menu' | 'rules' | 'history' | 'restart' | 'cards' | ''
const declarationKey = (move: Move) => [move.kind, move.value, move.label].join('/')

function TurnContext({ game, partnerId }: { game: Match; partnerId: PartnerId }) {
  const { target, phase, turn } = game
  const exchanging = phase === 'donate' || phase === 'return'
  const action = actionName(phase==='donate'||phase==='return' ? phase : target?'follow':'lead')
  const holder=playerName(game.holder,partnerId)
  const cue = target ? t((game.holder===2?'隊友':'')+holder+'目前最大',game.holder===0?'You currently lead':holder+' currently leads',holder+'が現在トップ') : handNumber(game.handNo)+' · '+trickNumber(game.trick)
  const title = exchanging ? action : target ? (target.kind==='single'?t('單張 '+target.label,'Single '+moveLabel(target.label),'シングル '+moveLabel(target.label)):moveName(target)) : t('自由領出','Free lead','自由に先出し')
  const tributeNotice = openingTributeNotice(game)
  const name=playerName(turn,partnerId)
  let instruction = t('輪到'+name+action+'。', 'It’s '+(turn===0?'your':name+'’s')+' turn to '+action+'.', name+'が'+action+'番です。')
  if (turn===0 && exchanging) instruction += t('請從亮起的牌中選一張，再按確認。',' Choose a highlighted card and confirm.',' 強調表示されたカードを1枚選んで確定してください。')
  if (turn===0 && !exchanging) instruction += target ? t('可以壓過桌面，或過牌。',' Beat the current play or pass.',' 場に勝てる組み合わせを出すか、パスしてください。') : t('選一組手牌開始這圈。',' Select cards to start the trick.',' カードを選んで先出ししてください。')
  if (turn!==0 && !exchanging && game.hands[0].length) instruction += t('你可以先選牌。',' You can select cards now.',' カードは先に選べます。')
  return <div className="turn-context">
    {target && <div className="turn-context-print" aria-label={t('桌面牌','Cards on the table','場のカード')+' '+describeCards(target.cards)}
      style={{'--card-total':target.cards.length} as React.CSSProperties}>
      {target.cards.map(c=><PlayingCard key={uid(c)} card={c} level={game.level} mini/>)}
    </div>}
    <div className="turn-context-text" aria-live="polite" aria-atomic="true">
      <small>{cue}</small><h2>{title}</h2><p>{instruction}{target&&castText(target) ? ' '+castText(target):''}</p>
      {tributeNotice && <p className="tribute-notice">{localizeGameEvent(tributeNotice)}</p>}
    </div>
  </div>
}

function HandResult({ game, partnerId }: { game: Match; partnerId: PartnerId }) {
  const winner=teamOf(game.finish[0])
  const team=winner===0?t('我方','Your team','自チーム'):t('對方','Opponents','相手チーム')
  const nextLevel=game.scores[winner]
  return <section className="result-panel" aria-label={t('本副結算','Deal results','この局の結果')}>
    <small>{t(handNumber(game.handNo)+'結算',handNumber(game.handNo)+' results',handNumber(game.handNo)+'の結果')}</small>
    <h2>{team}{game.won?t('過 A 獲勝',' cleared A and won','がAを突破し勝利'):t('取得頭游',' took first place','が1位を獲得')}</h2>
    <p>{game.finish.length===2?t('頭游、二游同隊。','The first two finishers are partners. ','同じチームが1位と2位になりました。'):''}{game.won?t('本場結束。','The match is over.','マッチ終了。'):game.owner===winner&&game.level==='A'?t('頭游的隊友為末游，下一副繼續主打 A。','The first finisher’s partner came last. Their team plays at level A again.','1位のパートナーが4位のため、次の局もレベルAです。'):t('本副升 '+game.gain+' 級，下副主打 '+nextLevel+'。','Advanced '+game.gain+(game.gain===1?' level.':' levels.')+' The next deal is at '+nextLevel+'.',game.gain+'レベル上がり、次は'+nextLevel+'です。')}</p>
    <ol className="finish-list">{game.finish.map((seat,i)=><li key={seat}>{placeName(i)} <b>{playerName(seat,partnerId)}</b></li>)}</ol>
  </section>
}

function PublicJokers({events}: {events: Match['events']}) {
  const jokers = events.flatMap(event => event.kind==='play' ? event.move?.cards.filter(card => card.suit==='J') ?? [] : [])
  return <p className="public-jokers">
    <strong>{t('本副已出','Played this deal','この局で出たカード')}</strong>
    {['SJ', 'BJ'].map(rank => {
      const count = jokers.filter(card => card.rank===rank).length
      return <span key={rank}>{rankName(rank)} {count}/2</span>
    })}
  </p>
}

export function Battle({initialSave,autoPassEnabled,strengths,onMusicScene,onChoosePartner,onTutorial,onHome,onSettings,onSceneReady,arriving,paused}:{
  initialSave:LocalGame; autoPassEnabled:boolean; strengths:BotStrengths; onChoosePartner:()=>void
  onMusicScene:(scene:MusicScene)=>void
  onHome:()=>void; onSettings:()=>void; onTutorial:()=>void; onSceneReady:(mode:'battle')=>void; arriving:boolean; paused:boolean
}) {
  useLanguage()
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
  const exchangeLabel=game.phase==='donate'?t('進貢','Tribute','貢ぎ札'):t('還貢','Return tribute','返礼札')
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
  const phaseText=actionName(game.phase==='donate'||game.phase==='return'?game.phase:target?'follow':'lead')

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

  let status=t('尚未選牌','No cards selected','カード未選択')
  if (done) status=game.won?t('本場已結束','Match finished','マッチ終了'):t('本副已結算','Deal complete','この局は終了しました')
  else if (!mine.length) status=t('你已出完手牌','You have played all your cards','手札を出し切りました')
  else if (giftPick) status=t('已選','Selected','選択済み')+' '+describeCards([giftPick])
  else if (exchanging) status=myTurn?t('請選一張'+exchangeLabel+'的牌','Select one card to '+phaseText+'.',exchangeLabel+'を1枚選んでください。'):
    t('等待'+playerName(game.turn,partnerId)+exchangeLabel,'Waiting for '+playerName(game.turn,partnerId)+' to '+phaseText+'.',playerName(game.turn,partnerId)+'の'+exchangeLabel+'を待っています。')
  else if (selected.length) {
    const selection=myTurn?t('已選','Selected','選択済み'):t('預選','Preselected','仮選択')
    if (move) status=selection+' '+moveName(move)+(castText(move)?' · '+castText(move):'')
    else {
      const guidance = levelSelectionHint(mine.filter(c=>selected.includes(uid(c))),game.level,target)
      status=guidance?localizeSelectionHint(guidance):
        selection+' '+cardCount(selected.length)+' · '+(selectedMoves.length?t('壓不過目前桌面','Cannot beat the current play','場の組み合わせに勝てません'):t('尚未組成牌型','No valid combination','有効な組み合わせになっていません'))
    }
  }
  const invalid=Boolean(selected.length && !exchanging && !move && !done)
  const activePlayer=playerName(game.turn,partnerId)
  const passedPlayer=lastEvent?.kind==='pass'?playerName(lastEvent.seat,partnerId):''
  const turnStatus=done?t('本副結算','Deal results','この局の結果'):
    justAutoPassed&&!myTurn?t('你已自動過牌','You auto-passed','自動でパスしました'):
    passedPlayer?t(passedPlayer+' 已過牌',passedPlayer+' passed',passedPlayer+'がパス'):
    myTurn?t('輪到你'+phaseText,'Your turn to '+phaseText,'あなたが'+phaseText+'番'):
    t(activePlayer+' '+phaseText,activePlayer+'’s turn to '+phaseText,activePlayer+'が'+phaseText+'番')
  const partnerLabel=playerName(2,partnerId)
  const adviceLabel=t('你的提示（'+partnerLabel+'牌風）','Hint · '+partnerLabel+'’s style','ヒント（'+partnerLabel+'のプレイスタイル）')
  return <div className="battle play-table"><main>
    <header className="match-bar">
      <div className="match-title"><span className="crest" aria-hidden="true"><Icon name="cards" size={26}/></span><h1>{t('二對二對戰','2v2 Match','2対2対戦')}</h1></div>
      <div className="match-score" aria-label={t('雙方級數','Team levels','両チームのレベル')}><span>{t('我方','Your team','自チーム')} <b>{game.scores[0]}</b></span><span>{t('對方','Opponents','相手チーム')} <b>{game.scores[1]}</b></span></div>
      <div className="match-tools"><button className="btn border" onClick={onTutorial}><Icon name="book" size={15}/>{t('規則教學','Tutorial','チュートリアル')}</button>
        <button className="btn border" onClick={()=>setModal('menu')} aria-haspopup="dialog"><Icon name="tune" size={15}/>{t('牌桌選單','Table menu','卓メニュー')}</button></div>
    </header>
    {save.storage!=='device'&&<p className="inline-hint" role="status">{save.storage==='tab'?t('進度僅存於本分頁，關閉分頁後可能遺失。','Progress is stored in this tab and may be lost when you close it.','進行状況はこのタブにのみ保存されます。タブを閉じると失われる場合があります。'):t('瀏覽器目前無法儲存，重新載入或關閉分頁後會失去目前進度。','The browser cannot save progress. Reloading or closing this tab will lose it.','ブラウザーに保存できません。再読み込みやタブを閉じると進行状況が失われます。')}</p>}
    <div className="match-layout">
      <div className="battle-overview">
      <section className="stage battle-stage" aria-label={t('四人對戰牌桌','Four-player table','4人対戦の卓')}>
        <div className="stage-border"/><div className="table-caption">{handNumber(game.handNo)} · {trickNumber(game.trick)}</div>
        <div className="table-grade">{t('級牌','Level','レベル')} <b>{game.level}</b></div>
        <SharedTable partnerId={partnerId} onSceneReady={onSceneReady} game={game} hand={hand} selected={selected} cards={displayed?.cards??[]} player={lastPlay?.seat??0}
          playKey={game.handNo+'-'+game.trick+'-'+(displayed&&lastPlay?game.events.indexOf(lastPlay):'clear')}/>
        <div className={'turn-strip'+(myTurn?' your-turn':'')}><i/>{turnStatus}</div>
      </section>
      <div id="seat-closeup-slot"/>
      {!done&&<TurnContext game={game} partnerId={partnerId}/>}
      </div>
      <section className="hand-panel battle-hand" aria-label={t('玩家操作區','Player controls','プレイヤー操作')}>
        {done&&<HandResult game={game} partnerId={partnerId}/>}
        {done&&game.won&&<MatchFinale key={save.id+'-'+game.handNo} game={game} partnerId={partnerId} available={!blocked}
          onReview={()=>setModal('history')} onRematch={()=>setModal('restart')}/>}
        <header className="panel-heading"><div className="heading-pair"><Icon name="cards" size={19}/><h2>{t('我的手牌','Your hand','手札')}</h2><span className="count">{cardCount(mine.length)}</span></div>
          <div className="hand-tools"><button className="size-btn" onClick={()=>setLarge(!large)} aria-pressed={large}><Icon name="expand" size={15}/>{large?t('縮小','Zoom out','縮小'):t('放大','Zoom in','拡大')}</button>
            {!done&&<button className="size-btn hint-toggle" disabled={!myTurn} aria-expanded={hintOpen} aria-controls="turn-hint" onClick={toggleHint}>
              <Icon name="spark" size={15}/>{hintOpen?t('收起提示','Hide hint','ヒントを閉じる'):t('看提示','Show hint','ヒントを見る')}</button>}</div>
        </header>
        {game.phase==='play'&&(autoPassPending||justAutoPassed)&&<p className="inline-hint auto-pass-option" role="status">
          {autoPassPending?t('手上沒有能壓過桌面的牌，稍後自動過牌。','No legal response. Passing automatically…','出せる組み合わせがないため、自動でパスします。'):t('手上沒有能壓過桌面的牌，已自動過牌。','No legal response. Passed automatically.','出せる組み合わせがないため、自動でパスしました。')}
        </p>}
        {hintOpen&&myTurn&&<div className="inline-hint" id="turn-hint" role="region" aria-label={t('本手提示','Turn hint','この手のヒント')} aria-live="polite" aria-busy={!exchanging&&!advice}>
          {exchanging?<><strong>{t(exchangeLabel+'提示',exchangeLabel+' hint',exchangeLabel+'のヒント')}</strong><p>{game.phase==='donate'?t('可從亮起的牌選一張進貢。逢人配留在手上，其他牌取牌力最高者。','Choose a highlighted card. Keep wild level cards and give the strongest remaining card.','強調表示されたカードから1枚を選びます。ハートのレベル札を除く最も強い札を渡します。'):t('可還牌力不高於 10 的牌。若全都超過 10，還牌力最低的一張。','Return a card with strength at most 10, or your weakest card if all are above 10.','強さ10以下のカードを返します。なければ最も弱いカードを返します。')}</p></>:
            advice?<><strong>{adviceLabel} · {advice.move?t('建議出','Play','おすすめ')+' '+describeCards(advice.move.cards):t('建議過牌','Pass','パスがおすすめ')}</strong><p>{adviceReason(advice.reason)}</p>{fallback&&<p>{t('多輪推演暫時無法使用，這次採用本機快速判斷。','Multi-trick analysis is unavailable. This hint uses the quick local assessment.','複数トリックの分析が利用できないため、簡易判定を使いました。')}</p>}</>:
              <p>{t('正在本機推演後續出牌與隊友配合…','Considering later tricks and plays with your partner…','この先のトリックとパートナーとの連携を考えています…')}</p>}
        </div>}
        <div className={'battle-rack '+(large?'large':'')}>{hand.map((card,i)=>{
          const allowed=!exchanging||gifts.some(g=>uid(g)===uid(card))
          return <div key={uid(card)} style={{'--card-i':i} as React.CSSProperties} className={exchanging&&myTurn?(allowed?'exchange-ok':'ineligible'):''}>
            <PlayingCard card={card} selected={selected.includes(uid(card))} level={game.level} onClick={!done&&allowed?()=>pick(card):undefined}/>
          </div>
        })}</div>
        {choices.length>1&&myTurn&&<label className="declare">{t('這手牌的打法','How to play these cards','この手札の出し方')} <select aria-label={t('指定牌型','Choose combination','組み合わせを選ぶ')} value={declarationKey(move)} onChange={e=>editDeclaration(e.target.value)}>
          {choices.map(option=><option key={declarationKey(option)} value={declarationKey(option)}>{moveName(option)} {castText(option)}</option>)}
        </select></label>}
        <div className="hand-footer"><span className={'selection-note'+(invalid||error?' invalid':'')} aria-live="polite">{error?localizeGameEvent(error):status}</span>
          <div className="hand-actions">{done?<button className="btn gold" onClick={()=>newDeal(game.won?startMatch():nextHand(game))}>{game.won?t('再開一場','Play again','もう一戦'):t('開始下一副','Next deal','次の局へ')}<Icon name="arrow" size={15}/></button>:<>
            {!exchanging&&<button className="btn border" disabled={!myTurn||!target} onClick={()=>submit(null)}>{t('過牌','Pass','パス')}</button>}
            <button className="btn gold" disabled={!myTurn||hintState==='selecting'||!(exchanging?giftPick:move)} onClick={confirmSelection}>{exchanging?t('確認'+exchangeLabel,'Confirm','確定'):t('出牌','Play','出す')}<Icon name="arrow" size={15}/></button>
          </>}</div>
        </div>
      </section>
    </div></main>
    {modal==='menu'&&!conflict&&<Modal title={t('牌桌選單','Table menu','卓メニュー')} onClose={()=>setModal('')}><div className="table-menu">
      <button onClick={onHome}><Icon name="undo"/>{save.storage==='device'?t('儲存並回主選單','Save and return to menu','保存してメニューへ'):t('回主選單','Return to menu','メニューへ戻る')}</button>
      <button onClick={onChoosePartner}><Icon name="cards"/>{t('選擇隊友','Choose partner','パートナーを選ぶ')}</button>
      <button onClick={()=>{setModal('');onSettings()}}><Icon name="tune"/>{t('設定','Settings','設定')}</button>
      <button onClick={()=>setModal('history')}><Icon name="history"/>{t('本副牌譜','Deal history','この局の履歴')}</button>
      <button onClick={()=>setModal('cards')}><Icon name="cards"/>{t('Q 版牌樣','Card gallery','カード一覧')}</button>
      <button onClick={()=>setModal('rules')}><Icon name="book"/>{t('本桌規則','Table rules','この卓のルール')}</button>
      <button onClick={()=>setModal('restart')}><Icon name="shuffle"/>{t('開新場','New match','新しいマッチ')}</button>
    </div><p className="history">
      {save.storage==='device'?t('本局已自動存到這台裝置，可關閉分頁後再繼續。','This match is saved on this device and can be resumed after closing the tab.','このマッチは端末に自動保存され、タブを閉じても再開できます。'):save.storage==='tab'?t('目前進度只存在本分頁。','Progress is saved only in this tab.','進行状況はこのタブにのみ保存されます。'):t('目前進度只保留到頁面關閉或重新載入。','Progress will be lost if you close or reload the page.','ページを閉じるか再読み込みすると進行状況が失われます。')}
      <GameVersion/>
    </p></Modal>}
    {conflict&&<Modal title={t('其他分頁已更新存檔','Another tab updated the save','別のタブでセーブが更新されました')} onClose={onHome}><div className="history"><p>{t('牌桌已暫停。你可以載入最新進度，或回主選單。','The match is paused. Load the latest progress or return to the menu.','マッチを一時停止しました。最新の進行状況を読み込むか、メニューへ戻ってください。')}</p></div><footer><button className="btn border" onClick={onHome}>{t('回主選單','Return to menu','メニューへ戻る')}</button><button className="btn gold" onClick={reloadSave}>{t('載入最新進度','Load latest progress','最新の進行状況を読み込む')}</button></footer></Modal>}
    {modal==='cards'&&!arriving&&<Modal title={t('Q 版牌樣','Card gallery','カード一覧')} wide onClose={()=>{setModal('');if(location.hash==='#cards')history.replaceState(null,'','#battle')}}><DeckProof/></Modal>}
    {modal==='rules'&&<Modal title={t('本桌摜蛋規則','Guandan table rules','この卓の摜蛋ルール')} onClose={()=>setModal('')}><div className="manual">
      {ruleBook.map(([heading,body],i)=><section key={heading}><h3>{t(heading,rulesEnglish[i][0],rulesJapanese[i][0])}</h3><p>{t(body,rulesEnglish[i][1],rulesJapanese[i][1])}</p></section>)}
      <p className="rule-source"><a href="https://xgh.scau.edu.cn/_upload/article/files/cb/dc/a3903c0746239ff0ac31b8f5b343/e48c50d8-d766-45ee-9c9b-7605f74b71e8.pdf" target="_blank" rel="noreferrer">{t('對照競賽規則（PDF）','Reference competition rules (PDF, Chinese)','大会ルールを参照（PDF・中国語）')}</a></p>
    </div></Modal>}
    {modal==='history'&&<Modal title={t(handNumber(game.handNo)+'牌譜',handNumber(game.handNo)+' history',handNumber(game.handNo)+'の履歴')} onClose={()=>setModal('')}><div className="history battle-log">
      <PublicJokers events={game.events}/>
      {[...game.events].reverse().map((e,i)=><div key={i}><small>{trickNumber(e.trick)}</small><b>{e.kind==='system'?t('牌局','Table','卓'):displayName(seatName[e.seat])}</b><span>{e.move?moveName(e.move)+'　'+describeCards(e.move.cards):localizeGameEvent(e.text)}</span></div>)}
    </div></Modal>}
    {modal==='restart'&&<Modal title={t('開新場','New match','新しいマッチ')} onClose={()=>setModal('')}><div className="history"><p>{t('雙方將從 2 重新起級，四個座位重新發牌。','Both teams restart at level 2 and all four players receive new cards.','両チームがレベル2に戻り、4人にカードを配り直します。')}</p></div><footer><button className="btn border" onClick={()=>setModal('')}>{t('繼續這場','Keep playing','このマッチに戻る')}</button><button className="btn gold" onClick={()=>newDeal(startMatch())}>{t('重新開場','Start over','最初から始める')}</button></footer></Modal>}
  </div>
}
