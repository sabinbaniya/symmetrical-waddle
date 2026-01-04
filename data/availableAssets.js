//
// NEVER CHANGE THE ORDER OF ASSETS
//

export const TestnetAssets = [
    "BTC_TEST",
    "LTC_TEST",
    "ETH_TEST6",
    "XRP_TEST",
    "TRX_TEST",
    "SOL_TEST",
    "USDT_TEST",
    "ADA_TEST",
    "AMOY_POLYGON_TEST",
    "DOGE_TEST",
];

export const AvailableAssets =
    process.env.NODE_ENV === "development"
        ? TestnetAssets
        : ["BTC", "LTC", "ETH", "XRP", "TRX", "SOL", "USDT", "ADA", "POL", "DOGE"];

const AssetTitles = {
    BTC: "bitcoin",
    LTC: "litecoin",
    ETH: "ethereum",
    XRP: "ripple",
    TRX: "tron",
    SOL: "solana",
    USDT: "tether",
    ADA: "cardano",
    POL: "polygon-ecosystem-token",
    DOGE: "dogecoin",
}

for (let i = 0; i < AvailableAssets.length; i++) {
    AssetTitles[TestnetAssets[i]] = Object.values(AssetTitles)[i];
}

export { AssetTitles };