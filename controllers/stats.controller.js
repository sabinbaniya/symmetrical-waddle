import Games from "../models/Games.js";
import MinesGame from "../models/MinesGame.js";
import Gameplays from "../models/Gameplays.js";
import CryptoDeposits from "../models/Deposits/Crypto.js";
import CryptoWithdraws from "../models/Withdraws/Crypto.js";
import GiftcardDeposits from "../models/Deposits/Giftcard.js";
import P2P from "../models/P2P.js";

// --- Profile Stats Helpers ---
const getWagerAmount = async userId => {
    const result = await Games.aggregate([
        { $match: { user: userId } },
        { $group: { _id: null, total: { $sum: "$wager" } } },
    ]);
    return result?.[0]?.total || 0;
};

const getEarningAmount = async userId => {
    const result = await Games.aggregate([
        { $match: { user: userId } },
        { $group: { _id: null, total: { $sum: "$earning" } } },
    ]);
    return result?.[0]?.total || 0;
};

const getDepositAmount = async userId => {
    const crypto = await CryptoDeposits.aggregate([
        { $match: { userId: userId } },
        { $group: { _id: null, total: { $sum: "$usdAmount" } } },
    ]);
    const p2p = await P2P.aggregate([
        { $match: { seller: userId } },
        { $group: { _id: null, total: { $sum: "$item.price" } } },
    ]);
    const giftcard = await GiftcardDeposits.aggregate([
        { $match: { userId: userId } },
        { $group: { _id: null, total: { $sum: "$usdAmount" } } },
    ]);

    return (crypto?.[0]?.total || 0) + (p2p?.[0]?.total || 0) + (giftcard?.[0]?.total || 0);
};

const getWithdrawAmount = async userId => {
    const crypto = await CryptoWithdraws.aggregate([
        { $match: { userId: userId } },
        { $group: { _id: null, total: { $sum: "$usdAmount" } } },
    ]);
    const p2p = await P2P.aggregate([
        { $match: { buyer: userId } },
        { $group: { _id: null, total: { $sum: "$item.price" } } },
    ]);

    return (crypto?.[0]?.total || 0) + (p2p?.[0]?.total || 0);
};

// --- Controllers ---

export const getProfileStatsController = async (req, res) => {
    try {
        const user = req.user;
        if (!user || !user.steamid) return res.status(401).json({ error: "Unauthorized" });

        const [wagerAmount, earningAmount, depositAmount, withdrawAmount] = await Promise.all([
            getWagerAmount(user._id),
            getEarningAmount(user._id),
            getDepositAmount(user._id),
            getWithdrawAmount(user._id),
        ]);

        return res.json({
            wagerAmount,
            earningAmount,
            depositAmount,
            withdrawAmount,
        });
    } catch (e) {
        console.error("GetProfileStats Error:", e);
        return res.status(500).json({ error: "Failed to fetch profile stats" });
    }
};

export const getGameHistoryController = async (req, res) => {
    try {
        const user = req.user;
        if (!user || !user.steamid)
            return res.status(401).json({ success: false, message: "Unauthorized" });

        const { page = 1, limit = 10, sort = "most-recent", search = "" } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const query = { user: user.steamid };
        if (search) {
            query.game = { $regex: search, $options: "i" };
        }

        let sortQuery = { date: -1 };
        switch (sort) {
            case "least-recent":
                sortQuery = { date: 1 };
                break;
            case "most-earned":
                sortQuery = { earning: -1 };
                break;
            case "least-earned":
                sortQuery = { earning: 1 };
                break;
        }

        const games = await Games.find(query).skip(skip).limit(limitNum).sort(sortQuery);
        const totalGames = await Games.countDocuments(query);
        const totalPages = Math.ceil(totalGames / limitNum);

        return res.json({
            success: true,
            data: {
                games: games.map(game => ({
                    game: game.game,
                    wager: game.wager,
                    earning: game.earning,
                    multiplier: game.multiplier,
                    date: new Date(game.date).getTime(),
                })),
                totalGames,
                totalPages,
                currentPage: pageNum,
            },
            hasMore: totalPages > pageNum,
        });
    } catch (error) {
        console.error("GetGameHistory Error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch games" });
    }
};

