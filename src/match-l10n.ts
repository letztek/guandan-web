import { getLanguage, localizedName, localize, translate as t } from './i18n'
import { names, suitNames, symbols, type Card, type Move } from './rules'

export function displayName(name: string) {
  switch (name) {
    case '你': return t(name, 'you', 'あなた')
    case '右家': return t(name, 'right-hand opponent', '右の対戦相手')
    case '對家': return t(name, 'partner', 'パートナー')
    case '左家': return t(name, 'left-hand opponent', '左の対戦相手')
    default: return localizedName(name)
  }
}

const moveKinds: Record<Move['kind'], [string, string]> = {
  single: ['Single', 'シングル'], pair: ['Pair', 'ペア'], triple: ['Triple', 'スリーカード'],
  full: ['Full house', 'フルハウス'], straight: ['Straight', 'ストレート'],
  pairs: ['Three consecutive pairs', '連続3ペア'], steel: ['Two consecutive triples', '連続スリーカード'],
  bomb: ['Bomb', 'ボム'], flush: ['Straight flush', 'ストレートフラッシュ'], kings: ['Four jokers', 'ジョーカー4枚'],
}

export function moveKindName(kind: Move['kind']) {
  const labels = moveKinds[kind]
  return labels ? t(names[kind], ...labels) : kind
}

export function rankName(rank: string) {
  if (rank === 'SJ' || rank === '小王') return t('小王', 'small joker', '小ジョーカー')
  if (rank === 'BJ' || rank === '大王') return t('大王', 'big joker', '大ジョーカー')
  return rank
}

export function moveLabel(label: string) {
  if (getLanguage() === 'zh-Hant') return label
  if (label === '四王') return moveKindName('kings')
  return label.replace(/小王|大王/g, rankName)
    .replace(/ 帶 /g, t(' 帶 ', ' with ', '＋'))
    .replace(/(\d+)張 /g, (_part, count: string) => t(count+'張 ', count+' cards, ', count+'枚 '))
}

export function moveName(move: Move) {
  const name = moveKindName(move.kind)
  return move.kind==='kings' && getLanguage()!=='zh-Hant' ? name : name+' · '+moveLabel(move.label)
}

const enSuits: Record<string,string> = {S:'spades', H:'hearts', D:'diamonds', C:'clubs'}
const jaSuits: Record<string,string> = {S:'スペード', H:'ハート', D:'ダイヤ', C:'クラブ'}
export function cardName({suit,rank}: Card) {
  if (suit==='J') return rankName(rank)
  return t(suitNames[suit]+rank, rank+' of '+enSuits[suit], jaSuits[suit]+'の'+rank)
}

export function describeCards(cards: readonly Card[]) {
  return cards.map(card => card.suit==='J'?rankName(card.rank):symbols[card.suit]+card.rank).join(' ')
}

export function placeName(index: number) {
  return [
    t('頭游', '1st', '1位'), t('二游', '2nd', '2位'),
    t('三游', '3rd', '3位'), t('末游', '4th', '4位'),
  ][index] ?? ''
}

export function remainingCards(count: number) {
  return t('剩 '+count+' 張', count+' left', '残り'+count+'枚')
}

export function cardCount(count: number) {
  return t(count+' 張', count+(count===1?' card':' cards'), count+'枚')
}

export function handNumber(count: number) {
  return t('第 '+count+' 副', 'Deal '+count, '第'+count+'局')
}

export function trickNumber(count: number) {
  return t('第 '+count+' 圈', 'Trick '+count, '第'+count+'トリック')
}

export function actionName(action: 'donate'|'return'|'follow'|'lead') {
  const actions = {
    donate: t('進貢', 'give tribute', '貢ぎ札を渡す'),
    return: t('還貢', 'return tribute', '返礼札を渡す'),
    follow: t('跟牌', 'respond', 'フォロー'),
    lead: t('領出', 'lead', '先出し'),
  }
  return actions[action]
}

const events: Record<string,[string,string]> = {
  '尚未輪到這個座位。': ['It is not this player’s turn.', 'まだこのプレイヤーの番ではありません。'],
  '領出時必須出牌。': ['You must play a hand when leading.', '先出しでは必ずカードを出します。'],
  '過牌': ['Pass', 'パス'],
  '自動過牌（整手無法跟牌）': ['Auto-pass (no legal response)', '自動パス（出せる組み合わせなし）'],
  '自動過牌（最後一張無法跟牌）': ['Auto-pass (last card cannot respond)', '自動パス（最後のカードでは出せない）'],
  '這手牌含有重複或已打出的牌。': ['This selection contains a duplicate or a card already played.', '同じカード、またはすでに出したカードが含まれています。'],
  '這手牌不符合牌型或無法壓過桌面牌。': ['This is not a valid combination, or it cannot beat the current play.', '無効な組み合わせか、場のカードより弱い組み合わせです。'],
  '本場無法開始下一副。': ['A new deal cannot start at this point.', '次の局を始められません。'],
  '上副雙下，兩位負方各進貢一張牌。': ['The losing team finished third and fourth. Both players give one card as tribute.', '前局で3位と4位になったチームは、2人ともカードを1枚ずつ貢ぎます。'],
  '上副末游向頭游進貢。': ['The last finisher gives tribute to the first finisher.', '前局の4位が1位に貢ぎ札を渡します。'],
  '這張牌不符合本次進貢或還貢的條件。': ['This card is not eligible for this tribute exchange.', 'このカードは今回の貢ぎ札・返礼札の条件を満たしていません。'],
}

