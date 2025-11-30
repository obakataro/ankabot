import "dotenv/config";
import express from "express";
import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ───────────────────────────
// 複数チャンネル用の状態管理
// state[channelId] = { ... }
// ───────────────────────────
const state = {};  

function initChannel(channelId) {
  state[channelId] = {
    isRunning: false,
    topic: "",
    targetCounts: [],
    currentCount: 0,
    results: {}
  };
}
function getState(channelId) {
  if (!state[channelId]) initChannel(channelId);
  return state[channelId];
}
function resetChannel(channelId) {
  initChannel(channelId);
}

// ───────────────────────────
// スラッシュコマンド
// ───────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName("anka")
    .setDescription("安価を開始する")
    .addStringOption(opt =>
      opt.setName("topic").setDescription("お題").setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("count")
        .setDescription("安価番号(例: 10,15)")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("このチャンネルの安価を停止する"),

  new SlashCommandBuilder()
    .setName("menu")
    .setDescription("メニューを表示する")
].map(c => c.toJSON());

// 起動時
client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(process.env.APP_ID), {
    body: commands
  });

  console.log("✔ Slash commands registered");
});

// ───────────────────────────
// コマンド処理
// ───────────────────────────
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

  const ch = interaction.channel.id;
  const st = getState(ch);

  // /anka
  if (interaction.commandName === "anka") {
    const topic = interaction.options.getString("topic");
    const countStr = interaction.options.getString("count");

    const targets = countStr
      .split(",")
      .map(n => Number(n.trim()))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);

    if (targets.length === 0) {
      return interaction.reply("⚠️ 正しい安価番号を指定してね！（例: 10,15）");
    }

    // ステート初期化
    st.isRunning = true;
    st.topic = topic;
    st.targetCounts = targets;
    st.currentCount = 0;
    st.results = {};

    await interaction.reply(
      `🎯 **安価スタート！**\n\n` +
      `📌 お題：**${topic}**\n` +
      `📍 カウント：**${targets.join(", ")}**\n`
    );
  }

  // /stop
  if (interaction.commandName === "stop") {
    resetChannel(ch);
    await interaction.reply("⏹️ このチャンネルの安価を停止しました。");
  }

  // /menu
  if (interaction.commandName === "menu") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("stop_ch")
        .setLabel("⏹ 停止")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId("status_ch")
        .setLabel("📄 状態確認")
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      content: "⚙️ **メニュー（このチャンネルのみ操作）**",
      components: [row],
      ephemeral: true
    });
  }

  // ボタン操作
  if (interaction.isButton()) {
    if (interaction.customId === "stop_ch") {
      resetChannel(ch);
      return interaction.reply({ content: "⏹️ 安価を停止しました。", ephemeral: true });
    }

    if (interaction.customId === "status_ch") {
      return interaction.reply({
        content:
          `📄 **状態（このチャンネル）**\n` +
          `安価中：${st.isRunning ? "🟢 はい" : "🔴 いいえ"}\n` +
          `お題：${st.topic || "なし"}\n` +
          `次の番号：${st.targetCounts.find(n => n > st.currentCount) || "なし"}`,
        ephemeral: true
      });
    }
  }

});

// ───────────────────────────
// メッセージカウント（チャンネルごと）
// ───────────────────────────
client.on(Events.MessageCreate, async msg => {
  const ch = msg.channel.id;
  const st = getState(ch);

  if (!st.isRunning) return;
  if (msg.author.bot) return;

  st.currentCount++;

  if (!st.targetCounts.includes(st.currentCount)) return;

  // 保存（必要最小限）
  st.results[st.currentCount] = {
    authorId: msg.author.id,
    content: msg.content,
    url: msg.url
  };

  await msg.reply(
    `📌 **${st.currentCount} 安価！**\n` +
    `投稿者：<@${msg.author.id}>\n` +
    `内容：\n> ${msg.content}\n` +
    `🔗 [メッセージリンク](${msg.url})`
  );

  // 全て揃ったら結果送信
  if (Object.keys(st.results).length === st.targetCounts.length) {
    await sendFinal(msg.channel, st);
    resetChannel(ch);
  }
});

// ───────────────────────────
// 結果送信
// ───────────────────────────
async function sendFinal(channel, st) {
  let text = `⏹️ **安価終了！（このチャンネル）**\n`;

  for (const num of st.targetCounts) {
    const r = st.results[num];
    if (!r) continue;
    text += `\n・${num}安価：<@${r.authorId}> →「${r.content}」`;
  }

  await channel.send(text);
}

// ───────────────────────────
// Render keep-alive
// ───────────────────────────
const app = express();
app.get("/", (_, res) => res.send("OK"));
app.listen(process.env.PORT || 3000);

client.login(process.env.DISCORD_TOKEN);
