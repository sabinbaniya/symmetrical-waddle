import express from "express";
import GetCase from "../func/GetCase.js";
import GetCases from "../func/GetCases.js";
import casesDB from "../models/Cases.js";
import { GetUserByCookie } from "../func/GetUserByCookie.js";
import GetItems from "../func/GetItems.js";
import { calculateCasePrice, expToLevel } from "../lib/helpers.js";

const router = express.Router();

/**
 * GET /api/cases
 * Get all cases with optional filtering
 * Query params:
 *   - type: "all" | true | false (default: false)
 *     - false: regular cases (excluding Level cases and free-case)
 *     - true: Level cases only
 *     - "all": all cases
 */
router.get("/", async (req, res) => {
    try {
        const caseType =
            req.query.type === "true" ? true : req.query.type === "all" ? "all" : false;
        const cases = await GetCases(caseType);
        return res.json(cases);
    } catch (error) {
        console.error("GET /api/cases error:", error);
        return res.status(500).json({ error: "Failed to fetch cases" });
    }
});

/**
 * GET /api/cases/pagination
 * Get cases with pagination and filtering
 * Query params:
 *   - caseType: true | false | "all" (default: false)
 *   - page: number (default: 1)
 *   - limit: number (default: 10)
 *   - type: "cs2" | "rust" | "all" (default: "all")
 *   - search: string (default: "")
 *   - sort: "Most Recent" | "Price Descending" | "Price Ascending" | "Oldest" (default: "Most Recent")
 */
router.get("/pagination", async (req, res) => {
    try {
        const caseTypeOpt =
            req.query.caseType === "true" ? true : req.query.caseType === "all" ? "all" : false;
        const currentPage = Number(req.query.page ?? 1);
        const perPage = Number(req.query.limit ?? 10);
        const selectedType = req.query.type ?? "all";
        const searchTerm = req.query.search ?? "";
        const sortOption = req.query.sort ?? "Most Recent";

        const andConditions = [];
        if (selectedType === "cs2" || selectedType === "rust") {
            andConditions.push({ type: selectedType });
        }
        if (caseTypeOpt === true) {
            andConditions.push({ name: { $regex: /Level/i } });
        } else if (caseTypeOpt === false) {
            andConditions.push({ name: { $not: /Level/i } });
            andConditions.push({ id: { $ne: "free-case" } });
        }
        if (searchTerm && typeof searchTerm === "string") {
            const esc = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            andConditions.push({ name: { $regex: new RegExp(esc, "i") } });
        }

        const query = andConditions.length ? { $and: andConditions } : {};

        const skip = (currentPage - 1) * perPage;
        const totalCases = await casesDB.countDocuments(query);

        let mongoSort = { _id: -1 };
        if (sortOption === "Price Descending") mongoSort = { price: -1 };
        else if (sortOption === "Price Ascending") mongoSort = { price: 1 };
        else if (sortOption === "Oldest") mongoSort = { _id: 1 };

        let cases = await casesDB.find(query).sort(mongoSort).skip(skip).limit(perPage);

        const filteredCases = cases.map(c => ({
            id: c.id,
            name: c.name,
            price: c.price,
            creator: c.creator,
            items: c.items.map(i => ({
                appid: i.appid,
                marketHashName: i.marketHashName,
                gunName: i.gunName,
                skinName: i.skinName,
                image: i.image,
                price: i.price,
                nextPriceFetch: i.nextPriceFetch,
                percentage: i.percentage,
            })),
            spins: c.spins,
            type: c.type,
        }));

        const totalPages = Math.ceil(totalCases / perPage);

        return res.json({
            cases: filteredCases,
            pagination: {
                currentPage: currentPage,
                totalPages,
                totalItems: totalCases,
                hasNextPage: currentPage < totalPages,
                hasPrevPage: currentPage > 1,
                limit: perPage,
            },
        });
    } catch (error) {
        console.error("GET /api/cases/pagination error:", error);
        return res.status(500).json({ error: "Failed to fetch cases" });
    }
});

/**
 * GET /api/cases/free
 * Get the free case
 */
router.get("/free", async (req, res) => {
    try {
        let freeCase = await casesDB.findOne({ id: "free-case" });

        if (!freeCase) return res.status(404).json({ error: "Free case not found" });

        return res.json({
            id: freeCase.id,
            name: freeCase.name,
            price: freeCase.price,
            items: freeCase.items.map(i => ({
                appid: i.appid,
                marketHashName: i.marketHashName,
                gunName: i.gunName,
                skinName: i.skinName,
                image: i.image,
                price: i.price,
                nextPriceFetch: i.nextPriceFetch,
                percentage: i.percentage,
            })),
        });
    } catch (error) {
        console.error("GET /api/cases/free error:", error);
        return res.status(500).json({ error: "Failed to fetch free case" });
    }
});

/**
 * GET /api/cases/:caseID
 * Get a specific case by ID
 */
