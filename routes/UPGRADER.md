# Upgrader API Routes Documentation

## Overview

The Upgrader API provides REST endpoints for managing and retrieving inventory items used in the upgrader game mode. The upgrader allows users to bet an amount to upgrade to a more expensive item based on calculated win chances with a house edge.

**Base Path**: `/upgrader`

---

## Endpoints

### 1. GET `/upgrader/items`

Get all inventory items with caching. Returns items sorted by price in descending order.

#### Query Parameters

None.

#### Response

Returns an array of item objects, filtered to only include items with valid prices (> $0).

```typescript
Array<{
    appid: number;
    marketHashName: string;
    gunName: string;
    skinName: string;
    image: string;
    price: string;
    nextPriceFetch: number;
}>;
```

#### Example Request

```bash
curl http://localhost:4000/upgrader/items
```

#### Example Response

```json
[
    {
        "appid": 730,
        "marketHashName": "★ Butterfly Knife | Lore",
        "gunName": "★ Butterfly Knife",
        "skinName": "Lore",
        "image": "https://community.fastly.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpovbSsLQJf0ebcZThQ6tCvq4OeqPXhJ6_UhG1d8fp9hfvEyoD8j1yg5UplNz_ydo-ddw5rYQqB-1G4ye_vhMftuMubyCdn6XUk4XneyUS0hh1SLrs4xn-YYas/360fx360f",
        "price": "$2349.74",
        "nextPriceFetch": 1735123456789
    },
    {
        "appid": 730,
        "marketHashName": "★ Karambit | Tiger Tooth",
        "gunName": "★ Karambit",
        "skinName": "Tiger Tooth",
        "image": "https://...",
        "price": "$1836.23",
        "nextPriceFetch": 1735123456789
    }
]
```

#### Notes

- Uses in-memory caching with 1-hour duration
- Automatically filters out items without prices or with price ≤ $0
- Items are sorted by price in descending order (most expensive first)
- Cache is shared across all requests for optimal performance

---

### 2. GET `/upgrader/items/pagination`

Get paginated inventory items with search and sorting capabilities.

#### Query Parameters

| Parameter | Type     | Default        | Description                                                             |
| --------- | -------- | -------------- | ----------------------------------------------------------------------- |
| `page`    | `number` | `1`            | Page number for pagination (minimum: 1)                                 |
| `limit`   | `number` | `18`           | Number of items per page                                                |
| `sort`    | `string` | `"Descending"` | Sort order by price: `"Ascending"` or `"Descending"`                    |
| `search`  | `string` | `""`           | Search term to filter items by gun name or skin name (case-insensitive) |

#### Response

```typescript
{
    items: Array<ItemObject>;
    pagination: {
        currentPage: number;
        totalPages: number;
        totalItems: number;
        hasNextPage: boolean;
        hasPrevPage: boolean;
        limit: number;
    }
}
```

#### Example Request

```bash
# Default pagination
curl "http://localhost:4000/upgrader/items/pagination"

# With custom parameters
curl "http://localhost:4000/upgrader/items/pagination?page=2&limit=10&sort=Ascending&search=AK-47"
```

#### Example Response

```json
{
    "items": [
        {
            "appid": 730,
            "marketHashName": "AK-47 | Panthera onca (Field-Tested)",
            "gunName": "AK-47",
            "skinName": "Panthera onca",
            "image": "https://...",
            "price": "$327.64",
            "nextPriceFetch": 1754082321623
        },
        {
            "appid": 730,
            "marketHashName": "AK-47 | Inheritance (Factory New)",
            "gunName": "AK-47",
            "skinName": "Inheritance",
            "image": "https://...",
            "price": "$285.27",
            "nextPriceFetch": 1754082315375
        }
    ],
    "pagination": {
        "currentPage": 1,
        "totalPages": 5,
        "totalItems": 14,
        "hasNextPage": true,
        "hasPrevPage": false,
        "limit": 3
    }
}
```

#### Notes

