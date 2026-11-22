# 牌桌角色表情

三個座位 GLB 都帶有 CharaKuru 1.1.1 的 26 個原始臉部變形鍵。花小町採 C02、High Waitress 採 2026-11-20 的 VRM v01、Athena 採 C07。每個 GLB 的 `asset.extras.source` 與 `sourceSHA256` 記錄對應的 Blender 檔名和版本雜湊。

High Waitress 的座位模型取自 `high-waitress-h-vrmexpr-20261120-v01.blend`（SHA-256 `99947bcef48df4a38446b5ace3f7df1e29b2bbf56a832e5cec0d2682a1964c3c`）。手與脖子沿用正本的膚色貼圖和臉部 MToon 暗部設定。大腿與絲襪交界沿用 BT50 成對修整的貼圖。

| 功能 | 變形鍵 |
| --- | --- |
| 眨眼 | `EA_blink`、`EA_blink_L`、`EA_blink_R` |
| 笑著閉眼 | `EA_blink_smile`、`EA_blink_smile_L`、`EA_blink_smile_R` |
| 眼型、嘴型、眉型 | 五種狀態 `happy`、`relaxed`、`surprised`、`angry`、`sad`，格式為 `EA_<狀態>_eye`、`EA_<狀態>_mouth`、`EA_brow_<狀態>` |
| 母音嘴型 | `EA_aa`、`EA_ih`、`EA_ou`、`EA_ee`、`EA_oh` |

中性臉的所有權重都是 0。舊版 `gentleSmile` 留在第 0 槽，其配方為 happy_mouth × 1、happy_eye × 0.62、brow_happy × 0.48。直接控制原始五官時將該複合鍵設為 0。閉眼時減弱其他眼型可以保留完整的眨眼幅度。

從專案根目錄，使用 Blender 5.2.3 與對應正本重建單一座位。最後的角色代號可填 `hanakomachi`、`high-waitress` 或 `athena`。

```sh
blender --background --factory-startup --disable-autoexec "/path/to/hanakomachi-h-expressions-20261102-c02.blend" --python-exit-code 1 --python artwork/characters/build_seat_expressions.py -- hanakomachi
```

腳本會驗證來源 SHA、26 個鍵及所有材質分組的頂點順序，將頂點位移以稀疏存取器寫入對應的 `public/character/*-seat.glb`。重新製作座位基礎模型後，對該座位再執行一次即可加入表情。

## 選角動作

三人的待機與下表中的 A、B 候選直接為現有 FEZ 骨架編排，定義在 `src/partner-performance.ts`。預覽時可傳入 `A` 或 `B` 比較同一角色的兩套原創候選。

試玩站的選角設定在 `src/partner-roster.ts`。花小町原地揮袖招手，High Waitress 牽起裙邊屈膝行禮。Athena 採用試映 C「伸手邀請」搭配 B 的閉嘴微笑，側踏後展開左手，掌心向上，停留後收回。3.55 秒的邀請動作在 `src/athena-invitation.ts`，選角表情在 `src/greeting-face.ts`。

先前試映的飛吻取自 Adobe Mixamo 的 Y Bot，以 FBX Binary、Without Skin、30 fps 匯出。原始動作檔的 SHA-256 為 `1aa877c52dbfa01e34f5764927cdf84ad9dff04f7cb4b4676ddd96a9600d20b5`。[Mixamo 動作目錄](https://www.mixamo.com/#/?page=1&query=Blowing%20A%20Kiss&type=Motion%2CMotionPack)

| 角色 | A | B |
| --- | --- | --- |
| 花小町 | 屈肘舉掌，揮動長袖 | 兩手收在胸前，側身點頭 |
| High Waitress | 向側後方收腳，屈膝行禮 | 一手扶腰，另一手在額邊敬禮 |
| Athena | 以左腳為軸轉一圈，回頭望向觀眾 | 半轉身，回正後把手輕放在胸前 |

待機時，花小町偶爾歪頭看向旁邊，High Waitress 低頭收手靠近圍裙，Athena 微抬下巴側望。袖口、裙襬與髮束由 `src/partner-cloth.ts` 接續骨架運動。花小町抬手時兩袖分別受世界座標的向下拉力牽引，手腕停下以後布料繼續擺動並逐漸收住。