router.get("/:caseID", async (req, res) => {
    try {
        const caseData = await GetCase(req.params.caseID);
        if (!caseData) {
            return res.status(404).json({ error: "Case not found" });
        }
        return res.json(caseData);
    } catch (error) {
        console.error("GET /api/cases/:caseID error:", error);
        return res.status(500).json({ error: "Failed to fetch case" });
    }
});

/**
 * POST /api/cases/create
 * Create a new case
 * Body:
 *   - name: string
 *   - items: Array<{ marketHashName: string, percentage: number }>
 */
router.post("/create", async (req, res) => {
    try {
        const cookie = req.cookies["connect.sid"];
        const user = await GetUserByCookie(cookie);

        if (!user?._id) {
            return res
                .status(401)
                .json({ status: false, message: "You must be logged in to create a case" });
        }

        if (expToLevel(user.experience) < 25) {
            return res.status(403).json({
                status: false,
                message: "You must be at least level 25 to create a case",
            });
        }

        let { name, items } = req.body;

        if (!name || !items) {
            return res.status(400).json({ status: false, message: "Missing required fields" });
        }

        name = name.trim();

        if (name.toLowerCase().startsWith("level"))
            return res
                .status(400)
                .json({ status: false, message: "Case name cannot start with 'level'" });
        if (name.toLowerCase().startsWith("free"))
            return res
                .status(400)
                .json({ status: false, message: "Case name cannot start with 'free'" });
        if (name.length < 3)
            return res
                .status(400)
                .json({ status: false, message: "Case name must be at least 3 characters long" });
        if (name.length > 32)
            return res
                .status(400)
                .json({ status: false, message: "Case name must be less than 32 characters long" });
        if (items.length < 2)
            return res
                .status(400)
                .json({ status: false, message: "You must select at least two items" });

        try {
            items = items.map(item => ({
                marketHashName: item.marketHashName,
                percentage: Math.round(item.percentage * 100) / 100, // Round to 2 decimal places
            }));
        } catch (error) {
            return res.status(400).json({ status: false, message: "Invalid item format" });
        }

        let totalPercentage = 0;
        for (const item of items) {
            if (!item.marketHashName || !item.percentage)
                return res.status(400).json({
                    status: false,
                    message: "Each item must have a percentage",
                });
            if (
                typeof item.percentage !== "number" ||
                item.percentage <= 0 ||
                item.percentage > 100
            )
                return res
                    .status(400)
                    .json({
                        status: false,
                        message: "Percentage must be a number between 0 and 100",
                    });

            totalPercentage += item.percentage;
        }

        if (totalPercentage !== 100)
            return res
                .status(400)
                .json({ status: false, message: "Total percentage must equal 100%" });

        const itemsInventory = await GetItems();
        const selectedItems = itemsInventory.filter(
            item => items.map(i => i.marketHashName).includes(item.marketHashName) && item.price,
        );

        if (selectedItems.length === 0)
            return res.status(400).json({ status: false, message: "No valid items selected" });

        const price = calculateCasePrice(
            selectedItems.map(item => ({
                price: parseFloat(item.price.replace("$", "")),
                percentage: items.find(i => i.marketHashName === item.marketHashName).percentage,
            })),
        );

        // Check if a case with the same name already exists
        const cases = await GetCases("all");

        if (cases.some(case_ => case_.name.toLowerCase() === name.toLowerCase()))
            return res
                .status(400)
                .json({ status: false, message: "A case with this name already exists" });

        // Check if user has more than 50 cases
        if (cases.filter(case_ => case_.creator === user._id.toString()).length >= 50)
            return res
                .status(400)
                .json({ status: false, message: "You can only create up to 50 cases" });

        // Helper function to determine case type
        function findCaseType(items) {
            let currentType = null;

            for (let item of items) {
                if (currentType === null) {
                    currentType = item.appid;
                    continue;
                }

                if (currentType !== item.appid) {
                    return "mixed";
                }
            }

            switch (currentType) {
                case 730:
                    return "cs2";
                case 252490:
                    return "rust";
            }

            return "mixed";
        }

        const selectedItemsFormatted = selectedItems.map(item => ({
            appid: item.appid,
            marketHashName: item.marketHashName,
            gunName: item.gunName,
            skinName: item.skinName,
            image: item.image,
            price: item.price,
            nextPriceFetch: item.nextPriceFetch,
            percentage: items.find(i => i.marketHashName === item.marketHashName).percentage,
        }));

        // Create the case
        const newCaseObj = {
            id: name.toLowerCase().replace(/ /g, "-"),
            name,
            price,
            creator: user._id,
            items: selectedItemsFormatted,
            type: findCaseType(selectedItemsFormatted),
            usedBalanceType: user.activeBalanceType,
        };

        const newCase = new casesDB(newCaseObj);
        await newCase.save();

        return res.json({
            status: true,
            id: newCaseObj.id,
        });
    } catch (error) {
        console.error("POST /api/cases/create error:", error);
        return res.status(500).json({ status: false, message: "Failed to create case" });
    }
});

export default router;
