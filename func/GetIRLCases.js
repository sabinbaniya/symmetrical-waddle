import irlDB from "../models/IRL.js";

// Memory-based cache
const cache = {
    data: null,
    lastFetch: 0,
    isUpdating: false,
};

const CACHE_DURATION = 60 * 60 * 1000;

function isCacheValid() {
    return cache.data && Date.now() - cache.lastFetch < CACHE_DURATION;
}

function normalizeItems(items) {
    const len = items?.length || 0;
    const fallbackPercent = len ? parseFloat((100 / len).toFixed(2)) : 0;
    return (items || []).map(i => ({
        name: i.name,
        image: i.image,
        price: i.price,
        percentage: typeof i.percentage === "number" ? i.percentage : fallbackPercent,
    }));
}

async function fetchFreshCases() {
    const cases = await irlDB.find();
    cache.data = cases;
    cache.lastFetch = Date.now();
    return cases;
}

export default async function GetIRLCases() {
    let cases;

    if (isCacheValid() && !cache.isUpdating) cases = cache.data;
    else cases = await fetchFreshCases();

    return cases
        .map(c => ({
            id: c.id,
            name: c.name,
            price: c.price,
            items: normalizeItems(c.items),
            spins: c.spins,
        }))
        .reverse();
}


