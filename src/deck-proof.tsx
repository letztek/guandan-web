import { useState } from 'react'
import { face, suitNames, type Card } from './rules'
import { PlayingCard } from './ui'
import prints from '../artwork/chibi/ranks.json'

const subjects: Record<string,string> = Object.fromEntries(Object.entries(prints).map(([rank,print])=>[rank,print.name]))
subjects['王']='道化師'
const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A','王']
const colors: Record<string,string> = {S:'靛藍',H:'莓紅',C:'翠綠',D:'琥珀'}
const jokerNames: Record<string,string> = {BJ:'モリオーネ',SJ:'フナンボロ'}
const equipment: Record<string,string> = {
  '2':'彩窗心形杖','3':'龍紋大劍','4':'蝠翼短刃','5':'糖果魔導具',
  '6':'羊角花藤杖','7':'櫻花折扇','8':'白銀弓','9':'獅爪手甲','10':'圓盾'
}

function cardsForRank(rank:string):Card[] {
  const prints=rank==='王'?[['J','BJ'],['J','SJ']]:['S','H','C','D'].map(suit=>[suit,rank])
  return prints.map(([suit,rank])=>({id:suit+rank,suit,rank}))
}

export function DeckProof(){
  const [rank,setRank]=useState('6')
  const [focus,setFocus]=useState<number|null>(null)
  const cards=cardsForRank(rank)
  const label=(card:Card)=>suitNames[card.suit]+face(card)
  if(focus!==null){
    const card=cards[focus]
    const turn=(step:number)=>setFocus((focus+cards.length+step)%cards.length)
    return <div className="proof-detail">
      <PlayingCard card={card} mini/>
      <strong>{label(card)} · {jokerNames[card.rank]??subjects[rank]}</strong>
      <div className="proof-nav"><button onClick={()=>turn(-1)}>上一張</button>
        <button onClick={()=>setFocus(null)}>返回牌樣</button><button onClick={()=>turn(1)}>下一張</button></div>
    </div>
  }
  return <>
    <div className="proof-ranks" role="group" aria-label="依點數看牌樣">{ranks.map(value=>
      <button key={value} type="button" aria-pressed={rank===value} onClick={()=>setRank(value)}>{value}</button>
    )}</div>
    <h3 className="proof-title">{subjects[rank]}{equipment[rank]&&<small> · {equipment[rank]}</small>}</h3>
    <div className={'deck-proof '+(rank==='王'?'two-cards':'')}>{cards.map((card,i)=>
      <figure key={card.id}>
        <button className="proof-zoom" aria-label={'放大'+label(card)} onClick={()=>setFocus(i)}><PlayingCard card={card} mini/></button>
        <figcaption><strong>{label(card)}</strong><small>{jokerNames[card.rank]??colors[card.suit]}</small></figcaption>
      </figure>
    )}</div>
  </>
}
