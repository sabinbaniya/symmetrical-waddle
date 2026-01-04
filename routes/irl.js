import express from "express";
import irlDB from "../models/IRL.js";

const router = express.Router();

// Helper to format case items
const formatItems = items => {
    return (items || []).map(i => {
        const fallback = items.length ? parseFloat((100 / items.length).toFixed(2)) : 0;
        return {
            name: i.name,
            image: i.image,
            price: i.price,
            percentage: Number.isFinite(parseFloat(i.percentage))
                ? parseFloat(i.percentage)
                : fallback,
        };
    });
};

/**
 * GET /api/irl
 * Get all IRL cases
 */
router.get("/", async (req, res) => {
    try {
        const cases = await irlDB.find();

        const formattedCases = cases
            .map(c => {
                return {
                    id: c.id,
                    name: c.name,
                    price: c.price,
                    items: formatItems(c.items),
                    spins: c.spins,
                };
            })
            .reverse();

        return res.json(formattedCases);
    } catch (error) {
        console.error("GET /api/irl error:", error);
        return res.status(500).json({ error: "Failed to fetch IRL cases" });
    }
});

/**
 * GET /api/irl/:id
 * Get a specific IRL case by ID
 */
router.get("/:id", async (req, res) => {
    try {
        let caseID = req.params.id;
        try {
            caseID = decodeURIComponent(caseID?.trim());
        } catch (e) {
            return res.status(400).json({ error: "Invalid case ID" });
        }

        const caseData = await irlDB.findOne({ id: caseID });

        if (!caseData) {
            return res.status(404).json({ error: "IRL Case not found" });
        }

        const formattedCase = {
            id: caseData.id,
            name: caseData.name,
            price: caseData.price,
            items: formatItems(caseData.items).sort(
                (a, b) => (a.percentage || 0) - (b.percentage || 0),
            ),
        };

        return res.json(formattedCase);
    } catch (error) {
        console.error("GET /api/irl/:id error:", error);
        return res.status(500).json({ error: "Failed to fetch IRL case" });
    }
});

export default router;
