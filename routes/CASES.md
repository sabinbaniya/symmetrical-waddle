# Cases API Routes Documentation

## Overview

The Cases API provides REST endpoints for managing and retrieving case-related data. Cases are loot boxes that contain items with different rarity percentages. Users can browse cases, create custom cases, and retrieve case details.

**Base Path**: `/api/cases`

---

## Endpoints

### 1. GET `/api/cases`

Get all cases with optional type filtering.

#### Query Parameters

| Parameter | Type     | Default   | Description                                                                                                                            |
| --------- | -------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `type`    | `string` | `"false"` | Filter cases by type: `"all"` (all cases), `"true"` (Level cases only), `"false"` (regular cases, excluding Level cases and free-case) |

#### Response

Returns an array of case objects.

```typescript
Array<{
    id: string;
    name: string;
    price: number;
    creator: string;
    items: Array<{
        appid: number;
        marketHashName: string;
        gunName: string;
        skinName: string;
        image: string;
        price: string;
        nextPriceFetch: number;
        percentage: number;
    }>;
}>;
```

#### Example Request

```bash
curl http://localhost:4000/api/cases?type=all
```

#### Example Response

```json
[
    {
        "id": "legendary-case",
        "name": "Legendary Case",
        "price": 5.99,
        "creator": "76561198012345678",
        "items": [
            {
                "appid": 730,
                "marketHashName": "AK-47 | Redline (Field-Tested)",
                "gunName": "AK-47",
                "skinName": "Redline",
                "image": "https://...",
                "price": "$12.50",
                "nextPriceFetch": 1735123456789,
                "percentage": 5.5
            }
        ]
    }
]
```

---

### 2. GET `/api/cases/pagination`

Get paginated cases with advanced filtering and sorting options.

#### Query Parameters

| Parameter  | Type     | Default         | Description                                                                         |
| ---------- | -------- | --------------- | ----------------------------------------------------------------------------------- |
| `caseType` | `string` | `"false"`       | Filter by case type: `"all"`, `"true"` (Level cases), `"false"` (regular cases)     |
| `page`     | `number` | `1`             | Page number for pagination                                                          |
| `limit`    | `number` | `10`            | Number of items per page                                                            |
| `type`     | `string` | `"all"`         | Filter by game type: `"cs2"`, `"rust"`, or `"all"`                                  |
| `search`   | `string` | `""`            | Search term to filter case names (case-insensitive)                                 |
| `sort`     | `string` | `"Most Recent"` | Sort option: `"Most Recent"`, `"Price Descending"`, `"Price Ascending"`, `"Oldest"` |

#### Response

```typescript
{
    cases: Array<CaseObject>;
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
curl "http://localhost:4000/api/cases/pagination?page=1&limit=5&type=cs2&search=legendary&sort=Price%20Descending"
```

#### Example Response

```json
{
  "cases": [...],
  "pagination": {
    "currentPage": 1,
    "totalPages": 11,
    "totalItems": 53,
    "hasNextPage": true,
    "hasPrevPage": false,
    "limit": 5
  }
}
```

---

### 3. GET `/api/cases/free`

Get the free case available to all users.

#### Response

Returns a single case object with `id: "free-case"`.

```typescript
{
    id: string;
    name: string;
    price: number;
    items: Array<ItemObject>;
}
```

#### Example Request

```bash
curl http://localhost:4000/api/cases/free
```

#### Error Response

```json
{
    "error": "Free case not found"
}
```

**Status Code**: `404`

---

### 4. GET `/api/cases/:caseID`

Get a specific case by its ID.

#### URL Parameters

| Parameter | Type     | Description                                     |
| --------- | -------- | ----------------------------------------------- |
| `caseID`  | `string` | The unique identifier of the case (URL-encoded) |

#### Response

Returns a single case object with items sorted by percentage (ascending).

```typescript
{
    id: string;
    name: string;
    price: number;
    creator: string;
    items: Array<{
        appid: number;
        marketHashName: string;
        gunName: string;
        skinName: string;
        wear?: string; // Parsed from marketHashName
        image: string;
        price: string;
        nextPriceFetch: number;
        percentage: number;
    }>;
}
```

#### Example Request

```bash
curl http://localhost:4000/api/cases/legendary-case
```

#### Error Response

```json
{
    "error": "Case not found"
}
```

**Status Code**: `404`

#### Notes

- Automatically updates item prices if any item is missing a price
- Uses caching for improved performance
- Items are sorted by percentage (lowest to highest)

---

### 5. POST `/api/cases/create`

Create a new custom case. **Requires authentication**.

