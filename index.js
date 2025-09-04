const express = require("express");
require("dotenv").config();
const { sequelize, Wallet, Transaction, Op } = require("./db");
const { syncWallet, getErc20TokenBalance } = require("./service");

const app = express();
app.use(express.json());

app.post("/api/wallets", async (req, res) => {
  try {
    const newWallet = await Wallet.create(req.body);
    res.status(201).json(newWallet);
  } catch (error) {
    {
      res
        .status(500)
        .json({ error: `Ошибка при создании кошелька: ${error.message}` });
    }
  }
});

app.get("api/wallets", async (req, res) => {
  const wallets = await Wallet.findAll({ order: [["id", "ASC"]] });
  res.json(wallets);
});

app.delete("api/wallets/:id", async (req, res) => {
  await Wallet.destroy({ where: { id: req.params.id } });
  res.status(204).send();
});

app.get("api/balance/:walletId/:token", async (req, res) => {
  try {
    const { walletId, token } = req.params;
    const wallet = await Wallet.findByPk(walletId);
    if (!wallet) return res.status(404).json({ message: "Кошелек не найден" });
    let balance;
    if (wallet.network === "ERC20") {
      balance = await getErc20TokenBalance(wallet.address, token.toUpperCase());
    } else if (wallet.network === "TRC20") {
      balance = await getTrc20TokenBalance(wallet.address, token.toUpperCase());
    } else if (wallet.network === "SOL") {
      balance = await getSolTokenBalance(wallet.address, token.toUpperCase());
    }
    res.json({ balance });
  } catch (error) {
    res
      .status(500)
      .json({ message: `Ошибка при получении баланса: ${error.message}` });
  }
});

app.post("api/report", async (req, res) => {
  const { walletId, startDate, endDate } = req.body;
  try {
    await syncWallet(walletId);
    const result = await Transaction.findAndCountAll({
      where: {
        wallet_id: walletId,
        tx_timestamp: {
          [Op.between]: [new Date(startDate), new Date(endDate)],
        },
        order: [["tx_timestamp", "DESC"]],
      },
    });

    const totalAmount = await Transaction.sum("amount", {
      where: {
        wallet_id: walletId,
        tx_timestamp: {
          [Op.between]: [new Date(startDate), new Date(endDate)],
        },
      },
    });

    res.json({
      transactions: result.rows,
      count: result.count,
      totalAmount: totalAmount || 0,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: `Ошибка при получении отчета: ${error.message}` });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  try {
    await sequelize.autenticate();
    console.log("Соединение с БД установлено");
    await sequelize.sync({ alter: true });
    console.log("Все модели были успешно синхронизированы.");
  } catch (error) {
    console.log("Не удалось подключиться к БД:", error);
  }
});
