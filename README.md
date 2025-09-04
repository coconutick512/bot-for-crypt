# Шаг 1: Настройка проекта

1. Создайте структуру проекта:
```
/crypto-finance-tracker
├──- node_modules
├──- .env
├──- bot.js
├──- blockchainService.js
├──- db.js
├──- index.js
└──- package.json
```
2. Инициализируйте проект и установите зависимости:

```
mkdir crypto-finance-tracker
cd crypto-finance-tracker
npm init -y
npm install express pg pg-hstore sequelize axios dotenv node-telegram-bot-api
```

3. Создайте и заполните файл .env:

```
# Настройки базы данных PostgreSQL
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE

# API-ключи для доступа к блокчейнам
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_API_KEY
TRONGRID_API_KEY=YOUR_TRONGRID_API_KEY # Если будете добавлять Tron
SOLANA_RPC_URL=YOUR_SOLANA_RPC_ENDPOINT # Например, от Helius или QuickNode

# Токен вашего Telegram-бота
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN

# Порт для Express сервера
PORT=3000
```
# Шаг 2: Настройка базы данных и моделей Sequelize

Это ядро вашего бэкенда. Создаем файл db.js для управления соединением и моделями.
```
const { Sequelize, DataTypes, Op } = require('sequelize');
require('dotenv').config();

// 1. Инициализация соединения с БД
const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false // Отключаем логирование SQL-запросов в консоль
});

// 2. Определение модели 'Wallet'
const Wallet = sequelize.define('Wallet', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    address: { type: DataTypes.STRING, allowNull: false },
    network: { type: DataTypes.STRING, allowNull: false }, // 'ERC20', 'TRC20', 'SOL'
    label: { type: DataTypes.STRING, allowNull: false, unique: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'wallets', timestamps: false });

// 3. Определение модели 'Transaction'
const Transaction = sequelize.define('Transaction', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tx_hash: { type: DataTypes.STRING, allowNull: false, unique: true },
    amount: { type: DataTypes.DECIMAL(30, 8), allowNull: false },
    token_symbol: { type: DataTypes.STRING, allowNull: false },
    from_address: { type: DataTypes.STRING, allowNull: false },
    tx_timestamp: { type: DataTypes.DATE, allowNull: false }
}, { tableName: 'transactions', timestamps: false });

// 4. Определение связей между моделями
Wallet.hasMany(Transaction, { foreignKey: 'wallet_id' });
Transaction.belongsTo(Wallet, { foreignKey: 'wallet_id' });

// 5. Экспортируем все необходимое
module.exports = {
    sequelize,
    Wallet,
    Transaction,
    Op // Операторы для сложных запросов (WHERE ... BETWEEN)
};
```
# Шаг 3: Сервисный слой для работы с блокчейном
Этот файл инкапсулирует всю логику по взаимодействию с внешними API. Для примера детально реализуем логику для ERC20.

```
const axios = require('axios');
const { Transaction } = require('./db');

// Адреса контрактов стейблкоинов для каждой сети
const TOKEN_CONTRACTS = {
    ERC20: {
        USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
    },
    // Добавьте TRC20 и SOL по аналогии
};

// Функция для получения баланса токена ERC20
async function getErc20TokenBalance(walletAddress, tokenSymbol) {
    const tokenContract = TOKEN_CONTRACTS.ERC20[tokenSymbol];
    if (!tokenContract) throw new Error('Токен не поддерживается');

    const response = await axios.post(`https://api.etherscan.io/api`, null, {
        params: {
            module: 'account',
            action: 'tokenbalance',
            contractaddress: tokenContract,
            address: walletAddress,
            tag: 'latest',
            apikey: process.env.ETHERSCAN_API_KEY
        }
    });

    if (response.data.status === "0") {
        throw new Error(response.data.message);
    }
    // Etherscan API требует получения информации о десятичных знаках отдельно
    // или можно захардкодить (6 для USDT/USDC)
    return parseFloat(response.data.result) / 1e6; 
}


