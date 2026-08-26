// ============================================================
// Discord_Space_Get - 定数・環境変数キー
// ============================================================
// このファイルにはローカル環境の定数や
// Script Properties のキーを定義します。
// 機密情報の値は Script Properties で管理してください。
// ============================================================

// Discord API
var DISCORD_API_BASE = 'https://discord.com/api/v10';

// フェッチ・転送制限
var MAX_FETCH_LIMIT = 100;
var MAX_FETCH_PAGES = 5;
var MAX_FORWARD_PER_RUN = 20;
var SPACE_ID_CACHE_SIZE = 300;
var MIN_REMAINING_TIME_SEC = 15;

// X スペース URL パターン
var SPACE_URL_REGEX = /https?:\/\/(?:x|twitter)\.com\/i\/spaces\/([A-Za-z0-9_-]+)/i;

// Script Properties キー
var PROP_DISCORD_BOT_TOKEN = 'discordBotToken';
var PROP_SOURCE_CHANNEL_ID = 'sourceChannelId';
var PROP_DEST_CHANNEL_ID = 'destChannelId';
var PROP_DEST_WEBHOOK_URL = 'destWebhookUrl';
var PROP_LAST_MESSAGE_ID = 'lastMessageId';
var PROP_FORWARDED_SPACE_IDS = 'forwardedSpaceIds';

// 設定スプレッドシート
var CONFIG_SPREADSHEET_ID = '';
var CONFIG_SHEET_NAME = 'Config';
var CONFIG_HEADERS = ['sourceChannelId', 'destChannelId', 'destWebhookUrl', 'enabled', 'memo', 'lastMessageId'];
