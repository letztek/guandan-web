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

## 特徵（`features.ts`，第 1 版）

- 局面 327 維，只用這個座位看得到的資訊：
  - 自己的手牌（各點數張數、逢人配張數、各花色分布）
  - 各家這副已出的牌、尚未出現的牌、進貢後仍在別家手上的公開牌
  - 各家剩餘張數與名次、級牌與兩隊級數
  - 桌面牌型與持有者、後面還有誰能接
- 出牌 49 維：牌型、點數、張數、用了哪些牌與幾張逢人配、出完後剩下的牌、是否出完、是否炸彈、是否壓隊友。
- 每個特徵都是 0–255 的整數，用一個位元組儲存；縮放係數跟著模型一起輸出。
- `tests/train-features.test.mjs` 確認把別家手牌互換後特徵完全不變，也就是模型看不到藏著的牌。
- 改動特徵時要把 `FEATURE_VERSION` 加一；版本不符的模型會拒絕載入。

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

- `export.ts` 依遊戲 id 分出約 5% 當驗證集；DanLM 的候選對應不到本遊戲宣告時記為 `unmapped`。
- `train.py` 的損失是兩項相加：對 DanLM 各候選 Q 值的均方誤差，加上朝 DanLM 實際選擇的交叉熵（權重 `--ce-weight`）。驗證時看 `agree`，即模型最高分的出牌等於 DanLM 選擇的比例。`--limit N` 只用前 N 個決策，適合快速試跑。
- arena 的 `run.ts`、`duplicate.ts`、`danlm.ts` 都接受 `--model`：我方座位改由模型出牌，進貢仍用遊戲的啟發式。
