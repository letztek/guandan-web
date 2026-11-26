# v4v: v4 move scorer + value head

The v4 move scorer (`models/v4`) is frozen and unchanged, so move choice is bit-for-bit the same as v4. Only a small value head is trained on top of v4's first state layer, `relu(state_in(state))`: 512 → 256 → 1. It answers "from this seat, how many levels will our side win or lose in this hand". The answer comes from how each hand really ended: +levels gained if our side went out first, otherwise minus the levels the other side gained.

- Trained with `tools/train/train_value.py` (commit c970cbb) on MPS, 6 epochs, from `danlm-model-v4/model.pt`.
- Training data: pure DanLM self-play only, re-exported with `outcome.f32` (commit c970cbb). `danlm-train-value-v2` (train 834,507 decisions, same as the earlier v2 export) + `danlm-train-value-a2` (train 838,396, same as the earlier a2 export). In all, 1,672,903 train / 93,945 val positions, outcome mean 0.055. No DAgger data: there one side is the model, so the outcome is not DanLM against DanLM.
- Validation: best val mse 3.4080 against 5.0915 for guessing the mean (R2 0.331), right side 74.0%, correlation 0.577 (epoch 1).

## value-check, first run (commit c970cbb)

```text
1443 held-out hands, 120315 positions
1. one scale: consecutive opposite-team decisions (112864): correlation of V with -V(next) 0.780, mean V + V(next) 0.087, mean |V| 1.163
   same moment, mover vs next opponent's own view: correlation with -V 0.766, mean sum 0.224
2. against the real outcome (mover's team):
   81–108 cards left    26513 positions: mse 4.457 vs guessing the mean 5.252 (R2 0.151), picks the winning side 64.2%, correlation 0.392
   51–80 cards left     37906 positions: mse 3.839 vs guessing the mean 5.232 (R2 0.266), picks the winning side 70.4%, correlation 0.520
   26–50 cards left     32106 positions: mse 2.927 vs guessing the mean 5.174 (R2 0.434), picks the winning side 78.3%, correlation 0.660
   ≤25 cards left       23790 positions: mse 1.698 vs guessing the mean 4.478 (R2 0.621), picks the winning side 89.8%, correlation 0.798
   all                 120315 positions: mse 3.309 vs guessing the mean 5.082 (R2 0.349), picks the winning side 75.0%, correlation 0.593
```

Result against the criteria: correlation of V with -V(next) 0.780 < 0.8 failed. The other four passed: mean V + V(next) 0.087 (within ±0.15), all R2 0.349 (≥ 0.10), ≤25 cards left R2 0.621 (≥ 0.30), all picks the winning side 75.0% (≥ 60%).

## value-check, second run (commit 4f02823, adds the same-team reference)

```text
1443 held-out hands, 120315 positions
1. one scale: consecutive opposite-team decisions (112864): correlation of V with -V(next) 0.780, mean V + V(next) 0.087, mean |V| 1.163
   reference, consecutive same-team decisions (6008): correlation of V with V(next) 0.695, mean V - V(next) 0.029
   same moment, mover vs next opponent's own view: correlation with -V 0.766, mean sum 0.224
2. against the real outcome (mover's team):
   81–108 cards left    26513 positions: mse 4.457 vs guessing the mean 5.252 (R2 0.151), picks the winning side 64.2%, correlation 0.392
   51–80 cards left     37906 positions: mse 3.839 vs guessing the mean 5.232 (R2 0.266), picks the winning side 70.4%, correlation 0.520
   26–50 cards left     32106 positions: mse 2.927 vs guessing the mean 5.174 (R2 0.434), picks the winning side 78.3%, correlation 0.660
   ≤25 cards left       23790 positions: mse 1.698 vs guessing the mean 4.478 (R2 0.621), picks the winning side 89.8%, correlation 0.798
   all                 120315 positions: mse 3.309 vs guessing the mean 5.082 (R2 0.349), picks the winning side 75.0%, correlation 0.593
```

Revised "one scale" rule: A = opposite-team correlation of V with -V(next) = 0.780. B = same-team reference correlation of V with V(next) = 0.695. B - A = -0.085 < 0.05, so the rule passed. The other four criteria are unchanged from the first run and passed, so the value head passed overall.

Files: `model.json` + `model.bin` (float32 weights with the value head, `valueHidden` and `value.N.*` tensors, read by `tools/train/model.ts`), `value.pt` (PyTorch checkpoint of the value head; it names the frozen scorer checkpoint it was trained on).
