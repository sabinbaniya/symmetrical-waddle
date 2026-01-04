"use server";

import casesDB from "../models/Cases.js";

// Memory-based cache
const cache = {
    data: null,
    lastFetch: 0,
    isUpdating: false,
};

const CACHE_DURATION = 60 * 60 * 1000;

// Helper function to check if cache is valid
function isCacheValid() {
    return cache.data && Date.now() - cache.lastFetch < CACHE_DURATION;
}

// Helper function to format cases data
function formatCasesData(cases, caseType) {
    return cases
        .map(c => {
            if (
                (caseType === false && !c.name.includes("Level") && c.id !== "free-case") ||
                (caseType === true && c.name.includes("Level")) ||
                caseType === "all"
            ) {
                return {
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
                };
            }
        })
        .filter(c => c)
        .reverse();
}

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

    return "mixed"; // Never reached, but added for completeness
}

// Helper function to fetch fresh data from database
async function fetchFreshCases() {
    const cases = await casesDB.find();

    // Case filter check
    if (cases.some(c => !c?.type)) {
        const untypedCases = cases.filter(c => !c?.type);

        for (const c of untypedCases) {
            console.warn(`Case ${c.id} is missing type`);
            c.type = findCaseType(c.items);
            await casesDB.updateOne({ id: c.id }, { $set: { type: c.type } });
        }
    }

    // Update cache
    cache.data = cases;
    cache.lastFetch = Date.now();

    return cases;
}

export default async function GetCases(caseType = false, forceUpdate = false) {
    let cases;

    // Return cached data if valid and not currently updating
    if (isCacheValid() && !cache.isUpdating && !forceUpdate) {
        cases = cache.data;
    } else {
        // Fetch fresh data
        cases = await fetchFreshCases();
    }

    return formatCasesData(cases, caseType);
}
