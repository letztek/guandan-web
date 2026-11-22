import { translate, type Language } from './i18n'
import { moveKindName } from './match-l10n'
import type { Lesson, LessonFeedback } from './tutorial-lessons'

type Pair = readonly [english: string, japanese: string]
type LessonCopy = {
  title: Pair
  rule: Pair
  scene: Pair
  prompt: Pair
  hint: Pair
  success: Pair
  question: Pair
}

const copy: Record<string, LessonCopy> = {
  lead: {
    title: ['Lead with three of a kind', 'スリーカードで先出し'],
    rule: ['One player leads each new trick. Three cards of the same rank make a legal play.', '新しいトリックは一人が先出しします。同じランクのカード3枚をまとめて出せます。'],
    scene: ['The table is clear. You lead.', '場にカードはありません。あなたの先出しです。'],
    prompt: ['You go first! Select the three 7s, then tap Play.', 'あなたからです！ 7を3枚選んで「出す」を押してください。'],
    hint: ['Select the 7 of spades, hearts, and clubs. Keep the 9.', 'スペード、ハート、クラブの7を選び、9は残しましょう。'],
    success: ['Those are the three! To beat them, the next player needs a higher triple or a bomb-type hand.', 'その3枚です！ 対抗するには、より強いスリーカードか、ボム系の役が必要です。'],
    question: ['Which three cards can go out together?', 'どの3枚をまとめて出せますか？'],
  },
  pair: {
    title: ['Follow with a pair', 'ペアで対抗'],
    rule: ['To follow with an ordinary hand, match the pattern and beat its rank.', '通常の役で対抗するときは、同じ役で場のカードより強いランクが必要です。'],
    scene: ['An opponent played a pair of 8s.', '相手が8のペアを出しました。'],
    prompt: ['That’s a pair of 8s. Which two cards in your hand beat it?', '場は8のペアです。手札のどの2枚なら上回れますか？'],
    hint: ['A single king can’t make a pair. You have two 9s.', 'Kは1枚なのでペアになりません。9が2枚あります。'],
    success: ['A pair of 9s beats the 8s. The next play has to beat your 9s.', '9のペアが8のペアを上回りました。次の人はあなたの9より強い役が必要です。'],
    question: ['Which pair can beat the 8s?', '8のペアを上回れるペアはどれですか？'],
  },
  wild: {
    title: ['Use the heart level card as a wild', 'ハートの級札はワイルドカード'],
    rule: ['At level 5, the 5 of hearts is wild. It can stand in for any ordinary card when making a hand, except a joker.', '今回はレベル5。ハートの5はワイルドカードで、役を作るときにジョーカー以外の代わりになります。'],
    scene: ['An opponent played three kings. You have two aces and the 5 of hearts.', '相手はKを3枚出しました。手札にはAが2枚とハートの5があります。'],
    prompt: ['You’re one ace short. Use the heart 5 to make three aces.', 'Aが1枚足りません。ハートの5を加えてAのスリーカードを作りましょう。'],
    hint: ['Select both aces and the 5 of hearts. The 5 of spades is also a level card, but it isn’t wild.', 'Aを2枚とハートの5を選びましょう。スペードの5も級札ですが、ワイルドカードにはなりません。'],
    success: ['The heart 5 counts as an ace here. With your two aces, that makes three of a kind.', 'ハートの5がAの代わりになり、手札のAと合わせてスリーカードになりました。'],
    question: ['You need one more ace. Which suit of 5 can stand in for it?', 'Aがあと1枚必要です。どのマークの5を代わりに使えますか？'],
  },
  full: {
    title: ['Compare two full houses', 'フルハウスの強さ比べ'],
    rule: ['A full house is three of one rank plus a pair of another. Compare the rank of the triple.', 'フルハウスは同ランクの3枚と、別ランクのペアです。強さは3枚のランクで比べます。'],
    scene: ['An opponent played three 9s with a pair of aces.', '相手は9を3枚とAのペアを出しました。'],
    prompt: ['Follow with three 10s and a pair of 6s.', '10を3枚と6のペアで対抗しましょう。'],
    hint: ['Select all three 10s and both 6s. Keep the king.', '10を3枚、6を2枚選び、Kは残しましょう。'],
    success: ['The 6s are lower than the aces, but the higher triple wins. Three 10s beat three 9s.', '6のペアはAより弱くても、3枚の比較では10が9を上回ります。'],
    question: ['We have three 10s. Which pair goes with them?', '10は3枚そろっています。どのペアを合わせますか？'],
  },
  run: {
    title: ['Make a five-card straight', '5枚のストレート'],
    rule: ['A straight has five consecutive ranks. An ace can go below 2 or above K.', 'ストレートはランクが連続する5枚です。Aは2の前かKの後に置けます。'],
    scene: ['It’s your lead.', 'あなたの先出しです。'],
    prompt: ['Make a straight from 6 through 10.', '6から10までのストレートを作りましょう。'],
    hint: ['Pick one each of 6, 7, 8, 9 and 10. Keep the queen.', '6、7、8、9、10を1枚ずつ選び、Qは残しましょう。'],
    success: ['6, 7, 8, 9 and 10 make a five-card straight.', '6、7、8、9、10で5枚のストレートが完成しました。'],
    question: ['Which card doesn’t belong in a straight from 6 to 10?', '6から10までをつなげるとき、使わないカードはどれですか？'],
  },
  pairs: {
    title: ['Make three consecutive pairs', '連続する3つのペア'],
    rule: ['Three consecutive pairs form a six-card hand.', 'ランクが続くペアを3つそろえると、6枚の役になります。'],
    scene: ['It’s your lead.', 'あなたの先出しです。'],
    prompt: ['Lead with three pairs in a row.', '連続する3つのペアで先出ししましょう。'],
    hint: ['Select a pair of 7s, a pair of 8s and a pair of 9s. Keep the jack.', '7、8、9のペアを一つずつ選び、Jは残しましょう。'],
    success: ['The pairs of 7s, 8s and 9s form three consecutive pairs.', '7、8、9のペアで連続ペアが完成しました。'],
    question: ['Which three ranks can you pair up?', 'どの3つのランクでペアを作れますか？'],
  },
  steel: {
    title: ['Combine two consecutive triples', '連続する2つのスリーカード'],
    rule: ['Two consecutive triples make a six-card hand called a steel plate.', 'ランクが続くスリーカード2組で、鋼板（6枚の役）になります。'],
    scene: ['It’s your lead.', 'あなたの先出しです。'],
    prompt: ['Play both consecutive triples together.', '連続する2組のスリーカードをまとめて出しましょう。'],
    hint: ['Choose three 8s and three 9s. Keep the queen.', '8を3枚、9を3枚選び、Qは残しましょう。'],
    success: ['Triple 8s and triple 9s make a steel plate. Another steel plate needs higher consecutive ranks to beat it.', '8と9のスリーカードで鋼板が完成しました。鋼板で対抗するには、より強い連続ランクが必要です。'],
    question: ['Which two ranks have enough cards for triples?', '3枚ずつそろうランクはどの2つですか？'],
  },
  bomb: {
    title: ['Beat an ordinary hand with a bomb', 'ボムで通常の役に対抗'],
    rule: ['Four or more cards of the same rank make a bomb and can beat ordinary hands. Bombs compare by size, then rank.', '同ランクを4枚以上集めるとボムになり、通常の役に勝てます。ボム同士は枚数、次にランクで比べます。'],
    scene: ['An opponent played a pair of aces. You have 6s and a single 9.', '相手がAのペアを出しました。手札は6が数枚と9が1枚です。'],
    prompt: ['Find a bomb that beats the pair of aces.', 'Aのペアを上回るボムを探しましょう。'],
    hint: ['All four 6s can be played together.', '6を4枚まとめて出せます。'],
    success: ['Four 6s make a bomb and beat the pair of aces.', '6を4枚そろえたボムがAのペアを上回りました。'],
    question: ['They played a pair of aces. What else can we do with these 6s?', '相手はAのペアです。6を使ってどんな出し方ができますか？'],
  },
  flush: {
    title: ['Beat a five-card bomb with a straight flush', 'ストレートフラッシュで5枚ボムに対抗'],
    rule: ['Five consecutive cards of one suit make a straight flush. It beats four- and five-card bombs. Six-card bombs or larger and four jokers can beat it.', '同じマークでランクが続く5枚はストレートフラッシュです。4枚や5枚のボムに勝ち、6枚以上のボムやジョーカー4枚には負けます。'],
    scene: ['An opponent played a bomb of five 8s.', '相手が8を5枚出してボムにしました。'],
    prompt: ['Beat it with a spade straight flush.', 'スペードのストレートフラッシュで対抗しましょう。'],
    hint: ['Find the 9, 10, J, Q and K of spades.', 'スペードの9、10、J、Q、Kを選びましょう。'],
    success: ['Five consecutive spades make a straight flush and beat the five 8s.', 'スペード5枚のストレートフラッシュで、8が5枚のボムを上回りました。'],
    question: ['Which suit can give us a straight flush to beat the bomb?', 'このボムに勝てるストレートフラッシュはどのマークですか？'],
  },
  team: {
    title: ['Let your partner keep the lead', 'パートナーに主導権を渡す'],
    rule: ['You and the player opposite you are partners. You can pass even if you could beat the current play.', '向かい側のプレイヤーがパートナーです。場より強いカードがあってもパスできます。'],
    scene: ['Your partner played a queen and has two cards left. The player on your right is out. The player on your left just passed.', 'パートナーはQを1枚出し、残り2枚です。右の相手は上がり、左の相手はパスしました。'],
    prompt: ['My queen is still highest and I have two left. Can you let me take this trick?', '私のQが場で一番強くて、残りは2枚です。このトリックを任せてもらえますか？'],
    hint: ['Tap Pass and save your ace for later.', '「パス」を押して、Aは後のために残しましょう。'],
    success: ['Thanks! I take the trick and can lead next. We still have your ace, too.', 'ありがとう！ 次は私から出せますね。あなたのAも残せました。'],
    question: ['My queen is highest and I have two left. Should you beat me with the ace?', '私のQが一番強くて残りは2枚。Aで上回るべきでしょうか？'],
  },
  wind: {
    title: ['Take the lead after your partner goes out', 'パートナーの上がりを引き継ぐ'],
    rule: ['If the last player to play goes out and everyone else passes, their partner leads the next trick. This is called catching the wind.', '最後にカードを出した人が上がり、他の人が全員パスすると、その人のパートナーが次の先出しを引き継ぎます。'],
    scene: ['The player on your right went out first. Your partner used their last two cards, a pair of kings. The player on your left passed. It’s up to you.', '右の相手が先に上がり、パートナーも最後のKのペアで上がりました。左の相手がパスし、あなたの番です。'],
    prompt: ['Those kings were my last two cards. The opponent on your left passed. How can you take over the lead?', 'このKのペアで私は上がりです。左の相手もパスしました。どうすれば次の先出しを引き継げますか？'],
    hint: ['Tap Pass. Your partner is out, so you get the next lead.', '「パス」を押しましょう。パートナーは上がったので次はあなたが先出しです。'],
    success: ['The lead is yours! Play either the 3 or the 8.', 'あなたが次の先出しです！ 3か8のどちらかを出しましょう。'],
    question: ['I’m out after those kings. How can my partner take the lead?', 'このKのペアで私は上がりです。パートナーに先出しを引き継ぐにはどうすればいいですか？'],
  },
  rank: {
    title: ['Finish first and second as a team', 'チームで1位と2位を取る'],
    rule: ['The first player out takes first place. That team goes up 3, 2, or 1 levels if their partner finishes second, third, or fourth.', '最初に上がった人が1位です。そのパートナーが2位・3位・4位なら、1位のチームはそれぞれ3・2・1レベル上がります。'],
    scene: ['Your partner finished first. An opponent played a pair of 6s. You have only a pair of 9s left.', 'パートナーは1位、相手が6のペアを出しました。手札は9のペアだけです。'],
    prompt: ['I finished first. While those 6s are still highest, play your last two cards together!', '私は1位で上がりました。6のペアが場にあるうちに、最後の2枚をまとめて出しましょう！'],
    hint: ['Play both 9s together.', '9を2枚まとめて出しましょう。'],
    success: ['We took first and second! That raises us from level 5 to 8.', '1位と2位を取れました！ レベル5から一気に8に上がります。'],
    question: ['The opponents played a pair of 6s. How can my partner go out on this turn?', '相手は6のペアです。パートナーはこの手番でどうすれば上がれますか？'],
  },
  ace: {
    title: ['Clear level A to win the match', 'レベルAをクリアして勝利'],
    rule: ['To win the match, your team must be playing level A. One partner must finish first and the other second or third.', 'チームがレベルAでプレイしているとき、一人が1位、もう一人が2位か3位で上がれば対戦に勝利します。'],
    scene: ['Your team is playing level A. Your partner finished first. The player to your right just took second with a king. You hold one ace.', '自チームはレベルA。パートナーは1位、右の相手はKを出して2位になりました。手札はAが1枚です。'],
    prompt: ['Take third place with your last card.', '最後の1枚を出して3位を取りましょう。'],
    hint: ['Select the ace of spades, then tap Play.', 'スペードのAを選んで「出す」を押しましょう。'],
    success: ['We cleared level A! I took first and your ace beat the king for third. We win!', 'レベルAをクリア！ 私が1位、あなたがAでKを上回って3位。私たちの勝ちです！'],
    question: ['I finished first and my partner has one card left. What beats the king?', '私は1位、パートナーは残り1枚です。Kを上回るカードはどれですか？'],
  },
  donate: {
    title: ['Choose a tribute card', '貢ぎ札を選ぶ'],
    rule: ['At the start of the next deal, the last-place player gives tribute to the winner. Keep the wild card and offer the highest of the others.', '次の配札では、前回の最下位が1位にカードを渡します。ワイルドカードを残して、他の手札から最も強い1枚を渡します。'],
    scene: ['You finished last. This deal is at level 5. The ace, spade 5 and heart 5 are your strongest cards.', '前回は最下位で、今回はレベル5です。強い候補はAとスペードの5、ハートの5です。'],
    prompt: ['Select an eligible card to give as tribute.', '条件に合う貢ぎ札を1枚選びましょう。'],
    hint: ['Keep the heart 5. The spade 5 is a level card, so it outranks the ace.', 'ハートの5は残します。スペードの5は級札なのでAよりも強いです。'],
    success: ['You gave the spade 5 to the previous winner and kept the heart 5. The winner now returns a card.', '前回の1位にスペードの5を渡し、ハートの5は残しました。次に相手からお返しのカードを受け取ります。'],
    question: ['Which of these two 5s stays in your hand?', '2枚の5のうち、どちらを手元に残しますか？'],
  },
  return: {
    title: ['Return a card after receiving tribute', '貢ぎ札を受け取ったら返礼'],
    rule: ['Return a card ranked 10 or lower. If every card is higher, return your weakest.', '返礼は強さが10以下のカードです。すべて10より強い場合は最も弱いカードを渡します。'],
    scene: ['You received tribute from the previous last-place player. This deal is at level 5. It’s time to return a card.', '前回の最下位から貢ぎ札を受け取りました。今回はレベル5です。返礼のカードを選びましょう。'],
    prompt: ['Choose a card ranked 10 or lower to return.', '強さが10以下のカードを選んで返礼しましょう。'],
    hint: ['Both 7 and 10 are allowed. The spade 5 is a level card here.', '7も10も渡せます。スペードの5は今回の級札です。'],
    success: ['You returned a card. When there’s a single tribute, the giver leads.', '返礼が完了しました。貢ぎ札を渡す人が一人なら、その人が先出しします。'],
    question: ['At level 5, which cards can you return after receiving tribute?', 'レベル5ではどのカードを返礼に使えますか？'],
  },
  resist: {
    title: ['Cancel tribute with two big jokers', '大ジョーカー2枚で貢ぎを免除'],
    rule: ['For a single tribute, two big jokers in the giver’s hand cancel tribute. For a double tribute, the two givers can hold them between them.', '貢ぎ手が一人なら、その人が大ジョーカーを2枚持つと免除になります。二人なら、合わせて2枚で成立します。'],
    scene: ['You finished last in the previous deal. Find the cards that cancel tribute.', '前回は最下位でした。貢ぎが免除されるカードを探しましょう。'],
    prompt: ['Select both big jokers and press Reveal jokers.', '大ジョーカーを2枚選んで「ジョーカーを公開」を押してください。'],
    hint: ['Check the corner labels and choose both big jokers. Keep the small joker in hand.', '角のマークを確認し、大ジョーカーを2枚選びます。小ジョーカーは手元に残しましょう。'],
    success: ['You have both big jokers. Tribute is canceled! Keep them both. The previous winner leads.', '大ジョーカーが2枚あるので貢ぎが免除されます！ 2枚とも手札に残り、前回の1位が先出しします。'],
    question: ['Would one big and one small joker cancel tribute? Check the corner labels.', '大と小が1枚ずつでも免除でしょうか？ 角のマークを見てみましょう。'],
  },
}

