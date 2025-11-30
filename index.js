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

// ────────────────
// 状態
// ────────────────
let isAnkaRunning = false;
let ankaChannel = null;
let currentTopic = "";
let targetCounts = [];          // 例: [10, 15]
let currentCount = 0;           // 何個目のメッセージか
let collected = {};             // {10: message, 15: message}

// ────────────────
// スラッシュコマンド
// ────────────────
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
    .setDescription("安価を停止する"),

  new SlashCommandBuilder()
    .setName("menu")
    .setDescription("メニューを表示する")
].map(c => c.toJSON());

// ────────────────
// 起動時：コマンド登録
// ────────────────
client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(process.env.APP_ID), {
    body: commands
  });

  console.log("Slash commands registered.");
});

// ────────────────
// スラッシュコマンド実行
// ────────────────
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

  // --- /anka ---
  if (interaction.commandName === "anka") {
    currentTopic = interaction.options.getString("topic");
    const countStr = interaction.options.getString("count");

    targetCounts = countStr
      .split(",")
      .map(n => Number(n.trim()))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);

    if (targetCounts.length === 0) {
      return interaction.reply("⚠️ 安価番号の入力が正しくありません。例: `10,15`");
    }

    // 状態初期化
    isAnkaRunning = true;
    ankaChannel = interaction.channel;
    currentCount = 0;
    collected = {};

    await interaction.reply(
      `🎯 **安価を開始しました！**\n\n` +
      `📌 お題：**${currentTopic}**\n` +
      `📍 カウントする番号：**${targetCounts.join(", ")}**\n\n` +
      `※このチャンネルでのユーザーの発言のみカウントします。`
    );
  }

  // --- /stop ---
  if (interaction.commandName === "stop") {
    resetState();
    await interaction.reply("⏹️ 安価を停止しました。");
  }

  // --- /menu ---
  if (interaction.commandName === "menu") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("stop")
        .setLabel("⏹ 停止")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("status")
        .setLabel("📄 状態確認")
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      content: "⚙️ **メニュー**",
      components: [row],
      ephemeral: true
    });
  }

  // --- ボタン：停止 ---
  if (interaction.isButton()) {
    if (interaction.customId === "stop") {
      resetState();
      await interaction.reply({ content: "⏹️ 安価を停止しました。", ephemeral: true });
    }

    if (interaction.customId === "status") {
      await interaction.reply({
        content:
          `📄 **現在の状態**\n\n` +
          `安価中：${isAnkaRunning ? "🟢 はい" : "🔴 いいえ"}\n` +
          `お題：${currentTopic || "なし"}\n` +
          `次にカウントする番号：${nextTarget()}\n` +
          `残り：${remainingTargets().join(", ") || "なし"}`,
        ephemeral: true
      });
    }
  }
});

// ────────────────
// メッセージカウント
// ────────────────
client.on(Events.MessageCreate, async msg => {
  if (!isAnkaRunning) return;
  if (msg.author.bot) return;
  if (msg.channel.id !== ankaChannel?.id) return;

  currentCount++;

  // まだ対象番号じゃない
  if (!targetCounts.includes(currentCount)) return;

  // 安価確定
  collected[currentCount] = msg;

  await msg.reply(
    `📌 **${currentCount} 安価を踏みました！**\n\n` +
    `投稿者：${msg.author}\n` +
    `内容：\n> ${msg.content}\n\n` +
    `🔗 [メッセージリンク](${msg.url})`
  );

  // 全部集まった？
  if (Object.keys(collected).length === targetCounts.length) {
    await sendFinalResult();
    resetState();
  }
});

// ────────────────
// 結果メッセージ
// ────────────────
async function sendFinalResult() {
  let text = "⏹️ **安価終了！**\n\n今回の結果はこちら👇\n";

  for (const num of targetCounts) {
    const m = collected[num];
    if (m) {
      text += `\n・${num}安価：${m.author} →「${m.content}」`;
    }
  }

  await ankaChannel.send(text);
}

// ────────────────
// ユーティリティ
// ────────────────
function nextTarget() {
  return targetCounts.find(n => n > currentCount) || "なし";
}

function remainingTargets() {
  return targetCounts.filter(n => n > currentCount);
}

function resetState() {
  isAnkaRunning = false;
  ankaChannel = null;
  currentTopic = "";
  targetCounts = [];
  currentCount = 0;
  collected = {};
}

// ────────────────
// Express (Render keep-alive)
// ────────────────
const app = express();
app.get("/", (req, res) => res.send("OK"));
app.listen(process.env.PORT || 3000);

client.login(process.env.DISCORD_TOKEN);
