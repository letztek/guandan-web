# 《水晶亭的休戰日》Q 版全副牌

`sheets/` 包含十三張透明 RGBA 原圖，每個點數各有一位固定角色。每張原圖含四種動作，排列為左上黑桃、右上紅心、左下梅花、右下方塊。黑桃偏靛藍、紅心偏莓紅、梅花偏翠綠、方塊偏琥珀橘。保留的兩位道化師另見 `jokers.png`，大王在左、小王在右。

| 點數 | 主角 | 原稿 |
|---|---|---|
| A | 騎士（騎馬、持槍） | `sheets/A.png` |
| 2 | 瑪莉亞（Maria） | `sheets/2.png` |
| 3 | 黑龍使 | `sheets/3.png` |
| 4 | 半魔（Dhampir） | `sheets/4.png` |
| 5 | High Waitress | `sheets/5.png` |
| 6 | 科莉黛爾（Corriedale） | `sheets/6.png` |
| 7 | 花小町 | `sheets/7.png` |
| 8 | Albus | `sheets/8.png` |
| 9 | 樋熊（Higuma） | `sheets/9.png` |
| 10 | Athena | `sheets/10.png` |
| J | 死靈 | `sheets/J.png` |
| Q | 巨人（雙肩砲） | `sheets/Q.png` |
| K | 奇美拉（三頭） | `sheets/K.png` |
| 大王／小王 | 男裝モリオーネ／女裝フナンボロ | `jokers.png` |

數字牌的全身 Q 版造型參照專案原有角色與四視圖。召喚獸依既有 FEZ 召喚設定與本專案牌樣繪製。大王參照 `モリオーネ/58モリオーネ__63826c4e13da.jpg`，小王參照 `フナンボロ/1__8f75ce613c00.png`，兩者均為營運方公布的道化師系列。[Gamepot 發行稿](https://www.4gamer.net/games/017/G001785/20120423044/)

## 數字牌的武器參照

本套牌按角色造型挑選 FEZ 武器作為 Q 版道具。相關名稱與圖錄條目如下。

| 點數 | 角色 | 武器 | 圖錄 |
|---|---|---|---|
| 2 | 瑪莉亞 | ステンドハート | [裝備圖錄](https://fez.publog.jp/archives/35146900.html) |
| 3 | 黑龍使 | 天つらぬく竜ノ大剣 | [裝備圖錄](https://fez.publog.jp/archives/12821808.html) |
| 4 | 半魔 | ヴァンパイア・バット | [裝備圖錄](https://fez.publog.jp/archives/77777444.html) |
| 5 | High Waitress | キャンディーベイビー | [裝備圖錄](https://fez.publog.jp/archives/15690501.html) |
| 6 | 科莉黛爾 | 登る羊の蔓木杖 | [裝備圖錄](https://fez.publog.jp/archives/22030890.html) |
| 7 | 花小町 | 飾扇・桜流し | [裝備圖錄](https://fez.publog.jp/archives/70830486.html) |
| 8 | Albus | 八卦白銀弓 | [裝備圖錄](https://fez.publog.jp/archives/74443801.html) |
| 9 | 樋熊 | 堅牢なる獅子の爪 | [裝備圖錄](https://fez.publog.jp/archives/52641412.html) |
| 10 | Athena | アムブロシアセット | [裝備圖錄](https://fez.publog.jp/archives/78140933.html) |

## 替換或編修原圖

修改對應的 `sheets/<點數>.png` 並維持透明背景與四格順序。製版會沿中央的透明空隙裁切。長槍、尾巴等橫跨面板中心時，請在相鄰人物之間保留透明分隔。需要指定四個裁切範圍時，在該點數的 `ranks.json` 項目加入 `boxes`。每個範圍使用原圖像素座標 `[left, top, right, bottom]`，依黑桃、紅心、梅花、方塊排列。

## 從原稿重建

在專案根目錄執行以下指令。Python 須具備 Pillow 和 NumPy。

```sh
python -m pip install pillow numpy
python artwork/chibi/build_deck.py --proof-dir artwork/chibi/proofs
```

預設寫入遊戲讀取的 `public/fez-cards/deck.webp`。圖集為 9 欄 × 6 列，每格 294 × 406，整幅 2646 × 2436 像素。每個花色依 A 到 K 排列，圖集最後兩格為小王、大王。選用 `--proof-dir` 會輸出九張牌樣、四張 6、四張 7 與全副牌總覽。單純輸出圖集可省略此選項。也可用 `--source-dir` 指定另一套原稿，用 `--output` 指定另一個輸出路徑。

`build_deck.py` 會從系統字庫尋找 Georgia、Segoe UI Symbol、細明體及微軟正黑體，亦支援 DejaVu、Noto CJK 等替代字型。可用 `--font-dir` 指向已安裝字型檔的目錄。完成的圖集已包含全部字形。
