const { Sequelize, DataTypes, Op } = require("sequelize");
require("dotenv").config();

const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  port: DB_PORT,
  dialect: "postgres",
  logging: false,
});

const Wallet = sequelize.define(
  "Wallet",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    address: { type: DataTypes.STRING, allowNull: false },
    network: { type: DataTypes.STRING, allowNull: false },
    label: { type: DataTypes.STRING, allowNull: false, unique: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  { tableName: "wallets", timestamps: false }
);

const Transaction = sequelize.define(
  "Transaction",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tx_hash: { type: DataTypes.STRING, allowNull: false, unique: true },
    amount: { type: DataTypes.DECIMAL(30, 8), allowNull: false },
    token_symbol: { type: DataTypes.STRING, allowNull: false },
    from_address: { type: DataTypes.STRING, allowNull: false },
    tx_timestamp: { type: DataTypes.DATE, allowNull: false },
  },
  { tableName: "transactions", timestamps: false }
);

Wallet.hasMany(Transaction, { foreignKey: "wallet_id" });
Transaction.belongsTo(Wallet, { foreignKey: "wallet_id" });

moddule.exports = {
  sequelize,
  Wallet,
  Transaction,
  Op,
};
