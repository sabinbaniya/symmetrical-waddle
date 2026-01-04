// Simple in-memory cache
const inventoryCache = new Map();

function generateCacheKey(appid, steamid) {
    return `${appid}:${steamid}`;
}

function isCacheValid(entry) {
    const now = Date.now();
    return entry && now < entry.expiry;
}

export async function getCombinedInventory(steamid) {
    const cs2 = async () => {
        return await getInventory(730, steamid);
    };
    const rust = async () => {
        return await getInventory(252490, steamid);
    };

    const responses = await Promise.all([cs2(), rust()]);

    let inventory = { assets: [], descriptions: [] };

    for (const response of responses) {
        if (!response || !response.assets || !response.descriptions) continue;

        inventory.assets = [...inventory.assets, ...response.assets];
        inventory.descriptions = [...inventory.descriptions, ...response.descriptions];
    }

    return { inventory };
}

export async function getInventory(appid, steamid) {
    const cacheKey = generateCacheKey(appid, steamid);
    const cached = inventoryCache.get(cacheKey);

    if (isCacheValid(cached)) {
        return cached.data;
    }

    const res = await fetch(`https://steamcommunity.com/inventory/${steamid}/${appid}/2?l=english`);

    if (!res.ok) {
        throw new Error(`Failed to fetch inventory for appid ${appid}`);
    }

    const inventory = await res.json();

    // Cache for 1 hours
    inventoryCache.set(cacheKey, {
        data: inventory,
        expiry: Date.now() + 1000 * 60 * 60 * 6,
    });

    return inventory;
}
