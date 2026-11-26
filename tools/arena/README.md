# Arena：對比賽 bot 量強度

讓本遊戲的牌手和「首屆中國人工智能掼蛋算法大賽」的規則型 bot 打完整的一場（從 2 打到 A）。裁判是本遊戲自己的引擎 `src/match.ts`，所以量到的就是遊戲裡實際的規則。

這些 bot 是 [DanLM](https://github.com/dashidhy/DanLM) 拿來評測的基準，它的 README 公布了 DanLM 對同一批 bot 的勝率。DanLM 本身只發布 macOS ARM64 的編譯檔，在 Linux 跑不了，所以這裡用這批 bot 當共同對手，間接比較我們跟 DanLM 的差距。

## 準備

bot 不放進本 repo（授權不同）。先另外 clone DanLM，只用它的 `baselines/` 目錄：

```bash
git clone --depth 1 https://github.com/dashidhy/DanLM.git /tmp/DanLM
```

需要 `python3`（bot 只用標準庫）。

## 執行

```bash
node --disable-warning=ExperimentalWarning --experimental-strip-types tools/arena/run.ts --baselines /tmp/DanLM/baselines --bot njupt-guandan-ai --strength advanced --games 200 --out arena.jsonl
```

```bash
node --disable-warning=ExperimentalWarning --experimental-strip-types tools/arena/summary.ts arena.jsonl
```

- `--bot`：`njupt-guandan-ai`、`egg-expert`、`guanglan-iot`、`egg-pancake`（DanLM 公布過對這四個的勝率）
- `--strength`：`beginner`、`standard`、`advanced`
- `--seed`、`--from`：換牌局；同一組 seed 與局號會發出同一副牌，方便比較改版前後
- 我方隊伍每局輪流坐 0/2 與 1/3

## 協定

`njupt.ts` 把牌與牌型翻成比賽協定（`ST` 代表 10、`SB`/`HR` 代表小王/大王、順子報最小點、四王是 `["Bomb","JOKER",…]`）。出牌清單由本遊戲的 `allMoves` 產生，跟牌時 PASS 排第一，所以 bot 只能出本遊戲允許的牌。`bot_host.py` 每個座位開一個 Python 行程，把 bot 的 print 導離 stdout。bot 回傳無效索引或拋例外時記入 `botErrors`，並改出清單第一個動作；結果裡這個數字應為 0。

## 和 DanLM 數字的差異

- DanLM 的「單局勝率」是隨機等級、隨機進貢的單局；這裡的「頭游率」取自完整對局中的每一局，兩者接近但不完全相同。
- DanLM 用自己的引擎評測；這裡用本遊戲的規則，例如沒有「打 A 三次不過退回 2」。

## 直接對 DanLM（需要 Apple Silicon Mac）

DanLM 的引擎與模型只有 macOS ARM64 編譯檔，所以這一步要在 M 系列 Mac 上跑。裁判仍是本遊戲引擎；`danlm_host.py` 在 DanLM 引擎上開一個影子牌局，同步每一步，輪到 DanLM 的座位時問模型出什麼。兩邊引擎對某手牌或輪到誰有歧見時，該副牌會被跳過並印出原因（`skipped`），這個數字本身就是規則差異的量測。

每一手在兩邊之間傳的是：實際的牌、DanLM 的牌型（`fullhouse`、`normalbomb`、`plate`、`tube`、`flushbomb` 等），以及 DanLM 叫法的點數。順子、同花順、三連對、鋼板報最大點，三帶對報三張的點數。

只傳點數不夠。兩張逢人配能讓同一組牌宣告成兩種牌型，點數卻一樣：

- 打 5 時，`S4 C4 D4 H5 H5` 可以是 4 的三帶對（帶一對 5），也可以是五張 4 的炸彈。
- `C4 H4 C5 S5 H5 H5` 可以是鋼板 4·5，也可以是三連對 3·4·5。

橋接第 3 版以前沒有傳牌型，兩邊會各挑一種。例如 DanLM 出三帶對，本遊戲記成炸彈；同一圈接著出的較大三帶對或四張炸彈，就會被判成 `DanLM played …, which this game does not allow here`，這副牌被跳過（收集資料時整場作廢）。這是傳遞的資訊不夠，不是規則差異；目前沒有發現兩邊規則不同的牌型。

`guessed` 是找不到同牌型、同點數宣告的次數（四王不比點數）。接真的 DanLM 時，這個數字不為 0 表示兩邊對某種牌型的叫法還有差異。

```bash
git clone --depth 1 https://github.com/dashidhy/DanLM.git ~/DanLM
```

```bash
python3.12 -m venv ~/danlm-venv && ~/danlm-venv/bin/pip install torch numpy onnxruntime
```

```bash
PYTHONPATH=~/DanLM ~/danlm-venv/bin/python tools/arena/danlm_host.py ~/DanLM --selftest
```

```bash
node --disable-warning=ExperimentalWarning --experimental-strip-types tools/arena/danlm.ts --danlm ~/DanLM --python ~/danlm-venv/bin/python --deals 100 --out danlm.jsonl
```

```bash
node --disable-warning=ExperimentalWarning --experimental-strip-types tools/arena/dup-report.ts danlm.jsonl
```

`--agent` 可換成 `danzero_v1t` 或 `danzero_v0`（DanLM 附帶的 DanZero 重現版）。不接 DanLM 時可以用 `--mock` 測試整條流程。

## 收集 DanLM 自我對戰資料（訓練用）

四個座位都由 DanLM 出牌，本遊戲引擎當裁判，打完整場（2 打到 A，進貢與還貢用本遊戲的啟發式）。每副牌一行，記錄發牌、進貢、每一手出牌（本遊戲的宣告），以及 DanLM 對前 64 個候選的評分（Q 值）。格式寫在 `collect.ts` 開頭。

```bash
tools/arena/collect-overnight.sh 4 9
```

四個 worker 跑 9 小時，資料寫到 `~/danlm-data/*.jsonl.gz`，進度在 `~/danlm-data/logs/`。每 200 副牌寫一個壓縮分檔，中斷最多損失一個分檔。

```bash
node --disable-warning=ExperimentalWarning --experimental-strip-types tools/arena/replay.ts ~/danlm-data/*.jsonl.gz
```

`replay.ts` 用本遊戲引擎重建每一副並核對結果，失敗數應為 0。
