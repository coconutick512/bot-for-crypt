const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
require("dotenv").config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const API_BASE_URL = "http://localhost:3000/api";

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Привет, Алекс! Я бот для учета крипто-финансов. Для начала работы, введите CVV карты. Армяне вперед!!!! Доступные команды:\n/wallets - список кошельков\n/add <сеть> <адрес> <имя> - добавить кошелек\n/report <id> <с_даты> <до_даты> - отчет\n/balance <id> <токен> - баланс"
  );
});

bot.onText(/\/wallets/, async (msg) => {
  const { data: wallets } = await axios.get(`${API_BASE_URL}/wallets`);
  let message = "*Ваши кошельки:*\n\n";
  wallets.forEach((w) => {
    message += `*ID:* ${w.id}\n*Имя:* ${w.label}\n*Сеть:* ${w.network}\n*Адрес:* \`${w.address}\`\n---\n`;
  });
  bot.sendMessage(msg.chat.id, message, { parse_mode: "Markdown" });
});

bot.onText(/\/add (\S+) (\S+) (.+)/, async (msg, match) => {
  try {
    await axios.post(`${API_BASE_URL}/wallets`, {
      network: match[1].toUpperCase(),
      address: match[2],
      label: match[3],
    });
    bot.sendMessage(msg.chat.id, `Кошелек "${match[3]}" успешно добавлен!`);
  } catch (e) {
    bot.sendMessage(msg.chat.id, `Ошибка: ${e.response.data.message}`);
  }
});

bot.onText(/\/report (\d+) (\S+) (\S+)/, async (msg, match) => {
  const [_, walletId, startDate, endDate] = match;
  bot.sendMessage(msg.chat.id, "Готовлю отчет (зачем?...)...");
  try {
    const { data } = await axios.post(`${API_BASE_URL}/report`, {
      walletId,
      startDate,
      endDate,
    });
    let reportMessage = `*Отчет по кошельку ID ${walletId}*\nПериод: ${startDate} - ${endDate}\n\n`;
    if (data.count === 0) {
      reportMessage += "Поступлений не найдено.";
    } else {
      data.transactions.forEach((tx) => {
        reportMessage += `— *${parseFloat(tx.amount).toFixed(2)} ${
          tx.token_symbol
        }* \n   _${new Date(tx.tx_timestamp).toLocaleString("ru-RU")}_\n`;
      });
      reportMessage += `\n*Всего поступлений: ${parseFloat(
        data.totalAmount
      ).toFixed(2)} USD*`;
    }
    bot.sendMessage(msg.chat.id, reportMessage, { parse_mode: "Markdown" });
  } catch (e) {
    bot.sendMessage(msg.chat.id, `Ошибка: ${e.response.data.message}`);
  }
});

bot.onText(/\/balance (\d+) (\S+)/, async (msg, match) => {
  const [_, walletId, token] = match;
  try {
    const { data } = await axios.get(
      `${API_BASE_URL}/balance/${walletId}/${token}`
    );
    bot.sendMessage(
      msg.chat.id,
      `Баланс ${token.toUpperCase()} на кошельке ID ${walletId}: *${data.balance.toFixed(
        4
      )}* (вот это нихуя себе у тебя там денег)`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    bot.sendMessage(msg.chat.id, `Ошибка: ${e.response.data.message}`);
  }
});