- Search is performed across both `gunName` and `skinName` fields
- Search is case-insensitive
- Pagination automatically adjusts if requested page exceeds total pages
- Items without valid prices (null or ≤ $0) are automatically filtered out
- Sorting is applied after filtering and searching

---

### 3. POST `/upgrader/items/update-prices`

Update item prices from the Steam Community Market. This endpoint fetches current market prices for items that need updating.

#### Authentication

No authentication required (consider adding admin authentication in production).

#### Request Body

None.

#### Response (Success)

```typescript
{
    status: true;
    message: string;
    totalChecked: number;
}
```

#### Example Request

```bash
curl -X POST http://localhost:4000/upgrader/items/update-prices
```

#### Example Response (Success)

```json
{
    "status": true,
    "message": "Updated 45 items",
    "totalChecked": 45
}
```

#### Error Response

```json
{
    "status": false,
    "message": "Failed to update item prices"
}
```

**Status Code**: `500`

#### Update Logic

The endpoint updates prices for items that meet any of these conditions:

- Item price is `null`
- Current time exceeds the `nextPriceFetch` timestamp
- Items with `customPrice: true` are **skipped**

#### Processing Details

- **Batch Size**: 100 items processed concurrently
- **Price Source**: Steam Community Market API
- **Cache Duration**: 12 hours (43,200,000 ms)
- **Retry Logic**: Individual item failures are logged but don't stop the batch
- **Rate Limiting**: Batching prevents overwhelming the Steam API

#### Example Use Cases

1. **Scheduled Updates**: Run via cron job to keep prices current
2. **Manual Refresh**: Trigger when adding new items to inventory
3. **Price Validation**: Ensure all items have valid prices before opening cases

---

## Data Models

### Item Object

```typescript
{
    appid: number; // Steam app ID (730 = CS2, 252490 = Rust)
    marketHashName: string; // Full item name as it appears on Steam Market
    gunName: string; // Weapon/item name
    skinName: string; // Skin/variant name
    image: string; // CDN URL for item image (360x360)
    price: string; // Formatted price string (e.g., "$12.50")
    nextPriceFetch: number; // Unix timestamp for next price update
}
```

### Inventory Database Schema

```typescript
{
    appid: number; // Required
    marketHashName: string; // Required, unique identifier
    gunName: string; // Required
    skinName: string; // Required
    image: string; // Required
    price: string; // Required (can be null initially)
    nextPriceFetch: number; // Default: Date.now()
    customPrice: boolean; // Default: false (if true, price won't auto-update)
}
```

---

## Error Handling

All endpoints include comprehensive error handling:

- **200**: Success
- **500**: Internal Server Error (database or network issues)

Error responses follow this format:

```json
{
    "error": "Error message describing what went wrong"
}
```

or

```json
{
    "status": false,
    "message": "Error message"
}
```

---

## Caching Strategy

### GET `/upgrader/items`

Uses in-memory caching with the following strategy:

- **Cache Duration**: 1 hour (3,600,000 ms)
- **Cache Key**: Global (shared across all requests)
- **Cache Invalidation**: Time-based (automatic after 1 hour)
- **Cache Storage**: In-memory object in `func/GetItems.js`

### GET `/upgrader/items/pagination`

- Fetches all items from database on each request
- Filtering, searching, and pagination performed in-memory
- No caching at route level (relies on database query optimization)

### POST `/upgrader/items/update-prices`

- Updates `nextPriceFetch` timestamp for each item
- Next update won't occur until timestamp expires (12 hours)
- Individual item prices cached in `func/GetItemPrice.js` (15 minutes)

---

## Frontend Integration

### Example: Fetching All Items

```javascript
const response = await fetch("http://localhost:4000/upgrader/items");
const items = await response.json();

// Use items in upgrader UI
console.log(`Loaded ${items.length} items`);
```

### Example: Paginated Items with Search

