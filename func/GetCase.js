import GetCases from "./GetCases.js";
import UpdateCaseItemPrices from "./UpdateCaseItemPrices.js";

// In-memory cache
const caseCache = new Map();

function isCacheValid(entry) {
    const now = Date.now();
    return entry && now < entry.expiry;
}

const CACHE_TTL = 1000 * 60 * 60;

export default async function GetCase(caseID, force = false) {
    try {
        caseID = decodeURIComponent(caseID?.trim());
    } catch (e) {
        return null;
    }

    // Check cache
    const cached = caseCache.get(caseID);
    if (isCacheValid(cached)) {
        return cached.data;
    }

    const cases = await GetCases("all", null, force);

    for (let case_ of cases) {
        if (case_.id === caseID) {
            // Check if all items have a price
            const doesContainNull = case_.items.some(item => !item.price);

            if (doesContainNull) {
                case_ = await UpdateCaseItemPrices(caseID);
            }

            const result = {
                id: case_.id,
                name: case_.name,
                category: case_.category,
                price: case_.price,
                creator: case_.creator,
                items: case_.items
                    .sort((a, b) => a.percentage - b.percentage)
                    .map(i => ({
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

            // Cache the result
            caseCache.set(caseID, {
                data: result,
                expiry: Date.now() + CACHE_TTL,
            });

            return result;
        }
    }

    return null;
}