function englishSubject(name: string) {
  return name==='你'?'You':'The '+displayName(name)
}

function localizedCardText(text: string) {
  const suits: Record<string,string> = {黑桃:'S',紅心:'H',方塊:'D',梅花:'C', '♠':'S', '♥':'H', '♦':'D', '♣':'C'}
  return text.replace(/(黑桃|紅心|方塊|梅花|[♠♥♦♣])?(小王|大王|10|[23456789JQKA])/g, (raw, suit: string|undefined, rank: string) => {
    const code = suits[suit ?? '']
    return code ? cardName({id:'',suit:code,rank}) : rankName(raw)
  })
}

export function localizeGameEvent(text: string) {
  if (getLanguage()==='zh-Hant') return text
  const entry=events[text]
  if(entry)return t(text,...entry)
  const cut = /^翻牌 (.+)，(你|右家|對家|左家) 抓到明牌，首先領出。$/.exec(text)
  if (cut) {
    const card = localizedCardText(cut[1]), player = displayName(cut[2])
    return t(text, 'Cut card: '+card+'. '+englishSubject(cut[2])+' will lead first.', 'めくり札は'+card+'。'+player+'が引いたので、最初に出します。')
  }
  const action = /^(你|右家|對家|左家) (收下這圈，重新領出|接風，替已出完牌的隊友領出|領出|出完手牌，取得(頭游|二游|三游|末游))。$/.exec(text)
  if (action) {
    const player = displayName(action[1])
    const subject = englishSubject(action[1])
    if (action[3]) {
      const place = placeName(['頭游','二游','三游','末游'].indexOf(action[3]))
      return t(text,subject+' finished '+place+'.',player+'がカードを出し切り、'+place+'になりました。')
    }
    if(action[2].startsWith('接風')) return t(text,subject+' will take over the lead from their partner.',player+'が上がったパートナーに代わって先出しします。')
    if(action[2].startsWith('收下')) return t(text,subject+' won the trick and will lead again.',player+'がトリックを取り、再び先出しします。')
    return t(text, subject+' will lead.',player+'が先出しします。')
  }
  const transfer = /^(你|右家|對家|左家) (進貢|還貢) (.+) 給 (你|右家|對家|左家)。$/.exec(text)
  if (transfer) {
    const giver=displayName(transfer[1]), receiver=displayName(transfer[4]), card=localizedCardText(transfer[3])
    const subject=englishSubject(transfer[1]), recipient=transfer[4]==='你'?'you':'the '+receiver
    return transfer[2]==='進貢'
      ? t(text,subject+' gave '+card+' to '+recipient+' as tribute.',giver+'が'+receiver+'に'+card+'を貢ぎます。')
      : t(text,subject+' returned '+card+' to '+recipient+'.',giver+'が'+receiver+'に'+card+'を返礼します。')
  }
  const refusal = /^抗貢成立。(.+)持(?:有)?兩張大王，本副免進貢，由上副頭游（(.+)）先出。$/.exec(text)
  if(refusal) {
    const double=refusal[1].startsWith('雙下'), leader=displayName(refusal[2])
    return double
      ? t(text,'Tribute is waived because the two losing players hold both big jokers. '+englishSubject(refusal[2])+' will lead.', '前局で3位と4位の2人が大ジョーカーを2枚持っているため、貢ぎは免除されます。'+leader+'が先出しします。')
      : t(text,'Tribute is waived because the last finisher holds both big jokers. '+englishSubject(refusal[2])+' will lead.', '前局4位のプレイヤーが大ジョーカーを2枚持っているため、貢ぎは免除されます。'+leader+'が先出しします。')
  }
  return localize(text)
}

export function localizeSelectionHint(text: string) {
  if (getLanguage()==='zh-Hant') return text
  const fixed = /^(.+) 只能當 (.+)。要把一對 (.+) 補成三張，需用同點數的牌或 ♥(.+)。$/.exec(text)
  if (fixed) {
    const [,card,level,rank,wildLevel]=fixed
    return t(text,card+' can only count as '+level+'. To turn a pair of '+rank+'s into a triple, add a '+rank+' or ♥'+wildLevel+'.',
      card+'は'+level+'としてしか使えません。'+rank+'のペアを3枚にするには、'+rank+'か♥'+wildLevel+'が必要です。')
  }
  const mapped = /^♥(.+) 代 (.+)，這手是三張 (.+)。(.+)$/.exec(text)
  if (mapped) {
    const [,level,rank,,tail]=mapped
    const prefix=t('', '♥'+level+' counts as '+rank+', creating a triple. ', '♥'+level+'を'+rank+'として使うとスリーカードになります。')
    if(tail.startsWith('桌面是對子'))return prefix+t('', 'The table shows a pair. Select only two cards to respond with a pair.', '場はペアです。ペアで返すには2枚だけ選んでください。')
    const minimum = /^點數要大於桌面的 (.+) 才能跟牌。$/.exec(tail)?.[1]
    if(minimum)return prefix+t('', 'You need a rank above '+moveLabel(minimum)+' to follow.', 'フォローするには場の'+moveLabel(minimum)+'より強いランクが必要です。')
    const kind=Object.keys(names).find(key=>tail.includes(names[key])) as Move['kind']|undefined
    if(kind)return prefix+t('', 'A triple cannot beat '+moveKindName(kind).toLowerCase()+'.', 'スリーカードでは'+moveKindName(kind)+'に勝てません。')
  }
  return text
}

export function adviceReason(reason: string) { return localize(reason) }
