# Okechika Helper

![Okechika Helper Screenshot](docs/assets/screen_1280x800.png)

桶地下文字の解読作業を支援するためのブラウザ拡張です。

## 主な機能

- 対象サイト上の桶地下文字にルビを表示
- テキスト選択から解読テーブルを更新
- 解読テーブルの CSV インポート / エクスポート
- 対象ルート URL の管理（追加・削除・初期化）

詳細仕様は [docs/SPEC.md](docs/SPEC.md) を参照してください。

## 技術スタック

- WXT
- React
- TypeScript

## セットアップ

```bash
npm install
```

## 開発コマンド

```bash
# 開発起動
npm run dev

# 本番ビルド
npm run build

# 配布用 zip 生成
npm run zip

# 型チェック
npm run typecheck

# lint
npm run lint
```

## ローカルで拡張を確認する

1. `npm run build` を実行
2. Chrome の `chrome://extensions` を開く
3. 「デベロッパーモード」を ON
4. 「パッケージ化されていない拡張機能を読み込む」で `.output/chrome-mv3` を選択

## 権利について

- 桶地下は第四境界のコンテンツです
- 本拡張機能はファンメイド作品であり、第四境界とは関係がなく、権利を侵害する意図はありません

関連リンク:

- 第四境界: https://www.daiyonkyokai.net/
- 桶地下 調査の手引き: https://www.daiyonkyokai.net/bps/guide/78fghuvtgy7/
