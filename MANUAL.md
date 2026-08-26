# Discord Space Get Bot 構築マニュアル

## 目次
1. [概要](#概要)
2. [アーキテクチャ](#アーキテクチャ)
3. [前提条件](#前提条件)
4. [構築手順](#構築手順)
5. [運用方法](#運用方法)
6. [トラブルシューティング](#トラブルシューティング)
7. [躓いた点・苦労した点](#躓いた点苦労した点)

---

## 概要

X(Twitter) のスペース配信ツイートを Discord チャンネルから検出し、別のチャンネルに転送する Bot です。

**主要機能:**
- スペースURL（`https://x.com/i/spaces/{id}`）を含むツイートを自動検出
- 転送元チャンネルから複数の転送先チャンネルへ転送
- 重複転送防止キャッシュ
- Webhook / Bot直接送信の両方に対応
- Twitterユーザー名からアイコンを取得して表示（unavatar.io使用）

---

## アーキテクチャ

```
Discord ソースチャンネル
        ↓
   Discord Bot（discord.js）
        ↓
   スペース検出ロジック
        ↓
   転送先チャンネル（Webhook or Bot直接）
```

**技術スタック:**
- **Runtime:** Node.js 18+
- **Framework:** discord.js v14
- **Hosting:** Northflank（Free Sandbox）
- **設定管理:** `config.json`（Git管理）
- **状態管理:** `state.json`（永続化ボリューム）

---

## 前提条件

- **GitHub アカウント**
- **Discord アカウント**（Botを作成するため）
- **Northflank アカウント**（クレジットカード登録必須、$5/月無料クレジット付き）
- **Node.js 18+**（ローカル開発の場合）

---

## 構築手順

### Step 1: Discord Developer Portal で Bot を作成

1. **https://discord.com/developers/applications** にアクセス
2. **「New Application」** をクリック
3. アプリケーション名を入力（例: `Discord Space Get`）
4. **「Bot」** をクリック
5. **「Add Bot」** をクリック
6. **Token** をコピー（後で使用）
7. **「Message Content Intent」** を **ON** にする
8. **サーバーに Bot を招待**:
   - OAuth2 > URL Generator
   - Scopes: `bot`
   - Bot Permissions: `Send Messages`, `Read Message History`, `View Channels`
   - 生成された URL を開いて招待

### Step 2: リポジトリの準備

1. **GitHub でリポジトリを作成**
   - Repository name: `Discord_Space_Get`
   - Public を選択
   - 「Create repository」をクリック

2. **ローカルにコードをプッシュ**
   ```bash
   git remote add origin https://github.com/<username>/Discord_Space_Get.git
   git push -u origin main
   ```

### Step 3: Northflank でデプロイ

1. **https://northflank.com/** にアクセス
2. **GitHub アカウントでログイン**
3. **「New Project」** > **「Deploy from GitHub repo」**
4. リポジトリ `Discord_Space_Get` を選択
5. 設定:
   - **Name:** `discord-space-get`
   - **Runtime:** `Dockerfile` を選択
   - **Plan:** `Free`（Developer Sandbox）
   - **Region:** 最も近いリージョン（例: `asia-northeast1`）
6. **「Deploy」** をクリック

### Step 4: 環境変数を設定

1. サービス詳細ページで **「Config」** タブをクリック
2. **「Environment Variables」** セクションを探す
3. **「Add Variable」** をクリック:
   - **Key:** `DISCORD_BOT_TOKEN`
   - **Value:** Discord Developer Portal でコピーしたトークン
4. **「Update and restart」** をクリック

### Step 5: config.json を設定

`config.json` を編集して、転送設定を追加:

```json
[
  {
    "sourceChannelId": "ソースチャンネルID",
    "destChannelId": "ディストチャンネルID",
    "destWebhookUrl": "",
    "enabled": true,
    "memo": "説明",
    "twitterUsername": "Twitterユーザー名"
  }
]
```

**フィールド説明:**
- `sourceChannelId`: 転送元チャンネルID（必須）
- `destChannelId`: 転送先チャンネルID（Bot直接送信時）
- `destWebhookUrl`: 転送先Webhook URL（Webhook送信時）
- `enabled`: `true` / `false`
- `memo`: メモ書き（任意）
- `twitterUsername`: Twitterユーザー名（アイコン取得用、任意）

**注意:** `destChannelId` と `destWebhookUrl` の両方が空の場合はスキップされます。

### Step 6: デプロイと動作確認

1. `config.json` をコミットしてプッシュ:
   ```bash
   git add config.json
   git commit -m "Update config"
   git push
   ```

2. Northflank で自動デプロイされる
3. ログで以下を確認:
   ```
   設定を X 行読み込みました。
   Botが起動しました。
   ```

4. ソースチャンネルに X スペースのツイートを投稿
5. ディストチャンネルに転送されるか確認

---

## 運用方法

### 設定を追加する場合

1. `config.json` に新しい行を追加
2. AI に依頼して自動生成してもらう
3. Git プッシュ
4. Northflank が自動デプロイ

### 設定を変更する場合

1. `config.json` を編集
2. Git プッシュ
3. 自動デプロイ

### ブックマークをリセットする場合

`state.json` を削除するか、Northflank のボリュームから削除。

---

## トラブルシューティング

### Bot が起動しない

**確認項目:**
1. 環境変数 `DISCORD_BOT_TOKEN` が設定されているか
2. Discord Developer Portal で **Message Content Intent** が ON になっているか
3. `config.json` の形式が正しいか

### メッセージが転送されない

**確認項目:**
1. `config.json` の `sourceChannelId` が正しいか
2. `destChannelId` または `destWebhookUrl` が設定されているか
3. Bot に必要な権限があるか:
   - ソースチャンネル: `View Channels`, `Read Message History`
   - ディストチャンネル: `Send Messages`
4. `enabled` が `true` になっているか

### 重複して転送される

**原因:** `state.json` が消えた、またはボリュームが削除された

**対処:**
- ボリュームを削除した場合は `state.json` がリセットされる
- 同じメッセージが再送信される可能性がある

### Dockerfile ビルドが失敗する

**原因:** キャッシュが古い

**対処:**
```bash
git commit --allow-empty -m "Trigger rebuild"
git push
```

---

## 躓いた点・苦労した点

### 1. Google Apps Script から Discord API へのアクセス拒否

**問題:**
- GAS の `UrlFetchApp` から Discord API のメッセージ取得エンドポイント（`/channels/{id}/messages`）へのアクセスが 403 エラー
- `/users/@me` は成功するのに、チャンネル系エンドポイントが拒否される

**原因:**
- Discord が GAS の IP レンジをボットトラフィックとして遮断
- `internal network error` (code: 40333) が返される

**解決策:**
- Node.js + discord.js に移行
- 外部ホスティング（Northflank）で運用

### 2. Northflank で Heroku Buildpack のキャッシュが古い問題

**問題:**
- Buildpack モードで `npm install` が実行されない
- キャッシュが強すぎて `package.json` の変更を検出しない

**試した解決策:**
- 空コミット `git commit --allow-empty` → 失敗
- `package.json` のバージョン変更 → 失敗
- `package.json` の説明文変更 → 失敗

**最終的な解決策:**
- Dockerfile を追加して明示的にビルド
- Northflank のビルドオプションを「Dockerfile」に切り替え

**ログの特徴:**
- `Reusing layer 'heroku/nodejs:dist'` が表示される
- `npm install` の実行記録が一切ない

### 3. Dockerfile 追加後の config.json パス問題

**問題:**
- Dockerfile モードに切り替えても `config.json` が見つからない
- エラー: `ENOENT: no such file or directory, open '/data/config.json'`

**原因:**
- `DATA_DIR` 環境変数が未設定で、`/data` にマウントされていない
- Docker コンテナ内の作業ディレクトリは `/app`

**解決策:**
```javascript
// 変更前
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

// 変更後
const CONFIG_PATH = path.join(__dirname, 'config.json');
```

### 4. Discord Bot のインテント設定漏れ

**問題:**
- `Error: Used disallowed intents` で Bot が起動しない

**原因:**
- Discord Developer Portal で **Message Content Intent** が OFF

**解決策:**
- Developer Portal > Bot > Privileged Gateway Intents で **Message Content Intent** を ON

### 5. 環境変数の設定で「Update only」と「Update and restart」の選択ミス

**問題:**
- 環境変数を追加しても反映されない

**解決策:**
- 環境変数の変更時は常に **「Update and restart」** を選択

### 6. GitHub CLI の権限不足

**問題:**
- `gh repo create` が `Resource not accessible by integration` で失敗

**原因:**
- GitHub CLI のトークンに `repo` スコープがない

**解決策:**
- Personal Access Token（PAT）を作成して使用
- `ghp_` で始まるトークンを使用

### 7. スプレッドシートから config.json への変換

**問題:**
- 元々 GAS 版ではスプレッドシートで管理していたが、Node.js 版ではファイル管理に変更

**解決策:**
- スプレッドシートのデータを AI に変換を依頼
- `config.json` に一括変換

### 8. アイコン表示の実装

**問題:**
- デフォルトでは送信元 Discord ユーザーのアイコンを表示
- Twitter ユーザーのアイコンを表示したい

**解決策:**
- `config.json` に `twitterUsername` フィールドを追加
- `unavatar.io/x/{username}` でアイコンURLを生成
- Webhook 送信時に `avatarURL` に設定

**メリット:**
- Twitter API 不要
- 実装が簡単
- ユーザー名だけでアイコン取得

---

## ファイル構成

```
Discord_Space_Get/
├── index.js           # Bot のメインコード
├── config.json        # 転送設定（Git管理）
├── state.json         # 処理状態キャッシュ（自動生成、Git管理外）
├── package.json       # Node.js プロジェクト設定
├── Dockerfile         # Docker ビルド設定
├── .gitignore         # Git 除外設定
└── README.md          # プロジェクト説明
```

## 環境変数

| 環境変数 | 説明 | 必須 |
|---------|------|------|
| `DISCORD_BOT_TOKEN` | Discord Bot トークン | ✅ |

## config.json の形式

```json
[
  {
    "sourceChannelId": "123456789012345678",
    "destChannelId": "987654321098765432",
    "destWebhookUrl": "",
    "enabled": true,
    "memo": "説明",
    "twitterUsername": "amemochinina"
  }
]
```

| フィールド | 説明 | 必須 |
|-----------|------|------|
| `sourceChannelId` | 転送元チャンネルID | ✅ |
| `destChannelId` | 転送先チャンネルID（Bot直接送信時） | ❌ |
| `destWebhookUrl` | 転送先Webhook URL（Webhook送信時） | ❌ |
| `enabled` | 有効/無効 | ❌（デフォルト: true） |
| `memo` | メモ書き | ❌ |
| `twitterUsername` | Twitterユーザー名（アイコン取得用） | ❌ |

---

## 今後の改善案

- [ ] `state.json` の永続化ボリューム導入（ボリューム削除時の状態リセット防止）
- [ ] エラーハンドリングの強化
- [ ] ログの構造化
- [ ] ヘルスチェックエンドポイントの追加
- [ ] 複数サーバー対応
