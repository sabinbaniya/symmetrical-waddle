import GetIRLCases from "./GetIRLCases.js";

// In-memory cache
const caseCache = new Map();
const CACHE_TTL = 1000 * 60 * 60;

function isCacheValid(entry) {
    const now = Date.now();
    return entry && now < entry.expiry;
}

export default async function GetIRLCase(caseID) {
    try {
        caseID = decodeURIComponent(caseID?.trim());
    } catch (e) {
        return null;
    }

    const cached = caseCache.get(caseID);
    if (isCacheValid(cached)) return cached.data;

    const cases = await GetIRLCases();
    for (let case_ of cases) {
        if (case_.id === caseID) {
            const result = {
                id: case_.id,
                name: case_.name,
                price: case_.price,
                items: (case_.items || [])
                    .map(i => ({
                        name: i.name,
                        image: i.image,
                        price: i.price,
                        percentage: i.percentage,
                    }))
                    .sort((a, b) => (a.percentage || 0) - (b.percentage || 0)),
            };
            caseCache.set(caseID, { data: result, expiry: Date.now() + CACHE_TTL });
            return result;
        }
    }

    return null;
}


