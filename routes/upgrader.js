import express from "express";
import GetItems from "../func/GetItems.js";
import GetItemPrice from "../func/GetItemPrice.js";
import inventoryDB from "../models/Inventory.js";
import { formatPrice } from "../lib/helpers.js";

const router = express.Router();

const NEXT_PRICE_FETCH = 1000 * 60 * 60 * 12; // 12 hours
const CONCURRENCY_LIMIT = 100;

/**
 * GET /upgrader/items
 * Get all inventory items with caching
 * Returns all items sorted by price descending
 */
router.get("/items", async (req, res) => {
    try {
        const items = await GetItems();
        return res.json(items);
    } catch (error) {
        console.error("GET /upgrader/items error:", error);
        return res.status(500).json({ error: "Failed to fetch items" });
    }
});

/**
 * GET /upgrader/items/pagination
 * Get items with pagination, search, and sorting
 * Query params:
 *   - page: number (default: 1)
 *   - limit: number (default: 18)
 *   - sort: "Ascending" | "Descending" (default: "Descending")
 *   - search: string (default: "")
 */
router.get("/items/pagination", async (req, res) => {
    try {
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 18);
        const sort = req.query.sort === "Ascending" ? "Ascending" : "Descending";
        const search = (req.query.search || "").toString().trim().toLowerCase();

        const inventory = await inventoryDB.find();

        let items = inventory
            .filter(i => i.price && formatPrice(i.price) > 0)
            .map(i => ({
                appid: i.appid,
                marketHashName: i.marketHashName,
                gunName: i.gunName,
                skinName: i.skinName,
                image: i.image,
                price: i.price,
                nextPriceFetch: i.nextPriceFetch,
            }));

        // Apply search filter
        if (search) {
            items = items.filter(i =>
                [i.gunName, i.skinName].join(" ").toLowerCase().includes(search),
            );
        }

        // Apply sorting
        items.sort((a, b) => {
            const ap = formatPrice(a.price);
            const bp = formatPrice(b.price);
            return sort === "Ascending" ? ap - bp : bp - ap;
        });

        // Calculate pagination
        const totalItems = items.length;
        const totalPages = Math.ceil(totalItems / limit) || 1;
        const currentPage = Math.min(Math.max(1, page), totalPages);
        const start = (currentPage - 1) * limit;
        const paged = items.slice(start, start + limit);

        return res.json({
            items: paged,
            pagination: {
                currentPage,
                totalPages,
                totalItems,
                hasNextPage: currentPage < totalPages,
                hasPrevPage: currentPage > 1,
                limit,
            },
        });
    } catch (error) {
        console.error("GET /upgrader/items/pagination error:", error);
        return res.status(500).json({ error: "Failed to fetch items" });
    }
});

/**
 * POST /upgrader/items/update-prices
 * Update item prices from Steam market
 * Processes items in batches to avoid rate limiting
 */
// router.post("/items/update-prices", async (req, res) => {
//     try {
//         const inventory = await inventoryDB.find();

//         // Filter items that need price updates
//         const itemsToUpdate = inventory.filter(item => {
//             if (item?.customPrice) return false;
//             const nextPriceFetch = item?.nextPriceFetch;
//             const isNull = item.price === null;
//             return Date.now() > nextPriceFetch || isNull;
//         });

//         let updatedCount = 0;

//         // Process in batches of CONCURRENCY_LIMIT
//         for (let i = 0; i < itemsToUpdate.length; i += CONCURRENCY_LIMIT) {
//             const chunk = itemsToUpdate.slice(i, i + CONCURRENCY_LIMIT);

//             await Promise.all(
//                 chunk.map(async item => {
//                     try {
//                         const price = await GetItemPrice(item.appid, item.marketHashName);
//                         item.price = price;

//                         if (price) {
//                             item.nextPriceFetch = Date.now() + NEXT_PRICE_FETCH;
//                         }

//                         await inventoryDB.updateOne(
//                             { marketHashName: item.marketHashName },
//                             { price: item.price, nextPriceFetch: item.nextPriceFetch },
//                         );

//                         updatedCount++;
//                     } catch (e) {
//                         console.error(`Error updating ${item.marketHashName}:`, e);
//                     }
//                 }),
//             );
//         }

//         return res.json({
//             status: true,
//             message: `Updated ${updatedCount} items`,
//             totalChecked: itemsToUpdate.length,
//         });
//     } catch (error) {
//         console.error("POST /upgrader/items/update-prices error:", error);
//         return res.status(500).json({
//             status: false,
//             message: "Failed to update item prices",
//         });
//     }
// });

export default router;
