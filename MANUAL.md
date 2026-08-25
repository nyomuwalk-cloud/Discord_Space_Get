# Discord_Space_Get - ユーザーマニュアル

Discord のテキストチャンネル（TweetShift が配信者の全ツイートを自動投稿するチャンネル）から、
**X(Twitter) の「スペース」配信ツイートのみ**を抜き出し、別のチャンネルへ自動転送する
Google Apps Script です。

---

## 目次

- [概要](#概要)
- [検討した方式](#検討した方式)
- [必要な設定](#必要な設定)
- [スクリプトプロパティ一覧](#スクリプトプロパティ一覧)
- [関数リファレンス](#関数リファレンス)
- [定期実行の設定](#定期実行の設定)
- [トラブルシューティング](#トラブルシューティング)
- [更新履歴](#更新履歴)

---

## 概要

TweetShift は配信者のツイートを Discord へ自動投稿しますが、通常のツイートもスペース告知も
混在して投稿されます。このスクリプトは、**投稿されたツイート群からスペース関連ツイートだけを
絞り込み、専用チャンネルへ転送**します。

### 処理フロー

```
TweetShift 投稿元チャンネル (sourceChannelId)
        │  Discord Bot で新着メッセージを読取
        ▼
[XスペースURLを含むか判定]
  x.com/i/spaces/{id} または twitter.com/i/spaces/{id}
        │  該当のみ
        ▼
専用チャンネル (destChannelId / destWebhookUrl) へ転送
```

---

## 検討した方式

### 1. スペース投稿の検出（核心）

X のスペースは必ず以下の形式の URL を持ちます。

```
https://x.com/i/spaces/{スペースID}
https://twitter.com/i/spaces/{スペースID}
```

そのため、**メッセージ本文・Embed 内の URL/テキストに対してこのパターンを正規表現で探す**
のが最も確実かつ軽量です。TweetShift がスペース開始/予定ツイートを投稿する際、本文にこの
リンクが含まれるため、キーワード（「スペース」「Space」など）に依存せず検出できます。

検索対象:
- メッセージ本文 (`content`)
- Embed の `url` / `title` / `description` / `author.url`

### 2. メッセージの読み取り手段

Webhook では他チャンネルの履歴を読めないため、**Discord Bot トークン + Discord REST API**
を使用します。

- 読取: `GET /channels/{sourceChannelId}/messages?after={lastMessageId}&limit=100`
- 送信: `POST /channels/{destChannelId}/messages` （または任意の Webhook）

Bot には元チャンネルで **「メッセージ履歴を読む」**、先チャンネルで **「メッセージを送信」**
の権限が必要です。

### 3. 重複転送の防止

- **ブックマーク方式**: `lastMessageId` プロパティに最後に処理したメッセージIDを保持し、
  次回は `after=` でその後だけを取得します。
- **転送済みキャッシュ**: 万一の再処理時に同じメッセージを二重投稿しないよう、
  `forwardedSpaceIds` に直近の転送済みメッセージIDを保存します（上限 `SPACE_ID_CACHE_SIZE` 件）。

### 4. 初回・再開・上限

- 初回実行時は履歴を転送せず、最新位置をブックマークだけ設定します（過去全ツイートの一斉転送を回避）。
- 1 回の実行で転送できる件数は `MAX_FORWARD_PER_RUN`（既定 20 件）に制限し、残りは次回へ持ち越し。
- GAS の 6 分制限に対応するため、残り実行時間を監視して安全に中断します。

---

## 必要な設定

### 1. Discord Bot の作成と権限付与

1. [Discord Developer Portal](https://discord.com/developers/applications) で Bot を作成。
2. Bot トークンをコピー。
3. サーバーへ Bot を招待し、元チャンネルに
   **「メッセージ履歴を読む」「メッセージを送信」** を付与（先チャンネルにも送信権限を付与）。

### 2. スクリプトプロパティの設定

GAS エディタで以下を実行（値は実際のものに置換）:

```javascript
const props = PropertiesService.getScriptProperties();
props.setProperty('discordBotToken', 'YOUR_BOT_TOKEN');
props.setProperty('sourceChannelId', 'TWEETSHIFT_POSTED_CHANNEL_ID');
props.setProperty('destChannelId',   'SPACE_DEST_CHANNEL_ID');
// 先チャンネルを Webhook で送る場合は代わりに以下を設定（destChannelId は不要）:
// props.setProperty('destWebhookUrl', 'https://discord.com/api/webhooks/...');
```

チャンネルIDは Discord の「開発者モード」でチャンネルを右クリック → IDをコピー で取得できます。

---

## スクリプトプロパティ一覧

| キー | 説明 | 自動管理 |
|------|------|----------|
| `discordBotToken` | Bot トークン | ユーザー設定 |
| `sourceChannelId` | TweetShift 投稿元チャンネルID | ユーザー設定 |
| `destChannelId` | 転送先チャンネルID | ユーザー設定 |
| `destWebhookUrl` | 転送先 Webhook URL（`destChannelId` の代わり） | ユーザー設定 |
| `lastMessageId` | 処理済み最新メッセージID（ブックマーク） | 自動 |
| `forwardedSpaceIds` | 転送済みメッセージIDキャッシュ（JSON配列） | 自動 |

---

## 関数リファレンス

### 自動実行関数

#### `runDiscordSpaceGet()`
**説明**: メイン処理を実行。時間主導トリガーに設定してください。

### 手動実行関数

#### `dryRunRecent(count = 10)`
**説明**: 元チャンネルの直近 `count` 件をスペース判定のみ実行（転送は行いません）。
導入前の動作確認に便利です。

**使用例**:
```javascript
dryRunRecent(20);
// 出力例:
// [スペース検出] https://x.com/i/spaces/1YpKk... | 本文: さあ始めます...
// 直近 20 件中、スペース投稿は 1 件でした（転送は行いません）。
```

#### `resetBookmark()`
**説明**: `lastMessageId` を削除。次回実行で最新位置のみ再設定します（過去履歴は転送されません）。

#### `clearForwardedCache()`
**説明**: 転送済みキャッシュをクリアします。

---

## 定期実行の設定

GAS エディタで:

1. 左パネル → トリガーアイコン → **トリガーを作成**
2. 設定:
   - 実行する関数: `runDiscordSpaceGet`
   - イベントソース: 時間主導型
   - 種類: 分単位で実行（例: 5分ごと、または10分ごと）
3. 保存

スペースの見逃しを減らすには短い間隔（5分）を推奨します。

---

## トラブルシューティング

### Q: "discordBotToken が設定されていません" と出る
**A**: スクリプトプロパティに `discordBotToken` を設定してください。

### Q: HTTP 403 が出る
**A**: Bot に元チャンネル/先チャンネルの権限（履歴読取・送信）が付与されていないか、
チャンネルに Bot が参加していない可能性があります。

### Q: スペース投稿が検出されない
**A**: `dryRunRecent()` で実際の投稿を確認してください。TweetShift がスペースURLを
`t.co` 短縮リンクで投稿し、本文に `x.com/i/spaces/...` が含まれていない場合は、
Embed 内の URL も検索対象としているため通常は検出されますが、完全にリンクが除外される
設定の場合は検出できません。

### Q: 同じスペースが何度も転送される
**A**: `clearForwardedCache()` でキャッシュをクリアし、Bot 自身の投稿（`author.bot`）を
誤ってソースに含めていないか確認してください（Bot 投稿は自動で除外されます）。

---

## 更新履歴

| バージョン | 日付 | 変更内容 |
|----------|------|--------|
| 1.0 | 2026-08-25 | 初版：スペース検出＋別チャンネル転送 |

---

## ライセンス

このスクリプトは自由に利用・改変できます。
