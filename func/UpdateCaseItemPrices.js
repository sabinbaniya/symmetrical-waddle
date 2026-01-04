import casesDB from "../models/Cases.js";
import GetItemPrice from "./GetItemPrice.js";

const NEXT_PRICE_FETCH = 1000 * 60 * 60 * 12;

export default async function UpdateCaseItemPrices(caseID) {
    let cases;

    caseID = decodeURIComponent(caseID?.trim());
    if (!caseID) cases = await casesDB.find();
    else cases = await casesDB.find({ id: caseID });

    for (let case_ of cases) {
        for (let i = 0; i < case_.items.length; i++) {
            const item = case_.items[i];

            if (item?.customPrice) continue;

            const nextPriceFetch = item.nextPriceFetch;
            const isNull = item.price === null;

            if (Date.now() > nextPriceFetch || isNull) {
                // Fetch price
                try {
                    var price = await GetItemPrice(item.appid, item.marketHashName);
                } catch (e) {
                    console.error(e);
                    console.error("Cannot fetch item price: " + item.marketHashName);
                    continue;
                }

                // Set price
                case_.items[i].price = price;

                if (price) {
                    // Set next price fetch date
                    case_.items[i].nextPriceFetch = Date.now() + NEXT_PRICE_FETCH;
                }

                await casesDB.updateOne({ id: case_.id }, { items: case_.items });
            }
        }

        return case_;
    }
}