// Функция для получения и сохранения транзакций ERC20
async function fetchAndSaveErc20Transactions(wallet) {
    const apiUrl = `https://api.etherscan.io/api?module=account&action=tokentx&address=${wallet.address}&sort=desc&apikey=${process.env.ETHERSCAN_API_KEY}`;
    const response = await axios.get(apiUrl);
    const transactions = response.data.result;

    for (const tx of transactions) {
        // Нас интересуют только поступления
        if (tx.to.toLowerCase() !== wallet.address.toLowerCase()) continue;
        
        // Проверяем, что это один из отслеживаемых токенов
        const isTrackedToken = Object.values(TOKEN_CONTRACTS.ERC20).includes(tx.contractAddress);
        if (!isTrackedToken) continue;

        const amount = parseFloat(tx.value) / (10 ** parseInt(tx.tokenDecimal));

        // Создаем транзакцию, если ее еще нет в БД
        await Transaction.findOrCreate({
            where: { tx_hash: tx.hash },
            defaults: {
                wallet_id: wallet.id,
                amount: amount,
                token_symbol: tx.tokenSymbol,
                from_address: tx.from,
                tx_timestamp: new Date(parseInt(tx.timeStamp) * 1000)
            }
        });
    }
}

// Главная функция синхронизации
async function syncWallet(walletId) {
    const { Wallet } = require('./db'); // Поздний импорт для избежания циклических зависимостей
    const wallet = await Wallet.findByPk(walletId);
    if (!wallet) throw new Error('Кошелек не найден');

    switch (wallet.network) {
        case 'ERC20':
            await fetchAndSaveErc20Transactions(wallet);
            break;
        case 'TRC20':
            console.log('Синхронизация для TRC20 еще не реализована');
            // await fetchAndSaveTrc20Transactions(wallet);
            break;
        case 'SOL':
            console.log('Синхронизация для SOL еще не реализована');
            // await fetchAndSaveSolTransactions(wallet);
            break;
    }
    console.log(`Синхронизация для кошелька ${wallet.label} завершена.`);
}

module.exports = { syncWallet, getErc20TokenBalance };
```

# Шаг 4: Основной бэкенд-сервер

index.js будет обрабатывать все HTTP-запросы от бота.

```
const express = require('express');
require('dotenv').config();
const { sequelize, Wallet, Transaction, Op } = require('./db');
const { syncWallet, getErc20TokenBalance } = require('./blockchainService');

const app = express();
app.use(express.json());

// --- CRUD API для кошельков ---
app.post('/api/wallets', async (req, res) => {
    try {
        const newWallet = await Wallet.create(req.body);
        res.status(201).json(newWallet);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/wallets', async (req, res) => {
    const wallets = await Wallet.findAll({ order: [['id', 'ASC']] });
    res.json(wallets);
});

app.delete('/api/wallets/:id', async (req, res) => {
    await Wallet.destroy({ where: { id: req.params.id } });
    res.status(204).send();
});

// --- API для получения баланса ---
app.get('/api/balance/:walletId/:token', async (req, res) => {
    try {
        const { walletId, token } = req.params;
        const wallet = await Wallet.findByPk(walletId);
        if (!wallet) return res.status(404).json({ message: "Кошелек не найден" });

        let balance;
        if (wallet.network === 'ERC20') {
            balance = await getErc20TokenBalance(wallet.address, token.toUpperCase());
        } // Добавить else if для других сетей
        
        res.json({ balance });
    } catch (e) { res.status(500).json({ message: e.message }); }
});


// --- API для отчетов ---
app.post('/api/report', async (req, res) => {
    const { walletId, startDate, endDate } = req.body;
    try {
        await syncWallet(walletId); // Шаг 1: Синхронизация

        // Шаг 2: Запрос к нашей БД
        const result = await Transaction.findAndCountAll({
            where: {
                wallet_id: walletId,
                tx_timestamp: { [Op.between]: [new Date(startDate), new Date(endDate)] }
            },
            order: [['tx_timestamp', 'DESC']],
        });

        const totalAmount = await Transaction.sum('amount', {
            where: {
                wallet_id: walletId,
                tx_timestamp: { [Op.between]: [new Date(startDate), new Date(endDate)] }
            }
        });

        res.json({ 
            transactions: result.rows, 
            count: result.count,
            totalAmount: totalAmount || 0 
        });

    } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- Запуск сервера ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    try {
        await sequelize.authenticate();
        console.log('Соединение с БД успешно установлено.');
        // Для первого запуска раскомментируйте, чтобы создать таблицы. Потом можно закомментировать.
        // await sequelize.sync({ alter: true });
        // console.log('Все модели были успешно синхронизированы.');
    } catch (error) {
        console.error('Не удалось подключиться к БД:', error);
    }
});
```

# Шаг 5: Telegram-бот

bot.js будет служить интерфейсом для пользователя.

```
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const API_BASE_URL = 'http://localhost:3000/api';

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Привет! Я бот для учета крипто-финансов. Доступные команды:\n/wallets - список кошельков\n/add <сеть> <адрес> <имя> - добавить кошелек\n/report <id> <с_даты> <до_даты> - отчет\n/balance <id> <токен> - баланс");
});