const followUp = {
  prompt: ['It’s your lead. Choose the 3 or the 8 and tap Play.', 'あなたの先出しです。3か8を選んで「出す」を押しましょう。'],
  hint: ['The table is clear. Lead with one card.', '場にカードはありません。1枚選んで出しましょう。'],
  success: ['You took over for your partner and led the new trick.', 'パートナーの先出しを引き継ぎ、新しいトリックの1枚目を出せました。'],
  question: ['You’ve taken the lead. Do you still need to follow those kings?', '先出しを引き継ぎました。先ほどのKのペアに対抗する必要はありますか？'],
} as const

export function localizedLesson(lesson: Lesson, language: Language): Lesson {
  const value = copy[lesson.id]
  if (!value || language === 'zh-Hant') return lesson
  const t = (zh: string, pair: Pair) => translate(zh,...pair,language)
  const { title, rule, scene, prompt, hint, success } = lesson
  const afterPass = lesson.afterPass
  return {
    ...lesson,
    title: t(title,value.title),
    rule: t(rule,value.rule),
    scene: t(scene,value.scene),
    prompt: t(prompt,value.prompt),
    hint: t(hint,value.hint),
    success: t(success,value.success),
    afterPass: afterPass ? {
      ...afterPass,
      prompt: t(afterPass.prompt,followUp.prompt),
      hint: t(afterPass.hint,followUp.hint),
      success: t(afterPass.success,followUp.success),
    } : undefined,
  }
}