export const getPaymentsController = async (req, res) => {
    try {
        const user = req.user;
        if (!user || !user.steamid)
            return res.status(401).json({ success: false, message: "Unauthorized" });

        const { page = 1, limit = 10, sort = "most-recent", search = "", type = "all" } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const baseQuery = { steamid: user.steamid };
        if (search) {
            baseQuery.$or = [
                { chain: { $regex: search, $options: "i" } },
                { asset: { $regex: search, $options: "i" } },
                { txhash: { $regex: search, $options: "i" } },
            ];
        }

        let payments = [];
        let totalPayments = 0;

        if (type === "all" || type === "deposits") {
            const deposits = await CryptoDeposits.find(baseQuery).lean();
            payments = payments.concat(deposits.map(d => ({ ...d, type: "deposit" })));
            totalPayments += await CryptoDeposits.countDocuments(baseQuery);
        }

        if (type === "all" || type === "withdraws") {
            const withdraws = await CryptoWithdraws.find(baseQuery).lean();
            payments = payments.concat(withdraws.map(w => ({ ...w, type: "withdraw" })));
            totalPayments += await CryptoWithdraws.countDocuments(baseQuery);
        }

        payments.sort((a, b) => {
            const aValue = sort.includes("amount") ? a.usdAmount : new Date(a.date).getTime();
            const bValue = sort.includes("amount") ? b.usdAmount : new Date(b.date).getTime();
            return sort.includes("least") || sort.includes("lowest")
                ? aValue - bValue
                : bValue - aValue;
        });

        const paginatedPayments = payments.slice(skip, skip + limitNum);
        const totalPages = Math.ceil(totalPayments / limitNum);

        return res.json({
            success: true,
            data: {
                payments: paginatedPayments.map(payment => ({
                    _id: payment._id.toString(),
                    type: payment.type,
                    chain: payment.chain,
                    asset: payment.asset,
                    amount: payment.amount,
                    usdAmount: payment.usdAmount,
                    txhash: payment.txhash,
                    to: payment.to,
                    date: new Date(payment.date).getTime(),
                })),
                totalPayments,
                totalPages,
                currentPage: pageNum,
            },
            hasMore: totalPages > pageNum,
        });
    } catch (error) {
        console.error("GetPayments Error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch payments" });
    }
};

