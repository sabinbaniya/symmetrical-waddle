import p2ps from "../models/P2P.js";
import gamesDB from "../models/Games.js";
import cryptoDepositsDB from "../models/Deposits/Crypto.js";
import cryptoWithdrawsDB from "../models/Withdraws/Crypto.js";
import giftcardDepositsDB from "../models/Deposits/Giftcard.js";

export default class Stats {
    static async getWagerAmount(userID) {
        const wagerAmount =
            (
                await gamesDB.aggregate([
                    { $match: { user: userID } },
                    { $group: { _id: null, total: { $sum: "$wager" } } },
                ])
            )?.[0]?.total || 0;

        return wagerAmount;
    }

    static async getEarningAmount(userID) {
        const earningAmount =
            (
                await gamesDB.aggregate([
                    { $match: { user: userID } },
                    { $group: { _id: null, total: { $sum: "$earning" } } },
                ])
            )?.[0]?.total || 0;

        return earningAmount;
    }

    static async getDepositAmount(userID) {
        const cryptoDepositAmount =
            (
                await cryptoDepositsDB.aggregate([
                    { $match: { steamid: userID } },
                    { $group: { _id: null, total: { $sum: "$usdAmount" } } },
                ])
            )?.[0]?.total || 0;

        const p2pDepositAmount =
            (
                await p2ps.aggregate([
                    { $match: { seller: userID } },
                    { $group: { _id: null, total: { $sum: "$item.price" } } },
                ])
            )?.[0]?.total || 0;

        const giftcardDepositAmount =
            (
                await giftcardDepositsDB.aggregate([
                    { $match: { steamid: userID } },
                    { $group: { _id: null, total: { $sum: "$usdAmount" } } },
                ])
            )?.[0]?.total || 0;

        return p2pDepositAmount + cryptoDepositAmount + giftcardDepositAmount;
    }

    static async getWithdrawAmount(userID) {
        const cryptoWithdrawAmount =
            (
                await cryptoWithdrawsDB.aggregate([
                    { $match: { steamid: userID } },
                    { $group: { _id: null, total: { $sum: "$usdAmount" } } },
                ])
            )?.[0]?.total || 0;

        const p2pWithdrawAmount =
            (
                await p2ps.aggregate([
                    { $match: { buyer: userID } },
                    { $group: { _id: null, total: { $sum: "$item.price" } } },
                ])
            )?.[0]?.total || 0;

        return p2pWithdrawAmount + cryptoWithdrawAmount;
    }
}
