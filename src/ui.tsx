import { useEffect, useId, useRef, type ReactNode } from 'react'
import { face, symbols, suitNames, wild, type Card } from './rules'
import { assetPath } from './assets'
import { cardFaceIndex } from './fez-deck'
import './fez-cards.css'

const strokes:Record<string,ReactNode>={
  cards:<><path d="m5 7-2 1 4 12 3-1M8 5l-2 .5 3 13 3-.6"/><rect x="10" y="3" width="11" height="15" rx="2"/><path d="m15.5 7 2.4 3.4-2.4 3.4-2.4-3.4z"/></>,
  book:<><path d="M3 4.5c3-1 6-.7 9 1.5 3-2.2 6-2.5 9-1.5V19c-3-1-6-.7-9 1.5C9 18.3 6 18 3 19zM12 6v14"/></>,
  history:<><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l4 2"/></>,
  sound:<><path d="M11 5 6 9H3v6h3l5 4zM15 8c2 2 2 6 0 8M18 5c4 4 4 10 0 14"/></>,
  mute:<><path d="M11 5 6 9H3v6h3l5 4zM16 9l5 6m0-6-5 6"/></>,
  shuffle:<><path d="M3 6h3c4 0 8 12 12 12h3m-4-4 4 4-4 4M3 18h3c1.5 0 3.4-2 4.5-3.6M14 9c1.5-2 3-3 4-3h3m-4-4 4 4-4 4"/></>,
  tune:<><path d="M3 7h5m4 0h9M3 17h10m4 0h4"/><circle cx="10" cy="7" r="2"/><circle cx="15" cy="17" r="2"/></>,
  spark:<><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM20 2v4m-2-2h4"/></>,
  eye:<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
  check:<path d="m5 12 4 4L19 6"/>, close:<path d="m6 6 12 12M18 6 6 18"/>, arrow:<path d="M4 12h15m-6-6 6 6-6 6"/>,
  chevron:<path d="m8 10 4 4 4-4"/>, next:<path d="m9 6 6 6-6 6"/>,
  flag:<><path d="M5 21V4c5-4 9 3 15-1v10c-5 4-10-3-15 1"/></>,
  feather:<><path d="M3 21 16 8M6 16C4 7 13 3 21 3c0 9-4 16-13 15M11 13h5"/></>,
  undo:<><path d="M3 10h10c5 0 8 3 8 8M8 4l-6 6 6 6"/></>,
  pin:<><path d="M18 9c0 5-6 11-6 11S6 14 6 9a6 6 0 0 1 12 0z"/><circle cx="12" cy="9" r="2"/></>,
  layers:<><path d="m12 3 10 5-10 5L2 8zM3 12l9 5 9-5M3 16l9 5 9-5"/></>,
  hand:<><path d="M5 12 3 9c-1-2 1-3 2-2l3 3V5c0-2 3-2 3 0v4-6c0-2 3-2 3 0v6-5c0-2 3-2 3 0v6-3c0-2 3-2 3 0v6c0 5-3 8-7 8-4 0-6-4-8-9z"/></>,
  clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  expand:<><path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5"/></>,
}
export function Icon({name,size=18}:{name:string,size?:number}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{strokes[name]}</svg>}
export function PlayingCard({card,selected=false,onClick,level='2',mini=false}:{
  card:Card, selected?:boolean, onClick?:()=>void, level?:string, mini?:boolean
}) {
  const { rank, suit } = card
  const index = cardFaceIndex(card)
  const joker = suit === 'J'
  const red = suit === 'H' || suit === 'D' || rank === 'BJ'
  const label = suitNames[suit] + face(card)
  const className = ['playing-card','fez-card',/^\d+$/.test(rank) && 'numeric',red && 'red',selected && 'selected',
    mini && 'mini',onClick && 'interactive'].filter(Boolean).join(' ')
  const surface = <>
    <span aria-hidden="true" className="fez-card-print" style={{
      backgroundImage: 'url("' + assetPath('fez-cards/deck.webp') + '")',
      backgroundPosition: ((index % 9) / 8 * 100) + '% ' + (Math.floor(index / 9) / 5 * 100) + '%'
    }}/>
    <span aria-hidden="true" className="fez-index">
      <b>{joker ? (rank === 'SJ' ? '小' : '大') : rank}</b>
      <i>{symbols[suit]}</i>
    </span>
    {wild(card,level) && !mini && <small className="wildmark">配</small>}
    {selected && <span className="tick"><Icon name="check" size={11}/></span>}
  </>
  return onClick
    ? <button type="button" className={className} data-suit={suit} data-rank={rank} aria-label={label} title={label}
        aria-pressed={selected} onClick={onClick}>{surface}</button>
    : <span role="img" aria-label={label} title={label} className={className} data-suit={suit} data-rank={rank}>{surface}</span>
}
export function Modal({title,onClose,children,wide=false,className=''}:{title:string,onClose:()=>void,children:ReactNode,wide?:boolean,className?:string}){
  const ref=useRef<HTMLDialogElement>(null)
  const heading=useId()
  useEffect(()=>{const el=ref.current;el?.showModal();return ()=>el?.close()},[])
  return <dialog className={['modal',wide&&'wide',className].filter(Boolean).join(' ')} ref={ref} aria-labelledby={heading} onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===ref.current){const b=ref.current.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)onClose()}}}><header><h2 id={heading}>{title}</h2><button aria-label="關閉" onClick={onClose} className="icon-btn"><Icon name="close"/></button></header>{children}</dialog>
}

