# Shared World Prototype 0.1 — GitHub Pages Edition

同じ ROOM CODE を入力した最大4人が、ブラウザ上の同じ3D空間に参加し、球体アバターの位置を共有する最小プロトタイプです。

## 構成

```text
shared-world-prototype-0.1/
├─ .github/
│  └─ workflows/
│     └─ deploy-pages.yml       # GitHub Pages 自動公開
├─ client/
│  ├─ index.html
│  └─ src/
│     ├─ main.ts                # PlayCanvas + Colyseus Client
│     └─ style.css
├─ server/
│  ├─ .env.example
│  └─ src/
│     ├─ main.ts                # Colyseus Server
│     ├─ SharedWorldRoom.ts
│     └─ state.ts
├─ .env.example
├─ .gitignore
├─ package.json
├─ render.yaml                  # Renderにサーバーを置く場合の雛形
├─ tsconfig.json
└─ vite.config.ts
```

## 重要：GitHub Pagesだけではマルチプレイヤーサーバーは動きません

GitHub Pagesは静的Webサイトの配信です。このリポジトリでは役割を分離します。

```text
GitHub Pages             外部Node.jsホスト
PlayCanvas Client   ⇄    Colyseus Server
HTTPS                    HTTPS / WSS
```

`client/` は GitHub Pages に公開できます。`server/` は Render、Railway、Fly.io、自前VPSなど、Node.js + WebSocketを常時実行できる場所に配置します。

## 1. まずローカルで確認

Node.js 22以降を用意して、リポジトリ直下で:

```bash
npm install
```

ターミナル1:

```bash
npm run server
```

ターミナル2:

```bash
npm run dev
```

Viteが表示したURL（通常 http://localhost:5173）を2タブで開きます。同じROOM CODEを入力し、片方をWASDで動かして同期を確認します。

## 2. GitHubへ置く

GitHubで新しいRepositoryを作り、このフォルダの**中身すべて**をRepository直下へ置きます。

推奨Repository名:

```text
shared-world
```

## 3. GitHub Pagesを有効化

GitHub Repositoryで:

```text
Settings
→ Pages
→ Build and deployment
→ Source
→ GitHub Actions
```

を選びます。

`.github/workflows/deploy-pages.yml` が `main` へのpush時に依存ライブラリをインストールし、Viteをビルドして `dist/` をGitHub Pagesへ公開します。

## 4. Colyseus Serverを外部公開

このリポジトリにはRender用の `render.yaml` も同梱しています。別サービスを使っても構いません。

公開サーバーURLの例:

```text
https://shared-world-colyseus.example.com
```

GitHub PagesはHTTPSなので、公開サーバーもHTTPS/WSSに対応している必要があります。`http://` のサーバーへは本番GitHub Pagesから安全に接続できません。

## 5. GitHub Pagesからサーバーへ接続

Repositoryで:

```text
Settings
→ Secrets and variables
→ Actions
→ Variables
→ New repository variable
```

を開いて次を追加します。

```text
Name:  COLYSEUS_SERVER_URL
Value: https://あなたのColyseusサーバーURL
```

その後 `Actions` → `Deploy client to GitHub Pages` → `Run workflow`、またはmainへpushすると、サーバーURLを含めて再ビルドされます。

## 6. 公開URL

Repository名を `shared-world` とした場合は概ね:

```text
https://YOUR-GITHUB-NAME.github.io/shared-world/
```

になります。

## Prototype 0.1 の機能

- NAME / ROOM CODE入力
- ROOM CODEごとのRoom分離
- 最大4人
- WASD / 矢印キー移動
- PlayCanvasによる3D表示
- Colyseusによる状態同期
- 他プレイヤーの簡易補間
- サーバー側のワールド境界 / 大きなテレポート簡易検査
- `/health` ヘルスチェック

## 次のPrototype 0.2候補

- 名前ラベル
- マウス視点操作
- スマートフォン用ジョイスティック
- 切断・再接続UI
- Colyseus 0.18 netcodeのprediction / reconciliation導入検討
- 3DスキャンGLBの読み込み

## ライブラリ

0.1では以下を固定しています。

- PlayCanvas Engine 2.21.4
- Colyseus 0.18.5
- @colyseus/sdk 0.18.2
- @colyseus/schema 5.0.8
- Vite 8.3.0
- TypeScript 7.0.2

今後の更新時は、公式ドキュメントとstable版を確認してから更新してください。特にColyseus 0.18ではSchema 5系と新しいnetcode APIが導入されています。

## package-lock.jsonについて

この配布版には `package-lock.json` を含めていません。生成環境でnpmレジストリ接続がタイムアウトしたためです。その代わり `package.json` 内の主要パッケージは完全なバージョン番号で固定し、GitHub Actionsでは `npm install` を使用します。ローカルで最初に `npm install` が成功すると `package-lock.json` が生成されます。そのファイルもGitへcommitした後は、workflowを `npm ci` に切り替えるとさらに再現性が上がります。
