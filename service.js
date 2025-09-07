const axios = require("axios");
const { Transaction } = require("./db");
const { token } = require("morgan");
const { Connection, PublicKey } = require("@solana/web3.js");
const { getAssociatedTokenAddress } = require("@solana/spl-token");
const TronWeb = require("tronweb");

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
    USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB ",
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

  if (!Array.isArray(response.data.result)) {
    console.error(
      "Etherscan API не вернул массив транзакций:",
      response.data.message
    );
    return;
  }

  const transactions = response.data.result;

  const trackedAddressesLowerCase = Object.values(TOKEN_CONTRACTS.ERC20).map(
    (addr) => addr.toLowerCase()
  );

  for (const tx of transactions) {
    if (tx.to.toLowerCase() !== wallet.address.toLowerCase()) continue;

    const contractAddressFromTx = tx.contractAddress.toLowerCase();

    const isTrackedToken = trackedAddressesLowerCase.includes(
      contractAddressFromTx
    );

    console.log(
      "Адрес контракта из транзакции:",
      contractAddressFromTx,
      "Это отслеживаемый токен?",
      isTrackedToken
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

async function getTrc20TokenBalance(walletAddress, tokenSymbol) {
  const tokenContract = TOKEN_CONTRACTS.TRC20[tokenSymbol];
  if (!tokenContract) throw new Error("Токен не поддерживается");

  const url = `https://apilist.tronscan.org/api/account?address=${walletAddress}`;
  const response = await axios.get(url);
  console.log(response.data);
  const tokenData = response.data.trc20token_balances.find(
    (t) => t.tokenId === tokenContract
  );
  if (!tokenData) return 0;
  return parseFloat(tokenData.balance) / 10 ** Number(tokenData.tokenDecimal);
}

async function fetchAndSaveTrc20Transactions(wallet) {
  const reverseTrc20Contracts = {};
  for (const symbol in TOKEN_CONTRACTS.TRC20) {
    const address = TOKEN_CONTRACTS.TRC20[symbol];
    reverseTrc20Contracts[address] = symbol;
  }
  const apiUrl = `https://api.trongrid.io/v1/accounts/${wallet.address}/transactions/trc20`;
  const response = await axios.get(apiUrl, {
    params: {
      order_by: "block_timestamp,desc",
    },
    headers: {
      "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY,
    },
  });

  if (!response.data || !response.data.data) {
    console.log("Нет данных о транзакциях TRC20 для кошелька:", wallet.address);
    return;
  }

  const transactions = response.data.data;

  for (const tx of transactions) {
    // Этот эндпоинт возвращает только TRC20, поэтому дополнительная фильтрация не нужна,
    // но мы проверим, что это поступление на наш кошелек
    if (tx.to.toLowerCase() !== wallet.address.toLowerCase()) continue;

    // Ищем символ токена в нашем справочнике по адресу контракта
    const tokenSymbol = reverseTrc20Contracts[tx.token_info.address];

    // Если токен не из нашего списка (не USDT/USDC), пропускаем его
    if (!tokenSymbol) continue;

    // API TronGrid уже дает нам всю нужную информацию
    const amountTokens = parseFloat(tx.value) / 10 ** tx.token_info.decimals;

    await Transaction.findOrCreate({
      where: { tx_hash: tx.transaction_id },
      defaults: {
        wallet_id: wallet.id,
        amount: amountTokens,
        token_symbol: tokenSymbol,
        from_address: tx.from,
        tx_timestamp: new Date(tx.block_timestamp),
      },
    });
  }
}

// Константы токенов USDT/USDC см. выше
async function getSolTokenBalance(walletAddress, tokenSymbol) {
  const connection = new Connection(
    "https://api.mainnet-beta.solana.com",
    "confirmed"
  );
  const tokenMintAddress = TOKEN_CONTRACTS.SOL[tokenSymbol];

  if (!tokenMintAddress) {
    throw new Error("Токен не поддерживается для Solana");
  }

  try {
    const wallet = new PublicKey(walletAddress);
    const tokenMint = new PublicKey(tokenMintAddress);

    // ТЕПЕРЬ ВЫЗОВ СНОВА С 'await'
    const associatedTokenAccountAddress = await getAssociatedTokenAddress(
      tokenMint,
      wallet
    );

    const balance = await connection.getTokenAccountBalance(
      associatedTokenAccountAddress
    );

    return parseFloat(balance.value.uiAmountString);
  } catch (e) {
    if (
      e.message.includes("could not find account") ||
      e.message.includes("Invalid public key")
    ) {
      return 0;
    }
    throw e;
  }
}

// blockchainService.js

// ... (импорты axios, Transaction, и т.д.)
// ... (объект TOKEN_CONTRACTS)

async function fetchAndSaveSolTransactions(wallet) {
  // 1. Создаем обратный справочник, где все ключи (адреса) в НИЖНЕМ РЕГИСТРЕ.
  const reverseSolContracts = {};
  for (const symbol in TOKEN_CONTRACTS.SOL) {
    const mintAddress = TOKEN_CONTRACTS.SOL[symbol];
    // Приводим ключ к нижнему регистру
    reverseSolContracts[mintAddress.trim().toLowerCase()] = symbol;
  }

  // 2. Формируем URL для Helius API
  const heliusApiUrl = `https://api.helius.xyz/v0/addresses/${wallet.address}/transactions?api-key=${process.env.HELIUS_API_KEY}`;
  const response = await axios.get(heliusApiUrl);

  if (!response.data || response.data.length === 0) {
    console.log(
      `Нет данных о транзакциях для кошелька Solana: ${wallet.address}`
    );
    return;
  }

  const transactions = response.data;

  // 3. Перебираем транзакции
  for (const tx of transactions) {
    if (tx.type !== "TRANSFER" || tx.meta?.err) {
      continue;
    }

    for (const transfer of tx.tokenTransfers) {
      // Проверяем, что это поступление на наш кошелек
      if (
        transfer.toUserAccount.toLowerCase() !== wallet.address.toLowerCase()
      ) {
        continue;
      }

      // Приводим адрес из API к нижнему регистру перед поиском
      const mintAddressFromTx = transfer.mint.toLowerCase();

      // Теперь поиск будет успешным, так как обе стороны в нижнем регистре
      const tokenSymbol = reverseSolContracts[mintAddressFromTx];

      console.log(
        "Адрес контракта (минт):",
        mintAddressFromTx,
        "Найденный символ:",
        tokenSymbol
      );

      if (!tokenSymbol) {
        continue;
      }

      const amount = transfer.tokenAmount;

      await Transaction.findOrCreate({
        where: { tx_hash: tx.signature },
        defaults: {
          wallet_id: wallet.id,
          amount: amount,
          token_symbol: tokenSymbol,
          from_address: transfer.fromUserAccount,
          tx_timestamp: new Date(parseInt(tx.timestamp) * 1000),
        },
      });
    }
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
      await fetchAndSaveTrc20Transactions(wallet);
      break;
    case "SOL":
      await fetchAndSaveSolTransactions(wallet);
      break;
  }
  console.log(`Синхронизация для кошелька ${wallet.label} завершена.`);
}

module.exports = {
  syncWallet,
  getErc20TokenBalance,
  getSolTokenBalance,
  getTrc20TokenBalance,
};
