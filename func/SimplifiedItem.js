import GetItemPrice from "./GetItemPrice.js";

const CACHE_DURATION = 60_000 * 60 * 3;
const cachedPrices = {};

export default async function SimplifiedItem(item, assets, priceAsNumber = false) {
    const obj = {};

    obj["id"] = assets.filter(a => a["classid"] === item.classid)[0].assetid;
    const marketHashName = item.market_hash_name || item.name;

    // CS:GO
    if (item.appid === 730) {
        const regex = /^(.*?)(?:\s*\|\s*(.*?))?\s*\((.*?)\)$/;
        const match = marketHashName.match(regex);

        if (match) {
            var [, gunName, skinName, wear] = match;

            skinName = skinName || "Default";

            if (skinName.includes("|")) {
                const parts = marketHashName.split("|");
                gunName = parts[0].trim();
                skinName = parts.slice(1, -1).join("|").trim();
                wear = parts[parts.length - 1].match(/\((.*?)\)$/)[1].trim();
            }

            obj["skin"] = skinName;
            obj["gun"] = gunName;
            obj["wear"] = wear;
        } else {
            const parts = marketHashName.split("|");

            if (parts.length > 1) {
                obj["skin"] = parts.slice(1).join("|").trim();
                obj["gun"] = parts[0].trim();
                obj["wear"] = null;
            } else {
                obj["skin"] = marketHashName;
                obj["gun"] = null;
                obj["wear"] = null;
            }
        }
    }

    // Rust
    else if (item.appid === 252490) {
        obj["gun"] = item.tags[0].localized_tag_name;
        obj["skin"] = item.market_hash_name;
        obj["wear"] = null;
    }

    obj["image"] = `https://steamcommunity-a.akamaihd.net/economy/image/${item.icon_url}`;
    obj["type"] = item.tags[0].localized_tag_name;
    obj["tradable"] = Boolean(item.tradable);
    obj["appid"] = item.appid;

    if (item.tradable) {
        try {
            if (
                cachedPrices[marketHashName] &&
                Date.now() - cachedPrices[marketHashName].timestamp < CACHE_DURATION
            ) {
                obj["price"] = cachedPrices[marketHashName].price;
            } else {
                obj["price"] = await GetItemPrice(item.appid, marketHashName);

                const cacheOjbect = { price: obj["price"], timestamp: Date.now() };
                cachedPrices[marketHashName] = cacheOjbect;

                if (Object.keys(cachedPrices).length >= 5000) {
                    const keys = Object.keys(cachedPrices);
                    delete cachedPrices[keys[0]];
                    cachedPrices[marketHashName] = cacheOjbect;
                }

                await new Promise(resolve => setTimeout(resolve, 20));
            }
        } catch (e) {
            console.error(e);
            obj["price"] = null;
        }
    }

    if (priceAsNumber) obj["price"] = parseFloat(obj["price"].slice(1, obj["price"].length));

    return obj;
}
