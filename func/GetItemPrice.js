import { axiosProxy } from "../lib/proxy/index.js";

const ItemPriceCache = {};
const NEXT_PRICE_FETCH = 1000 * 60 * 15;

export default async function GetItemPrice(appid, marketHashName, asNumber = false) {
    return new Promise(async (resolve, reject) => {
        // Check if item price is cached
        if (
            ItemPriceCache?.[marketHashName]?.nextPriceFetch &&
            Date.now() < ItemPriceCache[marketHashName].nextPriceFetch
        ) {
            // Return cached item price
            return resolve(ItemPriceCache[marketHashName].price);
        }

        try {
            const searchParam = encodeURIComponent(marketHashName);
            const priceResponse = await axiosProxy(
                `http://steamcommunity.com/market/priceoverview/?country=US&currency=1&appid=${appid}&market_hash_name=${searchParam}`,
                5,
            );

            const price = priceResponse?.median_price ?? priceResponse?.lowest_price ?? null;

            // Cache item price
            if (price && Object.keys(ItemPriceCache).length < 5000) {
                ItemPriceCache[marketHashName] = {
                    price,
                    nextPriceFetch: Date.now() + NEXT_PRICE_FETCH,
                };
            }

            if (asNumber) {
                resolve(parseFloat(price.replace("$", "").replace(",", "")));
            } else {
                resolve(price);
            }
        } catch (e) {
            console.error(e?.response?.data || e?.statusText || e);
            return resolve(null);
        }

        // Remove expired item prices from cache
        for (let marketHashName of Object.keys(ItemPriceCache)) {
            if (Date.now() > ItemPriceCache[marketHashName].nextPriceFetch) {
                delete ItemPriceCache[marketHashName];
            }
        }
    });
}
