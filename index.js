import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from "discord.js";

const client = new Client({
  intents: [
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.MessageContent,
  ]
});

// ============================
// 安価データ保持（軽量）
// ============================
const ankars = {}; 
// 形式：
// ankars[channelId] = {
//   topic: "",
//   nextNumbers: [15,20,25],
//   currentNumber: 0,
//   starterId: "xxxx",
//   startMessageId: "",
//   fixed: { 10: { message: "...", userName: "じゃがいもの妖精" } }
// };


// ============================
// Slash commands 登録
// ============================
const commands = [
  new SlashCommandBuilder()
    .setName("start")
    .setDescription("安価を開始します")
    .addStringOption(opt =>
      opt.setName("お題")
        .setDescription("安価のお題")
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName("安価")
        .setDescription("例: 10,15,20")
        .setRequired(true)),
        
  new SlashCommandBuilder()
    .setName("menu")
    .setDescription("現在の安価メニューを表示"),
];

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log("Commands registered");
  } catch (e) {
    console.error(e);
  }
})();


// ============================
// /start
// ============================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "start") {
    const channelId = interaction.channel.id;

    const topic = interaction.options.getString("お題");
    const numberString = interaction.options.getString("安価");

    const nums = numberString
      .split(",")
      .map(n => parseInt(n.trim()))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);

    if (nums.length === 0)
      return interaction.reply("安価番号の形式が不正です…");

    ankars[channelId] = {
      topic,
      nextNumbers: nums,
      currentNumber: 0,
      starterId: interaction.user.id,
      startMessageId: "",
      fixed: {}
    };

    // スタートメッセージ送信
    const startMsg = await interaction.channel.send(
      `🎲 **安価開始！**\nお題：${topic}\n次の安価：${nums[0]}`
    );

    ankars[channelId].startMessageId = startMsg.id;

    return interaction.reply({ content: "安価を開始しました！", ephemeral: true });
  }

  // ============================
  // /menu
  // ============================
  if (interaction.commandName === "menu") {
    const channelId = interaction.channel.id;

    if (!ankars[channelId])
      return interaction.reply({ content: "このチャンネルでは安価が進行していません", ephemeral: true });

    const data = ankars[channelId];

    if (interaction.user.id !== data.starterId)
      return interaction.reply({ content: "開始者のみメニューを閲覧できます！", ephemeral: true });

    const next = data.nextNumbers[0] ?? "なし";

    const fixedList = Object.entries(data.fixed)
      .map(([num, v]) => `${num} → ${v.message} - ${v.userName}`)
      .join("\n");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("stop")
        .setLabel("停止")
        .setStyle(ButtonStyle.Danger)
    );

    return interaction.reply({
      ephemeral: true,
      content:
`【メニュー】
お題：${data.topic}

現在のカウント：${data.currentNumber}
次の安価：${next}
残り：${data.nextNumbers.join(",")}

📌確定した安価
${fixedList || "まだありません"}

※コマンド実行者のみ閲覧可能
`,
      components: [row]
    });
  }
});


// ============================
// 停止ボタン
// ============================
client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "stop") {
    const channelId = interaction.channel.id;
    const data = ankars[channelId];
    if (!data) return;

    if (interaction.user.id !== data.starterId)
      return interaction.reply({ content: "停止できるのは開始者のみ！", ephemeral: true });

    delete ankars[channelId];
    return interaction.reply({ content: "安価を停止しました！", ephemeral: true });
  }
});


// ============================
// 安価判定（メッセージ監視）
// ============================
client.on("messageCreate", msg => {
  const channelId = msg.channel.id;
  const data = ankars[channelId];
  if (!data) return;

  // 数字だけのメッセージか判定
  const n = parseInt(msg.content.trim());
  if (isNaN(n)) return;

  // カウント更新
  data.currentNumber = n;

  // 今狙ってる安価番号
  const target = data.nextNumbers[0];
  if (!target) return;

  if (n === target) {
    // 確定登録
    data.fixed[target] = {
  message: msg.content,
  userName: msg.member?.nickname || msg.author.username
};
    
    // 次の番号を外す
    data.nextNumbers.shift();

    // スタートメッセージに返信
    msg.channel.messages.fetch(data.startMessageId)
      .then(m => const name = msg.member?.nickname || msg.author.username;
m.reply(`✨ **安価${target} 確定！**\n「${msg.content}」 - ${name}`)
      .catch(() => {});

    // 次の安価なし → 終了
    if (data.nextNumbers.length === 0) {
      delete ankars[channelId];
    }
  }
});

client.login(process.env.TOKEN);
