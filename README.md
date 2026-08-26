# Discord Space Get Bot

X(Twitter) スペース配信ツイートを Discord チャンネルから検出し、Webhook で別チャンネルに転送する Bot です。

## ファイル構成

- `index.js` - Bot のメインコード
- `config.json` - 転送設定（対象チャンネル、Webhook URL など）
- `state.json` - 処理状態のキャッシュ（自動生成、Git 管理外）
- `package.json` - Node.js プロジェクト設定
- `.gitignore` - Git 除外設定

## 必要な環境変数

| 環境変数 | 説明 | 必須 |
|---------|------|------|
| `DISCORD_BOT_TOKEN` | Discord Bot トークン | ✅ |
| `DATA_DIR` | データ保存ディレクトリ（デフォルト: `/data`） | ❌ |

## config.json の形式

```json
[
  {
    "sourceChannelId": "123456789012345678",
    "destWebhookUrl": "https://discord.com/api/webhooks/xxx/yyy",
    "enabled": true,
    "memo": "メモ書き"
  }
]
```

| フィールド | 説明 | 必須 |
|-----------|------|------|
| `sourceChannelId` | 転送元チャンネルID | ✅ |
| `destWebhookUrl` | 転送先Webhook URL | ✅ |
| `enabled` | 有効/無効 | ❌（デフォルト: true） |
| `memo` | メモ書き | ❌ |

## セットアップ手順

### 1. Discord Developer Portal で Bot を作成

1. https://discord.com/developers/applications にアクセス
2. アプリケーションを作成
3. **Bot** を選択
4. **Token** をコピー（後で使用）
5. **Message Content Intent** を ON にする
6. サーバーに Bot を招待（権限: `Send Messages`, `Read Message History`, `View Channels`）

### 2. Webhook を作成

1. 転送先 Discord チャンネルの設定 > 連携サービス > Webhook
2. 新しい Webhook を作成
3. Webhook URL をコピー（後で使用）

### 3. GitHub にプッシュ

```bash
git add .
git commit -m "Add Discord Space Get Bot"
git push
```

### 4. Northflank でデプロイ

1. https://northflank.com/ にアカウント作成（GitHub アカウントでログイン）
2. **New Project** > **Deploy from GitHub repo**
3. このリポジトリを選択
4. 設定:
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
5. **Environment Variables** を追加:
   - `DISCORD_BOT_TOKEN` - 手順1でコピーしたトークン
6. **Volumes** を追加:
   - Mount path: `/data`
   - Size: 1GB
7. **Deploy** をクリック

### 5. config.json を編集

1. `config.json` を編集して、`sourceChannelId` と `destWebhookUrl` を設定
2. Git にプッシュ
3. Northflank が自動デプロイ

## 運用方法

### 設定を追加する場合

AI に以下のように指示してください:
「config.json に新しい行を追加して: sourceChannelId は 123456789、destWebhookUrl は https://...、memo は テスト」

AI が `config.json` を更新するので、そのファイルを Git にプッシュするだけで反映されます。

### 設定を無効化する場合

`config.json` の該当行の `enabled` を `false` に変更してプッシュ。

### ブックマークをリセットする場合

`state.json` の `lastMessageId` を削除するか、Northflank のボリュームから `state.json` を削除。

## 制限事項

- Northflank Free Sandbox は always-on compute ですが、2サービスまで
- `state.json` は永続化ボリュームに保存されるため、ボリュームを削除すると状態がリセットされます
- Bot が OOM で落ちた場合、自動再起動されます（Northflank の機能）

## トラブルシューティング

### Bot が起動しない

- 環境変数 `DISCORD_BOT_TOKEN` が正しく設定されているか確認
- Northflank のログを確認

### メッセージが転送されない

- `config.json` の `sourceChannelId` が正しいか確認
- `destWebhookUrl` が有効か確認
- Bot に `Message Content Intent` が有効か確認
- Bot がサーバーに参加しているか確認

### 重複して転送される

- `state.json` の `forwardedCache` が正常に保存されているか確認
- ボリュームが正しくマウントされているか確認
