import "dotenv/config";
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

// ====== 状態 ======
let isAnkaRunning = false;
let currentTopic = null;
let ankaChannel = null;

// ====== コマンド定義 ======
const commands = [
  new SlashCommandBuilder()
    .setName("anka")
    .setDescription("安価を開始する")
    .addStringOption(o =>
      o.setName("topic").setDescription("お題を入力").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("安価を停止する"),
  new SlashCommandBuilder()
    .setName("menu")
    .setDescription("メニューを表示する")
].map(cmd => cmd.toJSON());

// ====== コマンド登録（重複防止版） ======
client.once(Events.ClientReady, async () => {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  const appId = process.env.APP_ID;

  console.log("🧹既存のスラッシュコマンドを削除しています…");
  await rest.put(Routes.applicationCommands(appId), { body: [] });

  console.log("✨新しいコマンドを登録中…");
  await rest.put(Routes.applicationCommands(appId), { body: commands });

  console.log("🎉 登録完了！重複コマンドは消えたよ！");
});

// ====== コマンド処理 ======
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

  // ----- /anka -----
  if (interaction.commandName === "anka") {
    const topic = interaction.options.getString("topic");
    currentTopic = topic;
    isAnkaRunning = true;
    ankaChannel = interaction.channel;

    await interaction.reply(
      `🎯 **安価開始！**\nお題: **${topic}**\n\n次の発言が 1 安価になります！`
    );
  }

  // ----- /stop -----
  if (interaction.commandName === "stop") {
    isAnkaRunning = false;
    currentTopic = null;
    ankaChannel = null;
    await interaction.reply("⏹️ 安価を停止しました。");
  }

  // ----- /menu -----
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
      content: "メニュー：",
      components: [row],
      ephemeral: true
    });
  }

  // ----- ボタン -----
  if (interaction.isButton()) {
    if (interaction.customId === "stop") {
      isAnkaRunning = false;
      currentTopic = null;
      ankaChannel = null;
      await interaction.reply({ content: "安価を停止しました！", ephemeral: true });
    }

    if (interaction.customId === "status") {
      await interaction.reply({
        content:
          `📄 **現在の状態**\n\n` +
          `安価中: ${isAnkaRunning ? "🟢 はい" : "🔴 いいえ"}\n` +
          `お題: ${currentTopic ?? "なし"}`,
        ephemeral: true
      });
    }
  }
});

// ====== 1安価処理 ======
client.on(Events.MessageCreate, async msg => {
  if (!isAnkaRunning) return;
  if (msg.author.bot) return;
  if (msg.channel.id !== ankaChannel?.id) return;

  // 受け取ったら即終了
  isAnkaRunning = false;

  await msg.reply(
    `📝 **1 安価はこちら！**\n${msg.author}: ${msg.content}\n\n---\n安価終了しました。`
  );
});

client.login(process.env.DISCORD_TOKEN);
