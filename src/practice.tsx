import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { allMoves, beats, coach, deal, describe, face, initialHand, initialTarget, interpret, names, power, remaining, suits, uid, type Advice, type Card, type Move } from './rules'
import { Editor } from './editor'
import { levelSelectionHint } from './level-selection'
import { assetPath } from './assets'
import { partners } from './partner-roster'
import { Icon, Modal, PlayingCard } from './ui'
import type { mountCharacter } from './character'
import './style.css'

type Snapshot={hand:Card[],target:Move|null,played:Move|null,phase:'active'|'played'|'pass',round:number}
type Entry={before:Snapshot,move:Move|null,kind:string}
type Analysis={moves:Move[],advice:Advice[]}
const practiceGuide = partners[0]
function fresh(hand=initialHand(),target:Move|null=interpret(initialTarget(),'2',null)):Snapshot{return {hand,target,played:null,phase:'active',round:1}}
const manual=[['單張 / 對子 / 三張','打出一張牌，或兩張、三張同點數的牌。跟牌時比較點數。'],['三帶對','三張同點數的牌加一個對子，以三張的點數比較大小。'],['順子','五個連續點數。A 可以接在 2 前面，也可以接在 K 后面。'],['三連對 / 鋼板','三連對是三個連續對子，鋼板是兩組連續的三張。'],['炸彈 / 同花順 / 四王','四張以上同點數是炸彈。四王最大，其次是六張及以上炸彈、同花順、五張炸彈、四張炸彈。'],['級牌與逢人配','單張大小依次為大王、小王、級牌、A 至 2。紅心級牌可在組合里代替普通牌，不能代替大小王。']]
export function Practice({onMatch,onSceneReady,musicControl}:{onMatch:()=>void;onSceneReady:(mode:'practice')=>void;musicControl:React.ReactNode}){
  const [state,setState]=useState<Snapshot>(()=>fresh()),[level,setLevel]=useState('2')
  const [selected,setSelected]=useState<string[]>([]),[entries,setEntries]=useState<Entry[]>([])
  const [modal,setModal]=useState(''),[panel,setPanel]=useState<'coach'|'groups'>('coach'),[sort,setSort]=useState('rank')
  const [sounds,setSounds]=useState(false),[error,setError]=useState(''),[kindFilter,setKindFilter]=useState('')
  const [chosen,setChosen]=useState<Move|null>(null),[sceneError,setSceneError]=useState(false),[sceneReady,setSceneReady]=useState(false)
  const [analysis,setAnalysis]=useState<{key:string,value:Analysis}|null>(null)
  const canvas=useRef<HTMLCanvasElement>(null),actor=useRef<ReturnType<typeof mountCharacter>|null>(null), audio=useRef<AudioContext|null>(null)
  const {hand,target,played,phase,round}=state
  useEffect(()=>{
    if(sceneReady||sceneError)onSceneReady('practice')
  },[sceneReady,sceneError,onSceneReady])
  const positionKey=JSON.stringify([level,hand.map(uid),target?.kind,target?.value,target?.cards.map(uid)])
  const result=analysis?.key===positionKey?analysis.value:null
  useEffect(()=>{
    let worker:Worker|undefined, alive=true
    const fallback=()=>{const moves=allMoves(hand,level);if(alive)setAnalysis({key:positionKey,value:{moves,advice:coach(hand,level,target,moves)}})}
    if(location.protocol==='file:'){fallback();return}
    try{worker=new Worker(new URL('./coach-worker.ts',import.meta.url),{type:'module'})
      worker.onmessage=e=>{if(alive)setAnalysis({key:positionKey,value:e.data})}
      worker.onerror=fallback;worker.postMessage({hand,level,target})
    }catch{fallback()}
    return ()=>{alive=false;worker?.terminate()}
  },[positionKey])
  useEffect(()=>{let alive=true; import('./character').then(({mountCharacter})=>{if(alive&&canvas.current){actor.current=mountCharacter(canvas.current,()=>setSceneError(true),{model:'hanakomachi',onReady:()=>{if(alive)setSceneReady(true)}})}}).catch(()=>setSceneError(true));return()=>{alive=false;actor.current?.dispose()}},[])
  function clickSound(force=false){if(!(sounds||force))return
    try{const ac=audio.current??new AudioContext();audio.current=ac;void ac.resume()
      const osc=ac.createOscillator(),gain=ac.createGain();osc.type='sine';osc.frequency.setValueAtTime(465,ac.currentTime);osc.frequency.exponentialRampToValueAtTime(255,ac.currentTime+.075);gain.gain.setValueAtTime(.035,ac.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.09);osc.connect(gain);gain.connect(ac.destination);osc.start();osc.stop(ac.currentTime+.1)
    }catch{/* Sound is optional on browsers without Web Audio. */}}
  const sorted=useMemo(()=>[...hand].sort((a,b)=>sort==='suit'?suits.indexOf(a.suit)-suits.indexOf(b.suit)||power(a.rank,level)-power(b.rank,level):power(a.rank,level)-power(b.rank,level)||suits.indexOf(a.suit)-suits.indexOf(b.suit)),[hand,level,sort])
  const picked=useMemo(()=>hand.filter(c=>selected.includes(uid(c))),[hand,selected])
  const move=useMemo(()=>chosen&&picked.length===chosen.cards.length&&chosen.cards.every(c=>selected.includes(uid(c)))&&beats(chosen,target)?chosen:interpret(picked,level,target),[picked,chosen,selected,level,target])
  const valid=phase==='active'&&!!move
  function clearPick(){setSelected([]);setChosen(null);setError('')}
  function selectMove(m:Move){setSelected(m.cards.map(uid));setChosen(m);setError('');clickSound()}
  function toggle(c:Card){if(phase!=='active')return;const id=uid(c);setSelected(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);setChosen(null);setError('');clickSound()}
  function reset(cards:Card[],lvl:string,t:Move|null){setLevel(lvl);setState(fresh(cards,t));setEntries([]);clearPick();setKindFilter('');setModal('');actor.current?.reset();clickSound()}
  function commit(){if(!valid||!move)return
    setEntries([...entries,{before:state,move,kind:'出牌'}]);actor.current?.play(move.cards);clickSound()
    setState({...state,hand:remaining(hand,move),played:move,phase:'played'});clearPick()
  }
  function pass(){if(!target||phase!=='active')return;setEntries([...entries,{before:state,move:null,kind:'過牌'}]);setState({...state,played:null,phase:'pass'});clearPick();clickSound()}
  function advance(){if(!hand.length){reset(deal(),level,null);return}setState({...state,target:null,played:null,phase:'active',round:round+1});clearPick();actor.current?.reset()}
  function undo(){const last=entries.at(-1);if(!last)return;setState(last.before);setEntries(entries.slice(0,-1));clearPick();actor.current?.reset();setModal('')}
  function selectionMessage(){if(error)return error;if(phase!=='active')return hand.length?'本輪已結束，可繼續練習餘牌。':'本手練習完成。';if(!picked.length)return '點選手牌選中，再次點選取消。';if(!move)return levelSelectionHint(picked,level,target) ?? (interpret(picked,level,null)?'這組牌壓不過桌面牌。':'選中的牌還未組成有效牌型。')
    const mapping=Object.values(move.as);return '已選 '+picked.length+' 張 · '+names[move.kind]+(mapping.length?' · 逢人配作 '+mapping.join('、'):'')}
  useEffect(()=>{function key(e:KeyboardEvent){if(modal||e.ctrlKey||e.altKey||e.metaKey||e.repeat||['BUTTON','SELECT','INPUT'].includes((e.target as HTMLElement)?.tagName))return
    if(e.key==='Escape')clearPick();if(e.key==='Enter'){e.preventDefault();if(valid)commit();else if(phase!=='active')advance()}}
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[modal,valid,move,phase,state,entries])
  const close=useCallback(()=>setModal(''),[])
  const top=result?.advice[0], groups=result?.moves||[]
  const kinds=Array.from(new Set(groups.map(m=>m.kind)))
  const activeFilter=kinds.includes(kindFilter)?kindFilter:kinds.includes('pairs')?'pairs':kinds[0]
  const visibleGroups=groups.filter(m=>m.kind===activeFilter)
  const board=phase==='played'?played:target
  const completed=phase!=='active'
  const cardsOnTable=board?.cards||[]
  return <><header className="topbar"><div className="top-inner"><div className="brand"><div className="crest"><Icon name="cards" size={29}/></div><div><strong>水晶亭的休戰日</strong><small>二對二摜蛋</small></div></div><span className="nav-divider"/><nav aria-label="主菜單"><button onClick={onMatch}><Icon name="flag"/>二對二對戰</button><button className={!modal||modal==='editor'?'active':''} onClick={()=>setModal('')}><Icon name="layers"/>練習桌</button><button className={modal==='manual'?'active':''} onClick={()=>setModal('manual')}><Icon name="book"/>牌型手冊</button><button className={modal==='history'?'active':''} onClick={()=>setModal('history')}><Icon name="history"/>出牌記錄</button></nav><button className={'sound icon-btn '+(sounds?'enabled':'')} aria-label={sounds?'關閉音效':'開啟音效'} title={sounds?'關閉音效':'開啟音效'} aria-pressed={sounds} onClick={()=>{if(!sounds)clickSound(true);setSounds(!sounds)}}><Icon name={sounds?'sound':'mute'} size={19}/></button></div></header>
  <main><section className="page-heading"><div><div className="crumb"><i/>水晶亭<span> / </span>單人練習</div><h1>手牌練習桌</h1></div><div className="top-actions"><button className="btn border" onClick={()=>setModal('editor')}><Icon name="tune" size={16}/>自訂牌局</button><button className="btn gold" onClick={()=>reset(deal(),level,null)}><Icon name="shuffle" size={17}/>重新發牌</button></div></section>
  <div className="layout"><div className="left-col"><section className="stage" aria-label="旅人酒館三維牌桌"><div className="stage-border"/><div className="stage-spot"><Icon name="pin" size={14}/> 旅人酒館</div><span className="stage-round">練習輪次 <b>{String(round).padStart(2,'0')}</b></span><div className="actor-slot">{(!sceneReady||sceneError)&&<img className="static-actor" src={assetPath(practiceGuide.portrait)} alt={`持牌的${practiceGuide.name}`}/>}<canvas ref={canvas} aria-label={`${practiceGuide.name}的持牌與出牌動作`}/>{sceneError&&<span className="scene-error">靜態角色模式</span>}{!sceneReady&&!sceneError&&<span className="scene-loading">角色入座中…</span>}</div>
  <div className="board-info"><div className="board-label"><span/>{phase==='played'?'本輪出牌':phase==='pass'?'本輪已過牌':target?'上家出牌':'自由領出'}<span/></div>{cardsOnTable.length?<div className={'board-cards '+(cardsOnTable.length>5?'many':'')}>{cardsOnTable.map((c,i)=><span key={uid(c)} style={{zIndex:i,transform:'rotate('+((i-(cardsOnTable.length-1)/2)*Math.min(8,23/cardsOnTable.length))+'deg)'}}><PlayingCard card={c} level={level}/></span>)}</div>:<div className="open-symbol">♤</div>}<div className="board-type">{board?names[board.kind]+' · '+board.label:'選擇任意合法牌型'}</div></div>
  <div className="stage-level">級牌 <b>{level}</b></div><div className="actor-name"><i/> {practiceGuide.name} · 陪練</div></section>
  <section className="hand-panel"><header className="panel-heading"><div className="heading-pair"><Icon name="cards" size={22}/><h2>我的手牌</h2><span className="count">{hand.length} 張</span></div><label className="sort"><span>排序</span><select aria-label="手牌排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="rank">按點數</option><option value="suit">按花色</option></select></label></header>
  <div className={'hand-rack '+(hand.length>14?'dense':'')}>{sorted.map(c=><PlayingCard key={uid(c)} card={c} level={level} selected={selected.includes(uid(c))} onClick={()=>toggle(c)}/>)}{!hand.length&&<div className="hand-empty"><Icon name="check"/> 已打完全部手牌</div>}</div>
  <div className="hand-footer"><span aria-live="polite" className={'selection-note '+(picked.length&&!move?'invalid':'')}><i/>{selectionMessage()}</span><div>{entries.length>0&&<button onClick={undo} className="small-action" title="撤銷上一手" aria-label="撤銷上一手"><Icon name="undo" size={16}/></button>}{phase==='active'?<><button className="btn border" onClick={pass} disabled={!target}>過牌</button><button className="btn gold play" disabled={!valid} onClick={commit}>出牌 <Icon name="arrow" size={16}/></button></>:<button className="btn gold" onClick={advance}>{hand.length?'下一輪領出':'再練一手'}<Icon name="arrow" size={16}/></button>}</div></div></section>
  </div><aside className="advisor"><header className="advisor-head"><span className="adviser-mark"><Icon name="spark" size={24}/></span><div><h2>出牌教練</h2><small><i/> 本機推演</small></div></header><div className="switcher"><button className={panel==='coach'?'on':''} onClick={()=>setPanel('coach')}>出牌建議</button><button className={panel==='groups'?'on':''} onClick={()=>setPanel('groups')}>可組牌型</button></div>
  {completed?<div className="side-body"><span className="eyebrow"><Icon name="check" size={15}/> 本輪結果</span><h3>{phase==='pass'?'已過牌':!hand.length?'手牌已出完':'成功出牌'}</h3><p className="reason">{played?describe(played.cards)+'。':''}{hand.length?'余下 '+hand.length+' 張。進入下一練習輪即可嘗試自由領出。':'可以撤銷剛才的一手，或重新發牌開始新的練習。'}</p><button className="btn side-btn" onClick={advance}>{hand.length?'用餘牌繼續':'再練一手'}<Icon name="arrow" size={16}/></button></div>:panel==='coach'?<div className="side-body"><span className="eyebrow"><Icon name="feather" size={15}/> 推薦出法</span>{!result?<p className="reason">正在分析手牌…</p>:top?<><div className="move-title"><h3>{names[top.move.kind]}</h3><span>{top.move.cards.length} 張</span></div><div className="advice-cards">{top.move.cards.map(c=><span className={'card-chip '+(c.suit==='H'||c.suit==='D'||c.rank==='BJ'?'red':'')} key={uid(c)}>{({S:'♠',H:'♥',D:'♦',C:'♣',J:'★'} as Record<string,string>)[c.suit]} {face(c)}</span>)}</div><p className="reason">{top.reason}</p><button className="btn side-btn" onClick={()=>selectMove(top.move)}><Icon name="check" size={16}/>{chosen===top.move?'已選中推薦牌':'選用這組牌'}</button>
  {(result.advice.length>1)&&<div className="alternatives"><h4>其他出法</h4>{result.advice.slice(1).map((v,i)=><button key={i} onClick={()=>selectMove(v.move)} title={v.reason}><span>{names[v.move.kind]}</span><b>{v.move.label}</b><Icon name="next" size={13}/></button>)}</div>}</>:<><h3>建議過牌</h3><p className="reason">手中沒有可以壓過桌面牌的組合。</p><button className="btn side-btn" onClick={pass}>過牌 <Icon name="arrow" size={15}/></button></>}</div>:<div className="side-body groups"><span className="eyebrow"><Icon name="layers" size={15}/> 手牌中的組合</span><div className="group-tabs">{kinds.map(k=><button key={k} className={activeFilter===k?'active':''} onClick={()=>setKindFilter(k)}>{names[k]}</button>)}</div><div className="group-list">{visibleGroups.map((m,i)=><button key={i} onClick={()=>selectMove(m)}><b>{m.label}</b><small>{target&&!beats(m,target)?'僅查看':'可出牌'}</small></button>)}</div></div>}
  <div className="advisor-foot"><Icon name="layers" size={15}/><span>在「自訂牌局」擺好手牌和上家出牌，就能練拆牌與跟牌。</span></div></aside></div>
  <footer className="page-footer"><span><i/> 本地練習</span>{musicControl}<button onClick={()=>setModal('manual')}><Icon name="book" size={14}/> 查看摜蛋規則</button></footer></main>
  {modal==='editor'&&<Editor hand={hand} level={level} target={target} onSave={reset} onClose={close}/>}
  {modal==='manual'&&<Modal title="牌型手冊" onClose={close}><div className="manual">{manual.map(([name,desc])=><section key={name}><h3>{name}</h3><p>{desc}</p></section>)}</div></Modal>}
  {modal==='history'&&<Modal title="出牌記錄" onClose={close}><div className="history">{!entries.length?<p>這手牌還沒有出牌記錄。</p>:[...entries].reverse().map((e,i)=><div key={i}><small>第 {e.before.round} 輪</small><b>{e.move?names[e.move.kind]:'過牌'}</b><span>{e.move?describe(e.move.cards):'放棄跟牌'}</span></div>)}</div>{entries.length>0&&<footer><button className="btn border" onClick={undo}><Icon name="undo" size={15}/>撤銷上一手</button></footer>}</Modal>}
  </>
}