// Список кошельков
bot.onText(/\/wallets/, async (msg) => {
    const { data: wallets } = await axios.get(`${API_BASE_URL}/wallets`);
    let message = "*Ваши кошельки:*\n\n";
    wallets.forEach(w => {
        message += `*ID:* ${w.id}\n*Имя:* ${w.label}\n*Сеть:* ${w.network}\n*Адрес:* \`${w.address}\`\n---\n`;
    });
    bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
});

// Добавление кошелька
bot.onText(/\/add (\S+) (\S+) (.+)/, async (msg, match) => {
    try {
        await axios.post(`${API_BASE_URL}/wallets`, {
            network: match[1].toUpperCase(),
            address: match[2],
            label: match[3]
        });
        bot.sendMessage(msg.chat.id, `Кошелек "${match[3]}" успешно добавлен!`);
    } catch(e) { bot.sendMessage(msg.chat.id, `Ошибка: ${e.response.data.message}`); }
});

// Получение отчета
bot.onText(/\/report (\d+) (\S+) (\S+)/, async (msg, match) => {
    const [_, walletId, startDate, endDate] = match;
    bot.sendMessage(msg.chat.id, 'Минутку, синхронизирую транзакции и готовлю отчет...');
    try {
        const { data } = await axios.post(`${API_BASE_URL}/report`, { walletId, startDate, endDate });
        let reportMessage = `*Отчет по кошельку ID ${walletId}*\nПериод: ${startDate} - ${endDate}\n\n`;
        if (data.count === 0) {
            reportMessage += 'Поступлений не найдено.';
        } else {
            data.transactions.forEach(tx => {
                reportMessage += `— *${parseFloat(tx.amount).toFixed(2)} ${tx.token_symbol}* \n   _${new Date(tx.tx_timestamp).toLocaleString('ru-RU')}_\n`;
            });
            reportMessage += `\n*Всего поступлений: ${parseFloat(data.totalAmount).toFixed(2)} USD*`;
        }
        bot.sendMessage(msg.chat.id, reportMessage, { parse_mode: 'Markdown' });
    } catch (e) { bot.sendMessage(msg.chat.id, `Ошибка: ${e.response.data.message}`); }
});

// Получение баланса
bot.onText(/\/balance (\d+) (\S+)/, async (msg, match) => {
    const [_, walletId, token] = match;
    try {
        const { data } = await axios.get(`${API_BASE_URL}/balance/${walletId}/${token}`);
        bot.sendMessage(msg.chat.id, `Баланс ${token.toUpperCase()} на кошельке ID ${walletId}: *${data.balance.toFixed(4)}*`, { parse_mode: 'Markdown' });
    } catch (e) { bot.sendMessage(msg.chat.id, `Ошибка: ${e.response.data.message}`); }
});

console.log('Бот запущен...');
```

# Шаг 6: Запуск проекта

Первый запуск:

1. Убедитесь, что PostgreSQL запущен и вы создали базу данных.

2. В файле index.js раскомментируйте строку await sequelize.sync({ alter: true });.

3. Запустите сервер: node index.js. Sequelize создаст таблицы в вашей БД.

4. Остановите сервер, закомментируйте строку sequelize.sync() обратно (это нужно делать только при изменении моделей).

Рабочий запуск:

1. Запустите бэкенд: node index.js.

2. В отдельном терминале запустите бота: node bot.js.
