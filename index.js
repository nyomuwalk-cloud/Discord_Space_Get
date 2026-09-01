const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const SPACE_URL_REGEX = /https?:\/\/(?:x|twitter)\.com\/i\/spaces\/([A-Za-z0-9_-]+)/i;
const TCO_URL_REGEX = /https?:\/\/t\.co\/[A-Za-z0-9]+/i;
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
    console.log(`[DEBUG] loadConfig: 設定を ${config.length} 行読み込みました。`);
  } catch (error) {
    console.error(`[DEBUG] loadConfig: 失敗 ${error.message}`);
    console.error('config.json の読み込みに失敗しました:', error.message);
    process.exit(1);
  }
}

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    state = JSON.parse(raw);
    console.log(`[DEBUG] loadState: state読み込み完了 cache=${state.forwardedCache?.length ?? 0}`);
  } catch (error) {
    console.log('state.json が存在しないため、新規作成します。');
    state = { forwardedCache: [], lastMessageId: {} };
    saveState();
  }
}

function saveState() {
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
    console.log(`[DEBUG] saveState: cache=${state.forwardedCache?.length ?? 0}`);
  } catch (error) {
    console.error(`[DEBUG] saveState: 失敗 ${error.message}`);
    console.error('state.json の保存に失敗しました:', error.message);
  }
}

function detectSpace(content, embeds = []) {
  const candidates = [content];
  embeds.forEach((embed, idx) => {
    console.log(`[DEBUG] detectSpace: embed[${idx}] keys=${Object.keys(embed).join(',')}`);
    if (embed.url) candidates.push(embed.url);
    if (embed.title) candidates.push(embed.title);
    if (embed.description) candidates.push(embed.description);
    if (embed.author && embed.author.url) candidates.push(embed.author.url);
    if (Array.isArray(embed.fields)) {
      embed.fields.forEach((field, i) => {
        if (field.value) candidates.push(field.value);
        if (field.name) candidates.push(field.name);
        console.log(`[DEBUG] detectSpace: embed[${idx}].fields[${i}] name=${field.name} value=${String(field.value).slice(0, 80)}`);
      });
    }
    if (embed.footer && embed.footer.text) {
      candidates.push(embed.footer.text);
      console.log(`[DEBUG] detectSpace: embed[${idx}].footer=${embed.footer.text.slice(0, 120)}`);
    }
    if (embed.data && typeof embed.data === 'object') {
      console.log(`[DEBUG] detectSpace: embed[${idx}].data keys=${Object.keys(embed.data).join(',')}`);
      if (embed.data.url) {
        console.log(`[DEBUG] detectSpace: embed[${idx}].data.url=${String(embed.data.url).slice(0, 200)}`);
        candidates.push(embed.data.url);
      }
      if (embed.data.description) {
        const desc = String(embed.data.description);
        console.log(`[DEBUG] detectSpace: embed[${idx}].data.description=${desc.slice(0, 200)}`);
        candidates.push(desc);
      }
      if (embed.data.footer && embed.data.footer.text) {
        candidates.push(embed.data.footer.text);
        console.log(`[DEBUG] detectSpace: embed[${idx}].data.footer=${String(embed.data.footer.text).slice(0, 120)}`);
      }
      if (embed.data.author && embed.data.author.url) {
        candidates.push(embed.data.author.url);
        console.log(`[DEBUG] detectSpace: embed[${idx}].data.author.url=${String(embed.data.author.url).slice(0, 200)}`);
      }
      candidates.push(JSON.stringify(embed.data));
    }
  });

  for (const text of candidates) {
    if (!text) continue;
    const match = text.match(SPACE_URL_REGEX);
    if (match) {
      const spaceId = match[1];
      console.log(`[DEBUG] detectSpace: matched spaceId=${spaceId} source=${text.slice(0, 80)}`);
      return {
        spaceId,
        spaceUrl: `https://x.com/i/spaces/${spaceId}`,
        sourceText: content || `https://x.com/i/spaces/${spaceId}`
      };
    }
  }

  for (const text of candidates) {
    if (!text) continue;
    const tcoMatch = text.match(TCO_URL_REGEX);
    if (tcoMatch) {
      const tcoUrl = tcoMatch[0];
      console.log(`[DEBUG] detectSpace: matched tcoUrl=${tcoUrl} source=${text.slice(0, 80)}`);
      return {
        spaceId: null,
        spaceUrl: tcoUrl,
        sourceText: content || tcoUrl
      };
    }
  }

  console.log(`[DEBUG] detectSpace: no match candidates=${candidates.length} content=${String(content).slice(0, 80)}`);
  return null;
}