```javascript
const params = new URLSearchParams({
    page: "1",
    limit: "20",
    sort: "Descending",
    search: "AK-47",
});

const response = await fetch(`http://localhost:4000/upgrader/items/pagination?${params}`);
const { items, pagination } = await response.json();

console.log(`Page ${pagination.currentPage} of ${pagination.totalPages}`);
console.log(`Found ${pagination.totalItems} items matching "AK-47"`);
```

### Example: Updating Prices (Admin)

```javascript
const response = await fetch("http://localhost:4000/upgrader/items/update-prices", {
    method: "POST",
});

const result = await response.json();
if (result.status) {
    console.log(result.message); // "Updated 45 items"
}
```

### Example: Building an Item Selector

```javascript
// Fetch items with search
async function searchItems(query) {
    const params = new URLSearchParams({
        page: "1",
        limit: "50",
        search: query,
        sort: "Descending",
    });

    const response = await fetch(`http://localhost:4000/upgrader/items/pagination?${params}`);
    const { items } = await response.json();

    return items;
}

// Usage in a search input
const results = await searchItems("Dragon Lore");
// Display results in dropdown/list
```

---

## Integration with Upgrader Game

The upgrader game socket handler (`socket/games/upgrader.js`) uses these endpoints indirectly:

1. **Item Validation**: When a user selects an item to upgrade to, the socket handler calls `GetItems()` to verify the item exists and get its current price
2. **Win Chance Calculation**: Uses item price to calculate win probability with house edge
3. **Price Updates**: The POST endpoint keeps item prices current for accurate game calculations

### Game Flow

1. User selects an item from the frontend (populated via GET `/upgrader/items/pagination`)
2. User places a bet amount
3. Socket handler validates item exists using `GetItems()`
4. Win chance calculated: `(betAmount / itemPrice) * (1 - houseEdge)`
5. Provably fair RNG determines outcome
6. User wins item or loses bet

---

## Performance Considerations

### Optimization Tips

1. **Use Pagination**: For large inventories, always use the pagination endpoint with reasonable limits
2. **Cache on Frontend**: Cache the full item list on the client side and refresh periodically
3. **Debounce Search**: When implementing search, debounce user input to reduce API calls
4. **Lazy Loading**: Load items as user scrolls rather than all at once

### Expected Response Times

- **GET /upgrader/items**: ~50-100ms (cached), ~200-500ms (uncached)
- **GET /upgrader/items/pagination**: ~100-300ms
- **POST /upgrader/items/update-prices**: ~5-30 seconds (depends on items needing updates)

---

## Security Considerations

> [!WARNING]
> The POST `/upgrader/items/update-prices` endpoint currently has no authentication. In production, this should be restricted to admin users only.

### Recommended Security Enhancements

1. **Add Authentication**: Require admin role for price updates
2. **Rate Limiting**: Limit price update requests to prevent abuse
3. **Input Validation**: Already implemented for pagination parameters
4. **CORS**: Configure appropriate CORS policies for production

### Example: Adding Admin Authentication

```javascript
router.post("/items/update-prices", requireAdmin, async (req, res) => {
    // ... existing code
});
```

---

## Troubleshooting

### Common Issues

**Issue**: Items not appearing in response

- **Cause**: Items have null or invalid prices
- **Solution**: Run POST `/upgrader/items/update-prices` to fetch current prices

**Issue**: Search returns no results

- **Cause**: Search is case-sensitive or exact match
- **Solution**: Search is already case-insensitive and uses partial matching

**Issue**: Pagination returns empty array

- **Cause**: Requested page exceeds total pages
- **Solution**: Pagination automatically adjusts to valid page range

**Issue**: Price updates taking too long

- **Cause**: Large number of items or Steam API rate limiting
- **Solution**: Updates are batched (100 items at a time) to manage this

---

## Related Documentation

- [Cases API Documentation](./CASES.md) - Similar item-based API
- [Upgrader Socket Documentation](../socket/games/UPGRADER.md) - Real-time game logic
- [Inventory Model](../models/Inventory.js) - Database schema