export function lessonQuestion(lesson: Lesson, language: Language): string|undefined {
  const pair = lesson.id==='wind' && lesson.exercise.kind==='play' ? followUp.question : copy[lesson.id]?.question
  if (language === 'zh-Hant' || !pair) return undefined
  return translate('',...pair,language)
}

export function lessonFeedback(language: Language): LessonFeedback|undefined {
  if (language === 'zh-Hant') return undefined
  const t = (en: string, ja: string) => translate('',en,ja,language)
  return {
    beatTable: t('Practice beating the hand on the table. ', '場のカードより強い役を出してみましょう。'),
    mustLead: t('You’re leading, so you need to play a hand first.', 'あなたの先出しです。まずカードを出してください。'),
    pickCards: t('First, select the cards you want to play.', 'まず手札から出したいカードを選んでください。'),
    invalidPattern: t('These cards don’t form a legal hand. ', '選んだカードでは役が成立しません。'),
    letPartnerLead: t('That would beat the table. For this exercise, let your partner lead. ', 'その役で対抗できますが、この練習ではパートナーに先出しを任せましょう。'),
    tooSmall: kind => t('This play can’t beat the '+moveKindName(kind)+' on the table. ', 'この役では場の'+moveKindName(kind)+'を上回れません。'),
    tryPattern: kind => t('That’s legal. For this lesson, try playing '+moveKindName(kind)+'. ', 'その役も出せます。この練習では'+moveKindName(kind)+'を出してみましょう。'),
  }
}
