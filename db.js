const { Sequelize, DataTypes, Op } = require("sequelize");
require("dotenv").config();

const sequelize = new Sequelize(proccess.env.DATABASE_URL, {
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