#### Authentication

Requires a valid session cookie (`connect.sid`).

#### Request Body

```typescript
{
    name: string; // Case name (3-32 characters)
    items: Array<{
        marketHashName: string;
        percentage: number; // 0-100, total must equal 100
    }>;
}
```

#### Validation Rules

- **Authentication**: User must be logged in
- **Level Requirement**: User must be at least level 25
- **Name Constraints**:
    - Cannot start with "level" (case-insensitive)
    - Cannot start with "free" (case-insensitive)
    - Must be 3-32 characters long
    - Must be unique (case-insensitive)
- **Items**:
    - Minimum 2 items required
    - Each item must have a valid `marketHashName` and `percentage`
    - Percentages must be numbers between 0 and 100
    - Total percentage must equal exactly 100%
    - Items must exist in the inventory database
- **User Limits**: Maximum 50 cases per user

#### Response (Success)

```typescript
{
    status: true;
    id: string; // Generated case ID (lowercase, spaces replaced with hyphens)
}
```

#### Example Request

```bash
curl -X POST http://localhost:4000/api/cases/create \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=s:..." \
  -d '{
    "name": "My Custom Case",
    "items": [
      {
        "marketHashName": "AK-47 | Redline (Field-Tested)",
        "percentage": 60
      },
      {
        "marketHashName": "AWP | Dragon Lore (Factory New)",
        "percentage": 40
      }
    ]
  }'
```

#### Example Response (Success)

```json
{
    "status": true,
    "id": "my-custom-case"
}
```

#### Error Responses

**Unauthorized** (401)

```json
{
    "status": false,
    "message": "You must be logged in to create a case"
}
```

**Forbidden** (403)

```json
{
    "status": false,
    "message": "You must be at least level 25 to create a case"
}
```

**Bad Request** (400)

```json
{
    "status": false,
    "message": "Case name cannot start with 'level'" // or other validation error
}
```

**Internal Server Error** (500)

```json
{
    "status": false,
    "message": "Failed to create case"
}
```

#### Case Creation Process

1. Validates user authentication and level
2. Validates case name and item data
3. Fetches current item prices from inventory
4. Calculates case price with 5% house edge
5. Checks for duplicate case names
6. Enforces user case limit (50 max)
7. Determines case type (cs2/rust/mixed) based on item appids
8. Saves case to database

---

## Data Models

### Case Object

```typescript
{
  id: string;              // Unique identifier (lowercase, hyphenated)
  name: string;            // Display name
  price: number;           // Calculated price with house edge
  creator: string;         // Steam ID of creator
  items: Array<ItemObject>;
  type?: string;           // "cs2" | "rust" | "mixed"
  spins?: number;          // Number of times case has been opened
  usedBalanceType?: string; // Balance type used for creation
}
```

### Item Object

```typescript
{
  appid: number;           // Steam app ID (730 = CS2, 252490 = Rust)
  marketHashName: string;  // Full item name
  gunName: string;         // Weapon name
  skinName: string;        // Skin name
  wear?: string;           // Wear condition (parsed)
  image: string;           // Image URL
  price: string;           // Formatted price (e.g., "$12.50")
  nextPriceFetch: number;  // Timestamp for next price update
  percentage: number;      // Drop chance percentage
}
```

## Error Handling

All endpoints include try-catch blocks and return appropriate HTTP status codes:

- **200**: Success
- **400**: Bad Request (validation errors)
- **401**: Unauthorized (not logged in)
- **403**: Forbidden (insufficient permissions)
- **404**: Not Found (case doesn't exist)
- **500**: Internal Server Error

---

## Frontend Integration

### Example: Fetching All Cases

```javascript
const response = await fetch("http://localhost:4000/api/cases?type=all");
const cases = await response.json();
```

### Example: Creating a Case

```javascript
const response = await fetch("http://localhost:4000/api/cases/create", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
    },
    credentials: "include", // Important: sends cookies
    body: JSON.stringify({
        name: "My Custom Case",
        items: [
            { marketHashName: "Item 1", percentage: 50 },
            { marketHashName: "Item 2", percentage: 50 },
        ],
    }),
});

const result = await response.json();
if (result.status) {
    console.log("Case created with ID:", result.id);
}
```

### Example: Paginated Cases with Search

```javascript
const params = new URLSearchParams({
    page: "1",
    limit: "10",
    type: "cs2",
    search: "legendary",
    sort: "Price Descending",
});

const response = await fetch(`http://localhost:4000/api/cases/pagination?${params}`);
const { cases, pagination } = await response.json();
```
