/**
 * One-off migration script to randomly assign images and categories
 * to all cases in the database.
 *
 * - Images from /community  → category: "community"
 * - Images from /featured   → category: "official"
 *
 * Usage:  node scripts/assign-case-images.js
 */

import "dotenv/config";
import mongoose from "mongoose";
import Cases from "../models/Cases.js";

// ── Image pools ────────────────────────────────────────────────
const communityImages = [
    "blue-orange.png",
    "blue-red.png",
    "blue-violet.png",
    "blue.png",
    "green.png",
    "orange.png",
    "red-orange.png",
    "red.png",
    "teal-blue.png",
    "teal-violet.png",
    "teal.png",
    "violet.png",
];

const featuredImages = [
    "apple-one-percent.png",
    "chanel.png",
    "dior.png",
    "dubai-dream.png",
    "end-game.png",
    "ferrari.png",
    "girls-night.png",
    "nike.png",
    "pokemon.png",
    "porsche.png",
    "tech-titan.png",
    "wrist-flex.png",
];

// ── Helpers ────────────────────────────────────────────────────
function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomImageAndCategory() {
    // 50/50 chance of community vs featured
    if (Math.random() < 0.5) {
        const file = pickRandom(communityImages);
        return { image: `/cases/community/${file}`, category: "community" };
    } else {
        const file = pickRandom(featuredImages);
        return { image: `/cases/featured/${file}`, category: "official" };
    }
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const cases = await Cases.find({});
    console.log(`📦 Found ${cases.length} cases to update`);

    let updated = 0;
    for (const c of cases) {
        const { image, category } = getRandomImageAndCategory();
        await Cases.updateOne(
            { _id: c._id },
            { $set: { image, category } },
        );
        updated++;
        console.log(`  → [${updated}/${cases.length}] "${c.name}" → ${category} | ${image}`);
    }

    console.log(`\n✅ Done — updated ${updated} case(s).`);
    await mongoose.disconnect();
}

main().catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
});
