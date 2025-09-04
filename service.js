const axios = require("axios");
const { Transaction } = require("./db");
const { token } = require("morgan");

const TOKEN_CONTRACTS = {
  ERC20: {
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  TRC20: {
    USDT: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    USDC: "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8",
  },
  SOL: {
    USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
};

async function getErc20TokenBalance(walletAddress, tokenSymbol) {
  const tokenContract = TOKEN_CONTRACTS.ERC20[tokenSymbol];
  if (!tokenContract) throw new Error("Токен не поддерживается");

  const response = await axios.post(`https://api.etherscan.io/api`, null, {
    params: {
      module: "account",
      action: "tokenbalance",
      contractaddress: tokenContract,
      address: walletAddress,
      tag: "latest",
      apikey: process.env.ETHERSCAN_API_KEY,
    },
  });

  if (response.data.status === "0") {
    throw new Error(
      `Не удалось получить баланс токена. Ошибка: ${response.data.message} `
    );
  }

  return parseFloat(response.data.result) / 1e6;
}

async function fetchAndSaveErc20Transactions(wallet) {
  const apiUrl = `https://api.etherscan.io/api?module=account&action=tokentx&address=${wallet.address}&sort=desc&apikey=${process.env.ETHERSCAN_API_KEY}`;
  const response = await axios.get(apiUrl);
  const transactions = response.data.result;

  for (const tx of transactions) {
    if (tx.to.toLowerCase() !== wallet.address.toLowerCase()) continue;

    const isTrackedToken = Object.values(TOKEN_CONTRACTS.ERC20).includes(
      tx.contractAdress
    );
    if (!isTrackedToken) continue;

    const amount = parseFloat(tx.value) / 10 ** parseInt(tx.tokenDecimal);

    await Transaction.findOrCreate({
      where: { tx_hash: tx.hash },
      defaults: {
        wallet_id: wallet.id,
        amount: amount,
        token_symbol: tx.tokenSymbol,
        from_address: tx.from,
        tx_timestamp: new Date(parseInt(tx.timeStamp) * 1000),
      },
    });
  }
}

async function syncWallet(walletId) {
  const { Wallet } = require("./db");
  const wallet = await Wallet.findByPk(walletId);
  if (!wallet) throw new Error("Кошелек не найден");

  switch (wallet.network) {
    case "ERC20":
      await fetchAndSaveErc20Transactions(wallet);
      break;
    case "TRC20":
      console.log("Синхронизация для TRC20 еще не реализована");
      // await fetchAndSaveTrc20Transactions(wallet);
      break;
    case "SOL":
      console.log("Синхронизация для SOL еще не реализована");
      // await fetchAndSaveSolTransactions(wallet);
      break;
  }
  console.log(`Синхронизация для кошелька ${wallet.label} завершена.`);
}

module.exports = { syncWallet, getErc20TokenBalance };
