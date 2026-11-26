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

## 實驗：模型參與搜尋（`src/master-search.ts`，未上線）

做法：v4 挑出前 4 個候選；以 `samplePublicHands` 依公開資訊猜其他三家的手牌，猜 12 種；每個候選在同一批猜測上出牌，模型替四家下到本圈結束，再用模型分數估計；只有挑戰者以配對 z 值明顯勝出，才換掉模型的首選。用 arena 的 `--search candidates,horizon,worlds[,z[,maxCards]]` 評測。

對 njupt 的複式結果（與純 v4 同牌配對；純 v4 為 +3.38）：

| 版本 | 改動的決策 | 平均每手 | 與 v4 配對 |
|---|---|---|---|
| 終點取最後一手（多為對手過牌）的 Q 取負號，z 1.5（100 副） | 47% | 276 ms | −3.29 ± 0.63 |
| 終點改取我方下一次決策的 Q，z 3（50 副） | 16% | 576 ms | −1.10 ± 0.72 |
| 同上，只在剩 40 張以內的殘局搜尋，z 1.5（50 副） | 31% | 95 ms | −0.22 ± 0.53 |
| 終點改用局勢分（v4v，見下節），z 1.5（100 副） | 33% | 341 ms | −2.09 ± 0.71 |

結論：模型的 Q 是模仿 DanLM 對同一局面各候選的評分，適合在同一局面裡比較候選，但不是可以跨局面、跨座位比較的局面價值。第一版用對手的 Q 取負號，等於高估我方炸彈的收益，最常見的改動是「過牌 → 炸彈」。加上猜暗牌時牌是平均分配的，看不出剛炸過的對手多半牌強，搜尋會放大模型的誤差，而不是修正它。

若要再試，需要先有一個跨座位一致的局面價值：例如用已收集資料中每副的實際結局，訓練一個 V(局面) 輸出，作為推演終點的評估。

這次實驗的副產品：`src/move-scorer.ts` 每列權重一次算 4 個候選，推論快 1.8 倍，輸出逐位元相同。

## 局勢分（value head）

讓模型除了「這一手每種出法各幾分」，再回答「從這個座位看，我方這副最後會贏或輸幾級」。

- 答案取自每副的真實結局：`export.ts` 為每個決策寫出 `outcome.f32`，從出牌那一隊的角度算，頭游在我方就是 +升級數，否則是 −對方升級數。四個座位用同一種算法，所以分數是同一把尺。
- 只用 DanLM 對 DanLM 的資料。DAgger 資料裡有一隊是模型，結局不代表雙方都打到 DanLM 的水準。
- `train_value.py` 凍結既有的出牌模型，只在它第一層的局面特徵上訓練一個小頭（512 → 256 → 1）。出牌選擇與原模型逐位元相同；輸出的 `model.json` 多了 `valueHidden` 與 `value.N.*` 張量。
- `value-check.ts` 檢查兩件事：同一把尺（相鄰兩個對手決策的分數應一正一負），以及比亂猜準（跟真實結局比，對照一律猜平均）。
- 搜尋可改用局勢分評估推演終點：`src/master-search.ts` 的 `leaf: 'value'`，arena 的 `--leaf value`。

```bash
node --disable-warning=ExperimentalWarning --experimental-strip-types tools/train/export.ts --out ~/danlm-train-value-a2 ~/danlm-data/*-20261124T*.jsonl.gz
```

```bash
~/danlm-venv/bin/python tools/train/train_value.py --model ~/danlm-model-v4/model.pt --data ~/danlm-train-value-v2,~/danlm-train-value-a2 --out ~/danlm-model-v4v
```

```bash
node --disable-warning=ExperimentalWarning --experimental-strip-types tools/train/value-check.ts ~/danlm-model-v4v/model.json ~/danlm-data/*-2026112[34]T*.jsonl.gz
```

### 局勢分搜尋的結果（v4v）

局勢分本身通過檢查：
- 預測結局：整體 R² 0.349，殘局（≤25 張）R² 0.621，猜中贏方 75%（殘局 90%）。
- 同一把尺：相鄰對手決策的相關 0.780，高於同隊對照值 0.695；平均偏差 0.087。

但換進搜尋後，對 njupt 同 100 副仍明顯變弱（與 v4 配對 −2.09 ± 0.71）。比用 Q 值當終點（−3.29）好，但仍改動了三分之一的決策，而且多半改壞。依「明顯勝過 v4 才採用」的規則，大師維持 v4。

可能的原因：
- 只往後推一圈，局勢分的雜訊（單點誤差約 ±1.8 級）遠大於候選之間真正的差距。
- 12 種猜測不足以平均掉這些雜訊，挑戰者常因雜訊而「明顯勝出」。
- 猜暗牌時牌平均分配的偏差仍在。
