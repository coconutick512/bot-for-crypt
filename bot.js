const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
require("dotenv").config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const API_BASE_URL = "http://localhost:3000/api";

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Привет, Алекс! Я бот для учета крипто-финансов. Для начала работы, введите CVV карты. Армяне вперед!!!! Доступные команды:\n/wallets - список кошельков\n/add <сеть> <адрес> <имя> - добавить кошелек\n/delete <id> - удалить кошелек\n/report <id> <с_даты> <до_даты> - отчет\n/balance <id> <токен> - баланс"
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

bot.onText(/\/add/, async (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Напиши команду add, название сети кошелька, адрес и имя (пример: 'add TRC20 XXX767X88sauasiauixas76 TRC20 ДЛЯ РУССКИХ ФИНАНСОВ')"
  );
});

bot.onText(/add (\S+) (\S+) (.+)/, async (msg, match) => {
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

bot.onText(/\/report/, async (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Напиши команду report, ID кошелька, дату начала трекинга, дату конца трекинга (пример: 'report 5 01.05.2025 07.09.2025 ')"
  );
});

bot.onText(/report (\d+) (\S+) (\S+)/, async (msg, match) => {
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

bot.onText(/\/balance/, async (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Напиши команду balance, ID кошелька и токен (пример: 'balance 5 usdt ')"
  );
});

bot.onText(/balance (\d+) (\S+)/, async (msg, match) => {
  const [_, walletId, token] = match;
  try {
    const { data } = await axios.get(
      `${API_BASE_URL}/balance/${walletId}/${token}`
    );
    bot.sendMessage(
      msg.chat.id,
      `Баланс ${token.toUpperCase()} на кошельке ID ${walletId}: *${
        data.balance
      }* (вот это нихуя себе у тебя там денег)`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    bot.sendMessage(msg.chat.id, `Ошибка: ${e.message}`);
  }
});

bot.onText(/\/delete (\d+)/, async (msg, match) => {
  const [_, walletId] = match;
  try {
    await axios.delete(`${API_BASE_URL}/wallets/${walletId}`);
    bot.sendMessage(msg.chat.id, `Кошелек удален!`);
  } catch (e) {
    bot.sendMessage(msg.chat.id, `Ошибка: ${e.response.data.message}`);
  }
});
