import type { Language } from './i18n'

export function translateReason(text: string, language: Exclude<Language, 'zh-Hant'>): string {
  if (!/\p{Script=Han}/u.test(text)) return text
  const column = language === 'en' ? 0 : 1
  let result = text
  for (const [pattern, en, ja] of dynamic) {
    result = result.replace(pattern, column === 0 ? en : ja)
  }
  for (const [source, pair] of Object.entries(reasons)) {
    result = result.replaceAll(source, pair[column])
  }
  for (const [source, pair] of Object.entries(words)) {
    result = result.replaceAll(source, pair[column])
  }
  return result.trim()
}

const dynamic: Array<readonly [RegExp, string, string]> = [
  [/推演 (\d+) 種可能的牌局到本副結束，選擇「(.+?)」而不是「(.+?)」：/g,
    'Across $1 possible deals played to the end, $2 beats $3: ',
    '考えられる$1通りの配り方を最後まで試算すると、「$2」は「$3」より有利です。'],
  [/我方拿頭游的比例由 (\d+)% 提高到 (\d+)%。/g,
    'your team finishes first in $2% of them instead of $1%. ',
    'チームが1位になる展開が$1%から$2%に増えます。'],
  [/我方包辦前兩名的比例由 (\d+)% 提高到 (\d+)%。/g,
    'your team takes first and second in $2% of them instead of $1%. ',
    'チームで1、2位を取る展開が$1%から$2%に増えます。'],
  [/對手包辦前兩名的比例由 (\d+)% 降到 (\d+)%。/g,
    'the opponents take first and second in $2% of them instead of $1%. ',
    '相手に1、2位を取られる展開が$1%から$2%に減ります。'],
  [/平均每副多升 ([\d.]+) 級。/g,
    'on average your team gains $1 more levels per deal. ',
    '1局あたり平均$1レベル多く上がれます。'],
  [/這手打出後，餘牌可安排成 (\d+) 手。/g,
    'After this play, your remaining cards can be grouped into $1 plays. ',
    'この手を出すと、残りの札は$1手にまとめられます。'],
  [/依已出牌、明牌與餘張，能連續保住牌權。先出(.+?)收圈，再由(.+?)守住下一圈，最後領出(.+?)(?=，)/g,
    'The public cards and hand sizes show a safe line. Win this trick with $1, keep the lead with $2, then lead $3',
    '出た札、公開された札、残り枚数から安全に上がれます。$1でこのトリックを取り、$2で次も取り、最後に$3を出し'],
  [/依已出牌、明牌與餘張，能連續保住牌權。先出(.+?)收圈，下一圈領出(.+?)(?=，)/g,
    'The public cards and hand sizes show a safe line. Win this trick with $1, then lead $2',
    '出た札、公開された札、残り枚数から安全に上がれます。$1でこのトリックを取り、次に$2を出し'],
  [/隊友的 (\d+) 張餘牌都已公開，可以接下這手；若中途無人攔住，他就能直接走完。/g,
    'All $1 of your partner’s cards are public and can follow this play. If nobody blocks them, they can go out. ',
    'ペアの残り$1枚はすべて公開されています。途中で止められなければ、この手に続いて上がれます。'],
  [/隊友只剩 (\d+) 張。留給他用較大的單張接牌，爭取讓隊友先走。/g,
    'Your partner has $1 cards left. Leave room for a higher single so they can go out first. ',
    'ペアは残り$1枚です。より強い1枚で上がれるよう、出番を残します。'],
  [/隊友只剩 (\d+) 張。若餘牌能組成較大的(.+?)，就有機會接牌，爭取讓隊友先走。/g,
    'Your partner has $1 cards left. If they have a higher $2, they can follow and may go out first. ',
    'ペアは残り$1枚です。より強い$2を作れるなら、続けて先に上がれるかもしれません。'],
  [/若讓對方收圈，只剩 (\d+) 張的對手就能領出；先壓住桌面爭回牌權。/g,
    'If the opponent wins this trick, they lead with only $1 cards left. Beat the table to contest the lead. ',
    '残り$1枚の相手にトリックを取られると、相手が次の札を選べます。今は場の札を上回り、主導権を取りにいきます。'],
  [/對手剩 (\d+) 張。/g,'An opponent has $1 cards left. ','相手は残り$1枚です。'],
  [/隊友剩 (\d+) 張。/g,'Your partner has $1 cards left. ','ペアは残り$1枚です。'],
  [/用這手壓過桌面，出完剩 (\d+) 張。/g,
    'Beat the table with this play and keep $1 cards. ','この手で場の札を上回ると、残り$1枚になります。'],
  [/先領出(.+?)，(?:手牌|把手牌)減到 (\d+) 張。/g,
    'Lead with $1 to cut the hand to $2 cards. ','$1から出して、手札を$2枚に減らします。'],
  [/出完保留(.+?)，下次領出即可整手出完。/g,
    'This keeps $1 together. If you regain the lead, play it to go out. ','$1を残します。次に先手を取れれば、この役で上がれます。'],
  [/用(.+?) 壓過對手，爭取下一圈先出。/g,
    'Play $1 to beat the opponent and try to lead next. ','$1で相手を上回り、次の先手を取りにいきます。'],
  [/下家對手只剩一張，跟不了桌上的(.+?)，也湊不成炸彈。過牌就能讓隊友收圈，下一圈由他先出。/g,
    'The next opponent has one card left. They cannot follow the $1 or make a bomb. Pass to let your partner win this trick and lead the next. ',
    '次の相手は残り1枚で、場の$1にもボムにも届きません。パスすればペアがトリックを取り、次の先手になります。'],
  [/後續對手的張數都不夠跟桌上的(.+?)，也湊不成炸彈。過牌就能讓隊友收圈，下一圈由他先出。/g,
    'The opponents still to act have too few cards to follow the $1 or make a bomb. Pass to let your partner win this trick and lead the next. ',
    '後ろの相手は枚数が足りず、場の$1にもボムにも届きません。パスすればペアがトリックを取って次の先手になります。'],
  [/依已出牌、明牌和剩餘張數，後面的對手組不出更大的(.+?)。過牌讓隊友收圈，下一圈由他先出。/g,
    'The public cards and hand sizes rule out a higher $1 from the opponents still to act. Pass to let your partner win and lead the next trick. ',
    '出た札、公開された札、残り枚数から、後ろの相手はより強い$1を作れません。パスすればペアがトリックを取って次の先手になります。'],
  [/下家對手剩(兩張|一張|\d+ 張)/g, 'The next opponent has $1 left', '次の相手は残り$1で'],
  [/後面的對手剩(兩張|一張|\d+ 張)/g, 'An opponent still to act has $1 left', '後ろの相手は残り$1で'],
  [/，若握有更大的(.+?)就能走完。/g, ' and can go out if they have a higher $1. ', '、より強い$1を持っていれば上がれます。'],
  [/隊友目前最大、只剩 (\d+) 張。這手過牌保留他的領出機會，讓他先整理餘牌。/g,
    'Your partner is winning and has $1 cards left. Pass to preserve their chance to take the lead and finish. ',
    'ペアが優勢で、残り$1枚です。パスしてペアの先手を残し、上がりやすくします。'],
  [/用(.+?) 壓過隊友，先攔這次收牌。/g, 'Play $1 over your partner to block the finish. ', '$1でペアの札を上回り、相手の上がりを止めます。'],
  [/用(.+?) 壓過隊友，主動把門檻拉高。/g, 'Play $1 over your partner to put pressure on the opponent. ', '$1でペアの札を上回り、相手に圧力をかけます。'],
  [/用(.+?) 壓過隊友，用較省的牌提高門檻。/g, 'Play $1 over your partner to raise the bar cheaply. ', '$1でペアの札を上回り、強い札を温存しながら相手を止めます。'],
  [/若能收圈，下圈可領出(.+?)，一次出完。/g, 'If this wins, lead $1 next to go out. ', 'このトリックを取れれば、次に$1を出して上がれます。'],
  [/對手只剩一張。(?:改出|領出)(.+?)，他無法在這手跟單走完。/g,
    'An opponent has one card left. Play $1 to rule out a one-card finish this turn. ',
    '相手は残り1枚です。$1を出せば、この手に続けて1枚で上がることはできません。'],
  [/隊友已出完。用(.+?)(?:壓牌|領出)，爭取自己提早走完。/g,
    'Your partner is out. Play $1 to improve your chance of finishing soon. ',
    'ペアは上がっています。$1を出して、自分も早めに上がることを狙います。'],
  [/先領出較小的(.+?)，隊友若能跟上就有機會一次走完。/g,
    'Lead a low $1 so your partner can go out if they can follow. ', '低い$1から出します。ペアが続けられれば、そのまま上がれる可能性があります。'],
  [/用(.+?) 壓住(隊友|對手)的牌。/g, 'Play $1 over the $2. ','$2の札を$1で上回ります。'],
  [/先領出(.+?)。/g, 'Lead with $1. ','$1から出します。'],
  [/隊友若有更大的(.+?)，就有機會跟上。/g,
    'Your partner can follow if they have a higher $1. ','ペアがより強い$1を持っていれば続けられます。'],
  [/若(?:能)?再拿到牌權，可以(?:接著)?領出(.+?)。/g,
    'If you regain the lead, you can open with $1. ','再び先手を取れれば、$1から出せます。'],
  [/把對 (.+?) 留在手上。/g,'Keep the pair of $1s. ','$1のペアを手札に残します。'],
  [/這手會用掉一對級牌 (.+?) 作配對。/g,
    'This play spends a pair of level cards ($1). ','この手ではレベル札のペア（$1）を使います。'],
  [/葫蘆只比三張的點數，這樣可以留下級牌對 (.+?)。/g,
    'Full houses compare the triple, so this keeps your pair of level cards ($1). ','フルハウスはスリーカードの強さで比べるため、レベル札のペア（$1）を残せます。'],
  [/三張可以單出，留下級牌對 (.+?) 接之後的對子。/g,
    'Play the triple by itself and save the pair of level cards ($1) to beat a later pair. ','スリーカードを単独で出し、レベル札のペア（$1）を後のペアに備えて残します。'],
]

