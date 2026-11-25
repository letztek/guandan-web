# v3b move scorer

Trained with `tools/train/train.py` (commit b9d8327), 10 epochs on MPS, hidden 512,512,256, 648,193 parameters.

- Training data: `danlm-train-v2` + `danlm-train-v2-a2` (DanLM self-play, two nights) + `danlm-train-v2-dagger` (DAgger round 1: v2 plays, DanLM labels), 2,712,264 decisions.
- Validation (pure DanLM, v2 + a2 val splits, 93,945 decisions): best val agreement 0.763 (val mse 0.1730, ce 0.651).
- Duplicate eval, 100 deals: vs DanLM -0.49 ± 0.50, vs njupt-guandan-ai +2.82 ± 0.49 levels per deal.

Files: `model.json` + `model.bin` (float32 weights, read by `tools/train/model.ts`), `model.pt` (PyTorch checkpoint).
