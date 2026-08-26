const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const SPACE_URL_REGEX = /https?:\/\/(?:x|twitter)\.com\/i\/spaces\/([A-Za-z0-9_-]+)/i;
const MAX_FORWARD_PER_RUN = 20;
const SPACE_ID_CACHE_SIZE = 300;

const DATA_DIR = process.env.DATA_DIR || '/data';
const CONFIG_PATH = path.join(__dirname, 'config.json');
const STATE_PATH = path.join(DATA_DIR, 'state.json');

const discordToken = process.env.DISCORD_BOT_TOKEN;

if (!discordToken) {
  console.error('DISCORD_BOT_TOKEN が設定されていません。');
  process.exit(1);
}

let config = [];
let state = {
  forwardedCache: [],
  lastMessageId: {}
};

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    config = JSON.parse(raw);
    console.log(`設定を ${config.length} 行読み込みました。`);
  } catch (error) {
    console.error('config.json の読み込みに失敗しました:', error.message);
    process.exit(1);
  }
}

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    state = JSON.parse(raw);
  } catch (error) {
    console.log('state.json が存在しないため、新規作成します。');
    state = { forwardedCache: [], lastMessageId: {} };
    saveState();
  }
}

function saveState() {
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch (error) {
    console.error('state.json の保存に失敗しました:', error.message);
  }
}

function detectSpace(content, embeds = []) {
  const candidates = [content];
  embeds.forEach(embed => {
    if (embed.url) candidates.push(embed.url);
    if (embed.title) candidates.push(embed.title);
    if (embed.description) candidates.push(embed.description);
    if (embed.author && embed.author.url) candidates.push(embed.author.url);
  });

  for (const text of candidates) {
    if (!text) continue;
    const match = text.match(SPACE_URL_REGEX);
    if (match) {
      const spaceId = match[1];
      return {
        spaceId,
        spaceUrl: `https://x.com/i/spaces/${spaceId}`,
        sourceText: content || `https://x.com/i/spaces/${spaceId}`
      };
    }
  }
  return null;
}

async function sendWebhook(webhookUrl, payload) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Webhook送信に失敗しました（HTTP ${response.status}）: ${text.slice(0, 200)}`);
  }
}

async function sendChannel(channelId, payload) {
  const channel = await client.channels.fetch(channelId);
  if (!channel) {
    throw new Error(`チャンネルが見つかりません: ${channelId}`);
  }
  await channel.send(payload);
}

async function processMessage(message) {
  if (message.author?.bot) return;

  for (const row of config) {
    if (!row.enabled) continue;
    if (String(message.channelId) !== String(row.sourceChannelId)) continue;
    if (!row.destWebhookUrl && !row.destChannelId) continue;

    const spaceInfo = detectSpace(message.content, message.embeds || []);
    if (!spaceInfo) continue;

    const msgId = String(message.id);
    if (state.forwardedCache.includes(msgId)) {
      console.log(`メッセージ ${msgId} は転送済みのためスキップします。`);
      continue;
    }

    if (state.forwardedCache.length >= SPACE_ID_CACHE_SIZE) {
      state.forwardedCache.shift();
    }

    try {
      const originalText = (message.content && message.content.trim()) ? message.content : spaceInfo.spaceUrl;
      const content = `🎙️ **Xスペース配信**\n${originalText}`;

      const embed = new EmbedBuilder()
        .setTitle('Xスペースを開く')
        .setURL(spaceInfo.spaceUrl)
        .setColor(0x1da1f2)
        .toJSON();

      const payload = {
        embeds: [embed]
      };

      if (row.destWebhookUrl) {
        payload.content = content;
        payload.username = message.author.username;
        payload.avatarURL = message.author.displayAvatarURL();
        await sendWebhook(row.destWebhookUrl, payload);
      } else {
        await sendChannel(row.destChannelId, {
          content,
          embeds: [embed]
        });
      }

      state.forwardedCache.push(msgId);
      saveState();
      console.log(`スペースを転送しました: ${spaceInfo.spaceUrl}（メッセージ ${msgId}）`);
    } catch (error) {
      console.error(`スペース転送中にエラーが発生しました（メッセージ ${msgId}）: ${error.message}`);
    }

    break;
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.on('messageCreate', async message => {
  try {
    await processMessage(message);
  } catch (error) {
    console.error('メッセージ処理中にエラーが発生しました:', error);
  }
});

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  loadConfig();
  loadState();

  await client.login(discordToken);
  console.log('Botが起動しました。');
}

main().catch(error => {
  console.error('Botの起動に失敗しました:', error);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('Botを停止しています...');
  await client.destroy();
  process.exit(0);
});