async function sendWebhook(webhookUrl, payload) {
  const safeUrl = webhookUrl.replace(/\/[^\/]*$/, '/***');
  console.log(`[DEBUG] sendWebhook: url=${safeUrl}`);
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[DEBUG] sendWebhook: HTTP ${response.status}`);
    throw new Error(`Webhook送信に失敗しました（HTTP ${response.status}）: ${text.slice(0, 200)}`);
  }
  console.log(`[DEBUG] sendWebhook: HTTP ${response.status}`);
}

async function sendChannel(channelId, payload) {
  console.log(`[DEBUG] sendChannel: channelId=${channelId}`);
  const channel = await client.channels.fetch(channelId);
  if (!channel) {
    throw new Error(`チャンネルが見つかりません: ${channelId}`);
  }
  await channel.send(payload);
  console.log(`[DEBUG] sendChannel: 送信完了 channelId=${channelId}`);
}

async function processMessage(message) {
  if (message.author?.bot) return;

  console.log(`[DEBUG] processMessage: 受信 msgId=${message.id} author=${message.author?.username} content=${(message.content || '').slice(0, 120)} embeds=${message.embeds?.length || 0}`);

  for (const row of config) {
    if (!row.enabled) continue;
    if (String(message.channelId) !== String(row.sourceChannelId)) continue;
    if (!row.destWebhookUrl && !row.destChannelId) continue;

    const spaceInfo = detectSpace(message.content, message.embeds || []);
    if (!spaceInfo) continue;

    const msgId = String(message.id);
    console.log(`[DEBUG] processMessage: スペース検出 msgId=${msgId} spaceId=${spaceInfo.spaceId}`);

    if (state.forwardedCache.includes(msgId)) {
      console.log(`[DEBUG] processMessage: 転送済みスキップ msgId=${msgId}`);
      continue;
    }

    if (state.forwardedCache.length >= SPACE_ID_CACHE_SIZE) {
      state.forwardedCache.shift();
    }

    try {
      const authorName = message.author?.username || row.twitterUsername || 'Unknown';
      const rawContent = (message.content && message.content.trim()) ? message.content.trim() : '';
      const cleanedContent = rawContent
        .replace(/https?:\/\/(?:x|twitter)\.com\/i\/spaces\/[A-Za-z0-9_-]+/gi, '')
        .replace(/https?:\/\/t\.co\/[A-Za-z0-9]+/gi, '')
        .replace(/https?:\/\/(?:x|twitter)\.com\/\w+\/status\/\d+/gi, '')
        .replace(/\n{2,}/g, '\n')
        .trim();
      const originalText = cleanedContent || spaceInfo.spaceUrl;

      const tweetEmbed = message.embeds?.[0];
      const tweetUrl = tweetEmbed?.data?.url || tweetEmbed?.url || `https://x.com/${authorName}/status/${message.id}`;
      const screenshotUrl = `https://image.thum.io/get/width/1200/crop/800/${encodeURIComponent(tweetUrl)}`;

      const content = `🎙️ ${authorName}のXスペース配信\n${originalText}\n\n🔗 スペース: ${spaceInfo.spaceUrl}\n🐦 ツイート: ${tweetUrl}`;

      const embed = new EmbedBuilder()
        .setTitle(`Xスペースを開く - ${authorName}`)
        .setURL(spaceInfo.spaceUrl)
        .setColor(0x1da1f2)
        .setImage(screenshotUrl)
        .toJSON();

      const payload = {
        content: content,
        embeds: [embed]
      };

      if (row.destWebhookUrl) {
        if (row.twitterUsername) {
          payload.username = row.twitterUsername;
          payload.avatarURL = `https://unavatar.io/x/${row.twitterUsername}`;
        } else {
          payload.username = message.author.username;
          payload.avatarURL = message.author.displayAvatarURL();
        }
        await sendWebhook(row.destWebhookUrl, payload);
      } else {
        await sendChannel(row.destChannelId, {
          content,
          embeds: [embed]
        });
      }

      state.forwardedCache.push(msgId);
      saveState();
      console.log(`[DEBUG] processMessage: 転送完了 spaceUrl=${spaceInfo.spaceUrl} msgId=${msgId}`);
    } catch (error) {
      console.error(`[DEBUG] processMessage: 転送エラー msgId=${msgId}, error=${error.message}`);
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
    console.error(`[DEBUG] messageCreate: エラー ${error.message}`);
    console.error('メッセージ処理中にエラーが発生しました:', error);
  }
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  try {
    await processMessage(newMessage);
  } catch (error) {
    console.error(`[DEBUG] messageUpdate: エラー ${error.message}`);
    console.error('メッセージ更新処理中にエラーが発生しました:', error);
  }
});

async function main() {
  console.log('[DEBUG] main: 開始');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  loadConfig();
  loadState();

  await client.login(discordToken);
  console.log('[DEBUG] main: Botログイン完了');
  console.log('Botが起動しました。');
}

main().catch(error => {
  console.error(`[DEBUG] main: 起動失敗 ${error.message}`);
  console.error('Botの起動に失敗しました:', error);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('[DEBUG] SIGINT: 停止開始');
  console.log('Botを停止しています...');
  await client.destroy();
  process.exit(0);
});
