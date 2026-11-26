# 訓練管線：模仿 DanLM 的出牌評分模型

把 `tools/arena/collect.ts` 收集的 DanLM 自我對戰資料，訓練成一個評分模型 `Q(局面, 出牌)`。模型以純 TypeScript 推論，Node 和瀏覽器都能跑，也能直接放進 arena 評測。

```
collect.ts（Mac，DanLM 四家自我對戰）
  → *.jsonl.gz（每副一行：發牌、進貢、每手出牌、DanLM 對前 64 個候選的 Q 值）
  → export.ts（本遊戲引擎重播每一副，算特徵，寫成訓練陣列）
  → train.py（PyTorch，Mac 上用 MPS）
  → model.json + model.bin
  → model.ts（TypeScript 推論）→ arena 的 --model
```

## 特徵（`features.ts`，第 2 版）

- 局面 446 維，只用這個座位看得到的資訊。
  - 第 1 版的 327 維：
    - 自己的手牌（各點數張數、逢人配張數、各花色分布）
    - 各家這副已出的牌、尚未出現的牌、進貢後仍在別家手上的公開牌
    - 各家剩餘張數與名次、級牌與兩隊級數
    - 桌面牌型與持有者、後面還有誰能接
  - 第 2 版加上出牌紀錄（119 維，`playHistory()`）：
    - 這一圈：其他三家各自最近的動作（還沒動作、過牌，或出了什麼牌型、點數、張數），以及這圈已出幾手、第幾圈
    - 上一圈：誰收下、領出的牌型
    - 整副累計：各家出牌、過牌、領出、炸彈次數，其他三家各牌型的領出次數
    - 推測暗牌：其他三家在對手持圈時，過掉的最大單張、對子、三張、三帶對。能壓卻不壓，通常表示手上沒有更大的同牌型
- 出牌 49 維：牌型、點數、張數、用了哪些牌與幾張逢人配、出完後剩下的牌、是否出完、是否炸彈、是否壓隊友。
- 每個特徵都是 0–255 的整數，用一個位元組儲存；縮放係數跟著模型一起輸出。
- `tests/train-features.test.mjs` 確認：
  - 把別家手牌互換後特徵完全不變，也就是模型看不到藏著的牌
  - `playHistory()` 對這一圈、上一圈與過牌推測的讀法正確
- 改動特徵時要把 `FEATURE_VERSION` 加一。版本不符的模型會拒絕載入，所以舊模型要用對應版本的程式評測，新特徵要重新 export 與訓練。

## 執行

在 Mac 上用 `~/danlm-venv`（已裝 torch）：

```bash
node --disable-warning=ExperimentalWarning --experimental-strip-types tools/train/export.ts --out ~/danlm-train ~/danlm-data/*.jsonl.gz
```

```bash
~/danlm-venv/bin/python tools/train/train.py --data ~/danlm-train --out ~/danlm-model --epochs 10
```

```bash
node --disable-warning=ExperimentalWarning --experimental-strip-types tools/arena/danlm.ts --danlm ~/DanLM --python ~/danlm-venv/bin/python --deals 100 --model ~/danlm-model/model.json --out model-vs-danlm.jsonl
```

- 多次收集的資料可以分別 export，再用 `train.py --data a,b,c` 一起訓練，不必合併檔案。`--val a,b` 指定只用哪些資料的驗證集評分，例如加了 DAgger 資料的模型，仍可用純 DanLM 的驗證集來比較。
- `export.ts` 依遊戲 id 分出約 5% 當驗證集；DanLM 的候選對應不到本遊戲宣告時記為 `unmapped`。
- 候選依 DanLM 的牌型與點數對應到本遊戲的宣告。橋接第 3 版以前收集的資料，若某手牌用兩張逢人配、同一個點數可以宣告兩種牌型（見 arena README），兩邊引擎可能從那手起看到不同的桌面，整副略過（`oldBridgeSkipped`）。這種分歧也會讓同一圈後面的候選對應不到，舊資料裡大部分的 `unmapped` 可能就是這樣來的。
- `train.py` 的損失是兩項相加：對 DanLM 各候選 Q 值的均方誤差，加上朝 DanLM 實際選擇的交叉熵（權重 `--ce-weight`）。驗證時看 `agree`，即模型最高分的出牌等於 DanLM 選擇的比例。`--limit N` 只用前 N 個決策，適合快速試跑。
- arena 的 `run.ts`、`duplicate.ts`、`danlm.ts` 都接受 `--model`：我方座位改由模型出牌，進貢仍用遊戲的啟發式。

## DAgger：讓模型自己下，DanLM 標註

純模仿只學到 DanLM 自己會走到的局面。模型一旦走偏，進到 DanLM 沒遇過的局面，錯誤就會累積。第 2 版特徵讓驗證一致率從 69.3% 升到 71.1%，對打成績卻沒有變，就是這個現象。

`collect.ts --model` 每場讓一隊（每場輪換）照模型出牌，DanLM 仍然為每一手評分。模型座位的紀錄多一個 `teacher` 欄位，記下 DanLM 自己會出的牌；`export.ts` 遇到 `teacher` 時，以它作為訓練目標。

```bash
tools/arena/collect-overnight.sh 3 9 ~/danlm-model-v2/model.json ~/danlm-dagger
```

每行 log 的 `model = DanLM in N%` 是模型在自己走到的局面上與 DanLM 一致的比例，可用來觀察每一輪 DAgger 的進展。

## 放進遊戲（大師難度）

遊戲裡的「大師」難度用 `src/master.ts`：模型選牌，理由由規則判斷事後補上（和規則判斷選同一手時沿用它的理由）。模型在專用的 Web Worker（`src/master-worker.ts`）裡載入一次，之後每一手只需幾毫秒。載入失敗時改用進階牌手。

```bash
node --disable-warning=ExperimentalWarning --experimental-strip-types tools/train/pack.ts ~/danlm-model-v3b/model.json public/model/master
```

- 產生 `public/model/master.json` 與 `master.bin`（float16，約 1.3 MB）。
- 只有 `public/model/master.json` 存在時，建置出來的遊戲才會在設定裡提供「大師」。沒有模型的建置看不到這個選項；先前存過「大師」的設定會改用進階。
- 這個模型以 DanLM 的資料訓練，所以 `public/model/NOTICE.md` 和 `LICENSE-DanLM.txt`（DanLM 授權全文）要跟著一起上線。

## 裝置測速（`bench.html`）

`bench.html` 不在遊戲裡連結，直接開網址使用。它讓大師在四個座位打 6 副固定的牌，經由跟遊戲相同的 worker，量出模型載入時間與每一手的時間，並和 Node 算出的結果逐手比對。

- 用的是同尺寸的隨機權重（`public/model/bench.*`），所以真模型上線前也能先測手機速度。
- 重新產生測試模型和比對答案：

```bash
node --disable-warning=ExperimentalWarning --experimental-strip-types tools/train/random-model.ts 512,512,256 /tmp/bench32
```

```bash
node --disable-warning=ExperimentalWarning --experimental-strip-types tools/train/pack.ts /tmp/bench32.json public/model/bench
```

```bash
node --disable-warning=ExperimentalWarning --experimental-strip-types tools/train/bench-fixture.ts public/model/bench
```

- 改動特徵、模型或這三個檔案後，都要重新產生 `bench-expected.json`，否則頁面會顯示 MISMATCH。
