import { useState } from 'react'
import { deck, face, ranks, suits, symbols, uid, interpret, type Card, type Move } from './rules'
import { Modal, Icon } from './ui'
const catalogue=deck()
export function Editor({hand,target,level,onSave,onClose}:{hand:Card[],target:Move|null,level:string,onSave:(cards:Card[],lvl:string,t:Move|null)=>void,onClose:()=>void}){
  const [mine,setMine]=useState(hand),[table,setTable]=useState(target?.cards||[])
  const [lvl,setLvl]=useState(level),[tab,setTab]=useState<'hand'|'table'>('hand'),[error,setError]=useState('')
  const list=tab==='hand'?mine:table,other=tab==='hand'?table:mine,setList=tab==='hand'?setMine:setTable
  function cycle(suit:string,rank:string){
    setError('')
    const matches=(c:Card)=>c.suit===suit&&c.rank===rank
    const current=list.filter(matches)
    const taken=new Set([...list,...other].map(uid))
    const available=catalogue.find(c=>matches(c)&&!taken.has(uid(c)))
    if(available && list.length>=(tab==='hand'?27:10)&&current.length===0){setError('手牌最多 27 張，桌面牌最多 10 張。');return}
    if(available&&list.length<(tab==='hand'?27:10))setList([...list,available])
    else if(current.length)setList(list.filter(c=>!matches(c)))
    else setError('這兩張牌已在另一側使用。')
  }
  function save(){if(!mine.length){setError('請至少選一張手牌。');return}
    const t=table.length?interpret(table,lvl,null):null
    if(table.length&&!t){setError('桌面牌需要組成一種有效牌型。清空桌面即為自由領出。');return}
    onSave(mine,lvl,t)
  }
  function option(s:string,r:string){const n=list.filter(c=>c.suit===s&&c.rank===r).length;return <button key={r+s} className={'picker-card '+(n?'on ':'')+(s==='H'||s==='D'||r==='BJ'?'red':'')} aria-label={(symbols[s]||'')+r+'，已選 '+n+' 張'} onClick={()=>cycle(s,r)}>{r==='BJ'||r==='SJ'?face({rank:r,suit:s,id:''}):r}{n>0&&<small>{n}</small>}</button>}
  return <Modal title="自訂牌局" onClose={onClose} wide><div className="editor-top"><label>本局級牌 <select value={lvl} onChange={e=>setLvl(e.target.value)}>{ranks.map(r=><option key={r}>{r}</option>)}</select></label><button className="plain-link" onClick={()=>{setList([]);setError('')}}>清空當前選牌</button></div><div className="switcher"><button className={tab==='hand'?'on':''} onClick={()=>setTab('hand')}>我的手牌 · {mine.length}</button><button className={tab==='table'?'on':''} onClick={()=>setTab('table')}>桌面上手 · {table.length}</button></div><p className="form-note">點一次加一張，再點可加第二張。點滿后再點清空該牌。桌面留空即可自由領出。</p><div className="picker">{suits.map(s=><div key={s}><b className={s==='H'||s==='D'?'red':''}>{symbols[s]}</b>{ranks.map(r=>option(s,r))}</div>)}<div className="joker-row"><b>★</b>{option('J','SJ')}{option('J','BJ')}</div></div>{error&&<p className="form-error" role="alert">{error}</p>}<footer><button className="btn border" onClick={onClose}>取消</button><button className="btn gold" onClick={save}>開始練習 <Icon name="arrow" size={16}/></button></footer></Modal>
}
