# v4 move scorer

Trained with `tools/train/train.py` (commit be48086), 10 epochs on MPS, hidden 512,512,256, 648,193 parameters.

- Training data: `danlm-train-v2` + `danlm-train-v2-a2` (DanLM self-play, two nights) + `danlm-train-v2-dagger` (DAgger round 1: v2 plays, DanLM labels) + `danlm-train-v2-dagger2` (DAgger round 2: v3b plays, DanLM labels), 3,767,650 decisions.
- Validation (pure DanLM, v2 + a2 val splits, 93,945 decisions): best val agreement 0.775 (val mse 0.1587, ce 0.617).
- Duplicate eval, 100 deals: vs DanLM -0.35 ± 0.51, vs njupt-guandan-ai +3.38 ± 0.40 levels per deal.
- Paired with earlier models on the same 100 deals (95% CI):
  - vs DanLM: v4 - v3b +0.14 ± 0.62, v4 - v2 +1.35 ± 0.58.
  - vs njupt-guandan-ai: v4 - v3b +0.56 ± 0.51, v4 - v2 +1.60 ± 0.64.

Files: `model.json` + `model.bin` (float32 weights, read by `tools/train/model.ts`), `model.pt` (PyTorch checkpoint).