export const getFairnessController = async (req, res) => {
    try {
        const user = req.user;
        if (!user || !user.steamid)
            return res.status(401).json({ success: false, message: "Unauthorized" });

        const { page = 1, limit = 10, sort = "most-recent", search = "", game = "all" } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        // Build queries
        const minesQuery = {
            userID: user.steamid,
            status: { $in: ["completed", "lost", "abandoned"] },
        };
        const gamesQuery = { user: user.steamid };
        const battlesQuery = { participants: user._id, status: "finished" };

        if (search) {
            const regex = { $regex: search, $options: "i" };
            minesQuery.$or = [
                { "pf.serverSeedCommitment": regex },
                { "pf.clientSeed": regex },
                { "pf.nonce": regex },
            ];
            gamesQuery.$or = [
                { "pf.serverSeedCommitment": regex },
                { "pf.clientSeed": regex },
                { "pf.nonce": regex },
                { "pf.publicSeed": regex },
            ];
            battlesQuery.$or = [{ "pf.serverSeedCommitment": regex }, { "pf.publicSeed": regex }];
        }

        const minesSort = { completedAt: sort === "least-recent" ? 1 : -1 };
        const gamesSort = { date: sort === "least-recent" ? 1 : -1 };

        const [
            minesDocs,
            minesTotal,
            gameDocs,
            gamesTotal,
            battleDocs,
            battlesTotal,
            gamesBattlesDocs,
        ] = await Promise.all([
            MinesGame.find(minesQuery)
                .select("pf completedAt createdAt betAmount payout status userID")
                .sort(minesSort)
                .lean(),
            MinesGame.countDocuments(minesQuery),
            Games.find(gamesQuery).select("pf date earning wager game user").sort(gamesSort).lean(),
            Games.countDocuments(gamesQuery),
            Gameplays.find(battlesQuery).sort(gamesSort).lean(),
            Gameplays.countDocuments(battlesQuery),
            Games.find({ user: user._id, game: "Battles" }) // This seems redundant if gamesQuery covers it, but reused logic
                .select("pf date earning wager game user")
                .sort(gamesSort)
                .lean(),
        ]);

        // Map to unified items
        const mappedMines = minesDocs.map(d => ({
            id: String(d._id),
            game: "mines",
            betAmount: d.betAmount ?? null,
            payout: d.payout ?? null,
            status: d.status ?? null,
            completedAt:
                d.completedAt || d.createdAt
                    ? new Date(d.completedAt || d.createdAt).getTime()
                    : null,
            pf: {
                serverSeedCommitment: d?.pf?.serverSeedCommitment ?? null,
                serverSeed: d?.pf?.serverSeed ?? null,
                clientSeed: d?.pf?.clientSeed ?? null,
                nonce: d?.pf?.nonce ?? null,
                publicSeed: d?.pf?.publicSeed ?? null,
                round: d?.pf?.round ?? null,
            },
        }));

        const mappedGames = gameDocs.map(d => ({
            id: String(d._id),
            game: d.game,
            betAmount: d.wager ?? null,
            payout: d.earning ?? null,
            status: null,
            completedAt: d.date ? new Date(d.date).getTime() : null,
            pf: {
                serverSeedCommitment: d?.pf?.serverSeedCommitment ?? null,
                serverSeed: d?.pf?.serverSeed ?? null,
                clientSeed: d?.pf?.clientSeed ?? null,
                nonce: d?.pf?.nonce ?? null,
                publicSeed: d?.pf?.publicSeed ?? null,
            },
        }));

        const mappedBattles = battleDocs.map(d => ({
            id: String(d._id),
            game: "Battles",
            betAmount: d.cost ?? null,
            payout:
                Array.isArray(d.earnings) && d.participants
                    ? (d.earnings[d.participants.findIndex(p => p.toString() === user._id.toString())] ?? null)
                    : null,
            status: null,
            completedAt: d.date ? new Date(d.date).getTime() : null,
            pf: {
                serverSeedCommitment: d?.pf?.serverSeedCommitment ?? null,
                serverSeed: d?.pf?.serverSeed ?? null,
                clientSeed: null,
                nonce: null,
                publicSeed: d?.pf?.publicSeed ?? null,
                round: (d?.round || 1) - 1,
            },
        }));

        const mappedBattlesFromGames = gamesBattlesDocs.map(d => ({
            id: String(d._id),
            game: d.game,
            betAmount: d.wager ?? null,
            payout: d.earning ?? null,
            status: null,
            completedAt: d.date ? new Date(d.date).getTime() : null,
            pf: {
                serverSeedCommitment: d?.pf?.serverSeedCommitment ?? null,
                serverSeed: d?.pf?.serverSeed ?? null,
                clientSeed: d?.pf?.clientSeed ?? null,
                nonce: d?.pf?.nonce ?? null,
                publicSeed: d?.pf?.publicSeed ?? null,
                round: d?.pf?.round ?? null,
            },
        }));

        const mergedRaw = [
            ...mappedMines,
            ...mappedGames,
            ...mappedBattles,
            ...mappedBattlesFromGames,
        ];
        const seen = new Set();
        const merged = mergedRaw
            .filter(it => {
                const key = `${it.game}|${it.pf?.serverSeedCommitment || ""}|${it.completedAt || 0}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .sort((a, b) =>
                sort === "least-recent"
                    ? a.completedAt - b.completedAt
                    : b.completedAt - a.completedAt,
            );

        const total = minesTotal + gamesTotal + battlesTotal || 0;
        const totalPages = Math.ceil(total / limitNum) || 1;
        const items = merged.slice(skip, skip + limitNum);

        return res.json({
            success: true,
            data: {
                items,
                total,
                totalPages,
                currentPage: pageNum,
            },
        });
    } catch (error) {
        console.error("GetFairness Error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch fairness data" });
    }
};
