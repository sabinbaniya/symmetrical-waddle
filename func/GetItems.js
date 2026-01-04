"use server";

import { formatPrice } from "../lib/helpers.js";
import inventoryDB from "../models/Inventory.js";

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

// Helper function to format inventory data
function formatInventoryData(inventory) {
    return inventory
        .sort((a, b) => formatPrice(b.price) - formatPrice(a.price))
        .map(i => ({
            appid: i.appid,
            marketHashName: i.marketHashName,
            gunName: i.gunName,
            skinName: i.skinName,
            image: i.image,
            price: i.price,
            nextPriceFetch: i.nextPriceFetch,
        }))
        .filter(i => i.price && formatPrice(i.price) > 0);
}

// Helper function to fetch fresh data from database
async function fetchFreshInventory() {
    const inventory = await inventoryDB.find();

    // Update cache
    cache.data = inventory;
    cache.lastFetch = Date.now();

    return inventory;
}

export default async function GetItems() {
    // Return cached data if valid and not currently updating
    if (isCacheValid() && !cache.isUpdating) {
        return formatInventoryData(cache.data);
    }

    // Fetch fresh data
    let inventory = await fetchFreshInventory();

    // Check if all items have a price
    // const hasItemsWithoutPrice = inventory.some(item => !item.price);

    /*if (hasItemsWithoutPrice) {
        cache.isUpdating = true;

        try {
            // Update prices
            await UpdateItemPrices();

            // Re-fetch inventory with updated prices
            inventory = await fetchFreshInventory();
        } finally {
            // Reset updating flag
            cache.isUpdating = false;
        }
    }*/

    return formatInventoryData(inventory);
}
