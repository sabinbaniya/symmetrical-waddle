import { getInventory } from "../lib/inventory.js";
import SimplifiedItem from "../func/SimplifiedItem.js";
import P2P from "../models/P2P.js";

export const getInventoryController = async (req, res) => {
    try {
        const { appid } = req.query;
        const user = req.user;

        if (!user || !user.steamid) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        if (!appid) {
            return res.status(400).json({ error: "AppID is required" });
        }

        const response = await getInventory(appid, user.steamid);

        if (!response || !response.assets || !response.descriptions) {
            return res.json({ inventory: [] });
        }

        const inventory = [];
        let concurrency = [];
        const concurrencyConstant = 100;

        const addItem = async item => {
            const simplified = await SimplifiedItem(item, response.assets);
            inventory.push(simplified);
        };

        for (let i = 0; i < response.descriptions.length; i++) {
            let item = response.descriptions[i];
            concurrency.push(() => addItem(item));

            if (
                (i !== 0 && i % concurrencyConstant === 0) ||
                i === response.descriptions.length - 1
            ) {
                await Promise.all(concurrency.map(func => func()));
                concurrency = [];
            }
        }

        // Sort descending order
        const sortedInventory = inventory
            .sort((a, b) => {
                try {
                    const aPrice = a.price ? parseFloat(a.price.slice(1, a.price.length)) : 0;
                    const bPrice = b.price ? parseFloat(b.price.slice(1, b.price.length)) : 0;
                    return bPrice - aPrice;
                } catch (e) {
                    return 0;
                }
            })
            .filter(item => item?.price && item?.price !== "$0.00");

        return res.json({ inventory: sortedInventory });
    } catch (e) {
        console.error("GetInventory Error:", e);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

export const getTransactionsController = async (req, res) => {
    try {
        const user = req.user;
        if (!user || !user.steamid) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const { page = 1, limit = 10, sort = "most-recent", search = "" } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const query = { $or: [{ buyer: user.steamid }, { seller: user.steamid }] };

        if (search) {
            query.$or = [
                { status: { $regex: search, $options: "i" } },
                { "item.gun": { $regex: search, $options: "i" } },
                { "item.skin": { $regex: search, $options: "i" } },
            ];
        }

        let sortQuery = { deadline: -1 };
        switch (sort) {
            case "least-recent":
                sortQuery = { deadline: 1 };
                break;
            case "highest-amount":
                sortQuery = { "item.price": -1 };
                break;
            case "lowest-amount":
                sortQuery = { "item.price": 1 };
                break;
        }

        const transactions = await P2P.find(query).skip(skip).limit(limitNum).sort(sortQuery);
        const totalTransactions = await P2P.countDocuments(query);
        const totalPages = Math.ceil(totalTransactions / limitNum);

        return res.json({
            success: true,
            data: {
                transactions: transactions.map(tx => ({
                    _id: tx._id.toString(),
                    buyer: tx.buyer,
                    seller: tx.seller,
                    worth: tx.item.price,
                    status: tx.status,
                    date: new Date(tx.deadline).getTime(),
                })),
                totalTransactions,
                totalPages,
                currentPage: pageNum,
            },
            hasMore: totalPages > pageNum,
        });
    } catch (error) {
        console.error("GetTransactions Error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch transactions" });
    }
};
