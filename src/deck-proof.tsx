import { useState } from 'react'
import type { Card } from './rules'
import { PlayingCard } from './ui'
import { translate as t } from './i18n'
import { cardName, displayName } from './match-l10n'
import prints from '../artwork/chibi/ranks.json'

const subjects: Record<string,string> = Object.fromEntries(Object.entries(prints).map(([rank,print])=>[rank,print.name]))
subjects['王']='道化師'
const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A','王']
const colors: Record<string,[string,string,string]> = {S:['靛藍','Indigo','藍色'],H:['莓紅','Berry red','赤紅色'],C:['翠綠','Emerald green','翠色'],D:['琥珀','Amber','琥珀色']}
const jokerNames: Record<string,string> = {BJ:'モリオーネ',SJ:'フナンボロ'}
const equipment: Record<string,[string,string,string]> = {
  '2':['彩窗心形杖','Stained-glass heart staff','ステンドハート'],
  '3':['龍紋大劍','Dragon greatsword','天つらぬく竜ノ大剣'],
  '4':['蝠翼短刃','Batwing dagger','ヴァンパイア・バット'],
  '5':['糖果魔導具','Candy wand','キャンディーベイビー'],
  '6':['羊角花藤杖','Ram-horn vine staff','羊角と花の杖'],
  '7':['櫻花折扇','Cherry blossom fan','桜の扇'],
  '8':['白銀弓','Silver bow','白銀の弓'],
  '9':['獅爪手甲','Lion-claw gauntlet','獅子の手甲'],
  '10':['圓盾','Round shield','丸盾'],
}
const subjectNames: Record<string,[string,string]> = {
  'A':['Knight','ナイト'], '2':['Maria','マリア'], '3':['Black Dragon Rider','黒竜使い'],
  '4':['Half-Demon','半魔'], '6':['Cordelia','コーデリア'], '9':['Higuma','樋熊'],
  'J':['Wraith','レイス'], 'Q':['Giant','ジャイアント'], 'K':['Chimera','キマイラ'],
  '王':['Jesters','道化師'],
}

function cardsForRank(rank:string):Card[] {
  const prints=rank==='王'?[['J','BJ'],['J','SJ']]:['S','H','C','D'].map(suit=>[suit,rank])
  return prints.map(([suit,rank])=>({id:suit+rank,suit,rank}))
}

export function DeckProof(){
  const [rank,setRank]=useState('6')
  const [focus,setFocus]=useState<number|null>(null)
  const cards=cardsForRank(rank)
  const subject=subjectNames[rank]?t(subjects[rank],...subjectNames[rank]):displayName(subjects[rank])
  if(focus!==null){
    const card=cards[focus]
    const turn=(step:number)=>setFocus((focus+cards.length+step)%cards.length)
    return <div className="proof-detail">
      <PlayingCard card={card} mini/>
      <strong>{cardName(card)} · {jokerNames[card.rank]??subject}</strong>
      <div className="proof-nav"><button onClick={()=>turn(-1)}>{t('上一張','Previous card','前のカード')}</button>
        <button onClick={()=>setFocus(null)}>{t('返回牌樣','Back to gallery','一覧に戻る')}</button><button onClick={()=>turn(1)}>{t('下一張','Next card','次のカード')}</button></div>
    </div>
  }
  return <>
    <div className="proof-ranks" role="group" aria-label={t('依點數看牌樣','Browse by rank','ランク別に表示')}>{ranks.map(value=>
      <button key={value} type="button" aria-pressed={rank===value} onClick={()=>setRank(value)}>{value==='王'?t('王','Jokers','ジョーカー'):value}</button>
    )}</div>
    <h3 className="proof-title">{subject}{equipment[rank]&&<small> · {t(...equipment[rank])}</small>}</h3>
    <div className={'deck-proof '+(rank==='王'?'two-cards':'')}>{cards.map((card,i)=>
      <figure key={card.id}>
        <button className="proof-zoom" aria-label={t('放大'+cardName(card),'Enlarge '+cardName(card),cardName(card)+'を拡大')} onClick={()=>setFocus(i)}><PlayingCard card={card} mini/></button>
        <figcaption><strong>{cardName(card)}</strong><small>{jokerNames[card.rank]??t(...colors[card.suit])}</small></figcaption>
      </figure>
    )}</div>
  </>
}
