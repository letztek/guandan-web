# Move model files

- `master.json` / `master.bin` — the model behind the 大師 (Master) difficulty (version v4, float16). It was trained on self-play records of DanLM (https://github.com/dashidhy/DanLM), Copyright 2026 DanLM Authors, so it is a Derivative Work under DanLM's licence: the Apache License 2.0 with an additional non-commercial restriction (Section 10). The full licence is in `LICENSE-DanLM.txt`. This game is non-commercial; any commercial use of the model needs prior written permission from DanLM's authors.
- `bench.json` / `bench.bin` — random weights of the same size, used only by `bench.html` to measure speed. Not derived from DanLM.

# 出牌模型檔案

- `master.json`／`master.bin`：「大師」難度使用的模型（v4 版，float16），以 DanLM（https://github.com/dashidhy/DanLM，Copyright 2026 DanLM Authors）的自我對戰紀錄訓練，屬於 DanLM 授權下的衍生作品。授權為 Apache License 2.0 加非商業使用限制（第 10 條），全文見 `LICENSE-DanLM.txt`。本遊戲不做商業用途；任何商業使用都須事先取得 DanLM 作者書面同意。
- `bench.json`／`bench.bin`：同尺寸的隨機權重，只供 `bench.html` 測速用，與 DanLM 無關。