const reasons: Record<string, readonly [string, string]> = {
  '隊友已出完，過牌就能接風，下一圈由你領出。': ['Your partner is out. Pass to inherit the next lead. ', 'ペアは上がっています。パスすれば先手を引き継げます。'],
  '隊友已出完，依公開牌可確定這手過牌會給對手直接走完的機會。': ['Your partner is out. The public cards show that passing would let the opponent go out immediately. ', 'ペアはすでに上がっています。公開札から、ここでパスすると相手がすぐに上がれると分かります。'],
  '這樣能提高我方守住三游的機會。': ['This gives your team a better chance to secure third place. ', 'この手でチームが3位を確保しやすくなります。'],
  '依已出牌、明牌與餘張，這手就能守住牌權。': ['The played cards, exposed cards and hand sizes show this play will hold the lead. ', '出た札と公開札、残り枚数から、この手で先手を取れます。'],
  '留下炸彈，對手再搶牌權時還能攔。': ['Keep the bomb to challenge an opponent who takes the lead later. ', 'ボムを温存し、後で相手が先手を取ったときに使えます。'],
  '花掉控牌後，我方在更多推演裡包辦前兩名。': ['Spending the control cards gave your team both top places in more of the simulated deals. ', '切り札を使う方が、試算ではチームで1位と2位を取れる展開が増えました。'],
  '花掉控牌後，我方在更多推演裡拿到頭游。': ['Spending the control cards gave your team first place in more of the simulated deals. ', '切り札を使う方が、試算ではチームが1位になる展開が増えました。'],
  '這樣能降低對手包辦前兩名的機會。': ['In the simulated deals the opponents took both top places less often. ', '試算では相手に1位と2位を取られる展開が減りました。'],
  '兩張小王都已出過。': ['Both small jokers have been played. ', '小ジョーカーは2枚とも出ています。'],
  '，替我方拿頭游。': [' to finish first for your team. ', 'て、チームの1位を取ります。'],
  '，我方就能包辦頭游、二游。': [' to take both first and second for your team. ', 'て、チームで1、2位を取ります。'],
  '，替我方守住三游。': [' to secure third place for your team. ', 'て、チームの3位を守ります。'],
  '，出完全部餘牌。': [' to play the rest of your hand. ', 'て、残りの札をすべて出します。'],
  '隊友目前最大，你過牌後這圈就結束，下一圈由隊友先出。': [
    'Your partner is winning the trick. If you pass, they close it and lead the next one. ', 'ペアが場で一番強い札を出しています。パスすればペアがこのトリックを取り、次の先手になります。'],
  '，公開的牌能一次走完。': [' and can go out with their public cards. ', '、公開された札で一手で上がれます。'],
  '，依已出牌可確定他能一次走完。': [' and the played cards establish that they can go out in one turn. ', '、出た札から一手で上がれることが分かります。'],
  '這手過牌。若壓過隊友，先前過牌的對手會重新取得跟牌機會，依公開資訊他能直接走完。': [
    'Pass. Beating your partner would let an opponent act again, and the public cards show that they could go out. ',
    'パスします。ペアの札を上回ると一度パスした相手にも出番が戻り、公開情報から相手が上がれることが分かります。'],
  '若能收圈，下圈就由我方領出。': ['If this wins the trick, your team will lead next. ', 'このトリックを取れれば、こちらのチームが次の先手になります。'],
  '隊友已拿頭游，這手出完就包辦頭游、二游。': [
    'Your partner finished first. Go out now to take second as well. ', 'ペアはすでに1位です。ここで上がれば、チームで1、2位を取れます。'],
  '隊友已拿頭游，對手已拿二游；這手出完就能替我方守住三游。': [
    'Your partner finished first and an opponent finished second. Go out now to secure third. ', 'ペアが1位、相手が2位です。ここで上がれば、チームの3位を守れます。'],
  '這手能出完，直接替我方拿下頭游。': ['Play this to go out first for your team. ', 'ここで上がれば、チームの1位を取れます。'],
  '這手能出完，直接取得本副下一個名次。': ['Play this to go out and secure the next place. ', 'この手で上がり、次の順位を確保します。'],
  '手上沒有能壓過桌面的牌，這手過牌。': ['You have no play that beats the table. Pass. ', '場の札を上回れる手がないため、パスします。'],
  '隊友目前最大，先過牌。': ['Your partner is winning. Pass. ', 'ペアが優勢なのでパスします。'],
  '隊友已出完且目前最大；這圈若守住，就由你接風領出。': [
    'Your partner is out and still winning this trick. If it holds, you inherit the lead. ', 'ペアは上がっており、場でも優勢です。このままなら、あなたが次の先手になります。'],
  '隊友目前最大；過牌保留他的領出機會，也留住手上的控牌。': [
    'Your partner is winning. Passing leaves them a chance to lead and keeps your control cards. ', 'ペアが優勢です。パスすればペアの先手の可能性を残し、自分の強い札も温存できます。'],
  '過牌保留目前牌型。': ['Pass to keep your combinations intact. ', 'パスして手札の役を温存します。'],
  '這圈先過，保留手牌，等下一次接手。': ['Pass and save your hand for the next chance. ', 'ここはパスして、次の機会に手札を温存します。'],
  '隊友目前最大，但後面有對手可能一手走完。': [
    'Your partner is winning, but an opponent still to act may go out in one play. ', 'ペアが優勢ですが、後ろの相手が一手で上がる可能性があります。'],
  '改出這手能攔住這次收牌。': ['This play blocks that finish. ', 'この札を出せば、相手がここで上がるのを防げます。'],
  '提高門檻，降低對手這次走完的機會。': [
    'Raise the bar to make it harder for the opponent to go out. ', 'より強い札を出して、相手がここで上がりにくくします。'],
  '對手只剩一張。出較大的單張，提高他直接走完的門檻。': [
    'An opponent has one card left. Play a higher single to make it harder for them to go out. ', '相手は残り1枚です。強い1枚を出して、上がりを防ぎます。'],
  '隊友已出完，目前仍是他最大。先過牌，這圈若沒人壓過，你就能接風領出。': [
    'Your partner is out and is still winning the trick. Pass. If nobody beats it, you inherit the lead. ', '上がったペアが場で勝っています。パスして、このままなら次の先手を引き継げます。'],
  '隊友已出完。這圈先過，保留手牌爭取下一次牌權。': [
    'Your partner is out. Pass and keep your cards to contest the next lead. ', 'ペアは上がっています。パスして、次に先手を取るための札を温存します。'],
  '隊友公開的兩張牌能組成對子。': ['Your partner’s two public cards make a pair. ', 'ペアの公開された2枚はペアになります。'],
  '隊友公開的兩張是散牌，需要分兩手走。': [
    'Your partner has two public singles and needs two turns to finish. ', 'ペアの公開された2枚は単札なので、上がるには2回出す必要があります。'],
  '隊友剩兩張，若是散牌，就需要兩次出牌機會。': [
    'Your partner has two cards. If they are singles, they need two plays to go out. ', 'ペアは残り2枚です。単札なら上がるには2回出す必要があります。'],
  '你過牌，這圈就由隊友收下，下一圈由他先出。': [
    'If you pass, your partner wins this trick and leads the next one. ', 'パスすればペアがこのトリックを取り、次の先手になります。'],
  '先過，讓隊友的牌繼續留在桌面；後面的人都過，他就能先出下一圈。': [
    'Pass and leave your partner’s play on top. If the others pass too, your partner leads next. ', 'パスしてペアの札を場に残します。後ろが全員パスすれば、ペアが次の先手です。'],
  '先過，把這次跟牌機會留給隊友；等對手再加壓時，你仍保有現在的手牌可以接應。': [
    'Pass to let your partner follow. You’ll still have your current hand if the opponent raises. ', 'ここはパスして、ペアに続ける機会を残します。相手がさらに上回っても、今の手札で応じられます。'],
  '這手先過，留住能壓牌的選擇，等下一圈出現適合隊友接的牌型。': [
    'Pass and keep your options open until a play your partner can follow comes up. ', 'パスして選択肢を残し、次のトリックでペアが続けやすい役を待ちます。'],
  '若讓大家過牌，這名對手就能接著挑下一圈的牌型。': [
    'If everyone passes, this opponent gets to choose the next combination. ', '全員がパスすると、この相手が次のトリックの役を選べます。'],
  '和過牌相比，推演中對手較少搶到頭游。': [
    'In the projected lines, the opponent takes first less often than if you pass. ', '先を読むと、パスするより相手が1位になる展開を減らせます。'],
  '若能收圈，下圈的牌型就由你決定。': ['If you win the trick, you choose what to lead next. ', 'このトリックを取れば、次の役を選べます。'],
  '若這手守住，下一圈的牌型就由你決定。': ['If this play holds, you choose what to lead next. ', 'この手を守れれば、次の役を選べます。'],
  '這樣走，隊友在更多推演裡能出完。': ['In more of the projected lines, your partner goes out. ', 'この手では、ペアが上がれる展開が増えます。'],
  '推演中，你在接下來幾圈出完手牌的機會也較多。': [
    'The projected lines give you more chances to go out over the next few tricks. ', '先を読むと、数トリック以内に自分が上がれる機会も増えます。'],
  '推演裡，隊友接下來有較多次出牌機會。': [
    'The projected lines give your partner more chances to play. ', '先を読むと、ペアが札を出す機会が増えます。'],
  '比較後續幾圈，這樣較少讓對手把餘牌整理成最後一手。': [
    'Over the next few tricks, this makes it harder for the opponent to set up a final play. ', '数トリック先を比べると、相手が最後の一手を整えにくくなります。'],
  '這手可以出完。': ['This play goes out. ', 'この手で上がれます。'],
  '沒有能跟的牌，這手過牌。': ['You have no legal follow. Pass. ', '続けられる札がないため、パスします。'],
  '先出這組牌，保留手上的大牌。': ['Play this combination and save your high cards. ', 'この役を出して、手札の強い札を温存します。'],
}

const words: Record<string, readonly [string, string]> = {
  '三連對': ['three consecutive pairs', '3連続のペア'], '鋼板': ['two consecutive triples', '2連続のスリーカード'],
  '三帶對': ['full house', 'フルハウス'], ' 帶 ': [' with ', 'と'], '過牌': ['pass', 'パス'],
  '四王': ['four jokers', 'ジョーカー4枚'], '同花順': ['straight flush', 'ストレートフラッシュ'],
  '葫蘆': ['full house', 'フルハウス'], '順子': ['straight', 'ストレート'],
  '炸彈': ['bomb', 'ボム'], '單張': ['single', '1枚'], '三張': ['triple', 'スリーカード'],
  '對子': ['pair', 'ペア'], '對手': ['opponent', '相手'], '隊友': ['partner', 'ペア'],
  '大王': ['big joker', '大ジョーカー'], '小王': ['small joker', '小ジョーカー'],
  '兩張': ['two cards', '2枚'], '一張': ['one card', '1枚'], ' 張': [' cards', '枚'],
}
