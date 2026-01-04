# Affiliate API Routes Documentation

## Overview

The Affiliate API provides REST endpoints for managing affiliate codes and tracking affiliate statistics. Users can create their own affiliate codes, use codes from other users, and track their earnings from referred users.

**Base Path**: `/affiliate`

---

## Endpoints

### 1. GET `/affiliate/stats`

Get affiliate statistics for the authenticated user, including all referred users and their earnings.

#### Authentication

**Required**: Yes (session-based authentication)

#### Response

Returns an array of affiliate objects representing users who used the authenticated user's affiliate code.

```typescript
Array<{
    username: string;
    avatar: string;
    deposited: number;
    withdraws: number;
    steamid: string;
    earned: number;
}>;
```

#### Example Request

```bash
curl -X GET http://localhost:4000/affiliate/stats \
  --cookie "connect.sid=s%3A..."
```

#### Example Response

```json
[
    {
        "username": "PlayerOne",
        "avatar": "https://avatars.steamstatic.com/...",
        "deposited": 500.0,
        "withdraws": 100.0,
        "steamid": "76561198012345678",
        "earned": 32.0
    },
    {
        "username": "PlayerTwo",
        "avatar": "https://avatars.steamstatic.com/...",
        "deposited": 250.0,
        "withdraws": 50.0,
        "steamid": "76561198087654321",
        "earned": 16.0
    }
]
```

#### Notes

- Results are sorted by earned amount (highest first)
- `earned` is calculated as: `(deposited - (withdraws + bonuses)) * affiliateShare`
- Affiliate share percentage varies based on user's lifetime losses (0.08 to 0.25)
- Returns empty array if user has no affiliates

#### Error Responses

**401 Unauthorized**

```json
{
    "status": false,
    "message": "Unauthorized"
}
```

**500 Internal Server Error**

```json
{
    "status": false,
    "message": "Failed to fetch affiliate statistics"
}
```

### 2. GET `/affiliate/overview`

Get aggregated affiliate statistics for the authenticated user.

#### Authentication

**Required**: Yes (session-based authentication)

#### Response

Returns a summary object containing total earnings, deposit stats, and commission rates.

```json
{
    "commissionPercentage": 0.08,
    "totalDeposits": 1500.0,
    "totalWithdraws": 200.0,
    "totalAffiliates": 5,
    "totalEarnings": 104.0,
    "availableEarnings": 24.0
}
```

| Field                  | Type   | Description                             |
| :--------------------- | :----- | :-------------------------------------- |
| `commissionPercentage` | Number | Current commission rate (0.08 - 0.25)   |
| `totalDeposits`        | Number | Total amount deposited by all referrals |
| `totalWithdraws`       | Number | Total amount withdrawn by all referrals |
| `totalAffiliates`      | Number | Count of users who used your code       |
| `totalEarnings`        | Number | Lifetime earnings generated             |
| `availableEarnings`    | Number | Current claimable earnings              |

---

### 2. POST `/affiliate/set-code`

Set an affiliate code for the authenticated user. Once set, other users can use this code to become the user's affiliates.

#### Authentication

**Required**: Yes (session-based authentication)

#### Request Body

```typescript
{
    code: string; // 4-24 characters, alphanumeric only
}
```

#### Response (Success)

```typescript
{
    status: true;
    message: string;
}
```

#### Example Request

```bash
curl -X POST http://localhost:4000/affiliate/set-code \
  -H "Content-Type: application/json" \
  --cookie "connect.sid=s%3A..." \
  -d '{"code": "MYCODE123"}'
```

#### Example Response (Success)

```json
{
    "status": true,
    "message": "Affiliate code set successfully"
}
```

#### Error Responses

**400 Bad Request - Missing Code**

```json
{
    "status": false,
    "message": "Code is required"
}
```

**400 Bad Request - Invalid Format**

```json
{
    "status": false,
    "message": "Promo code must only include letters and numbers."
}
```

**400 Bad Request - Invalid Length**

```json
{
    "status": false,
    "message": "Code length must be between 3 and 24 letters."
}
```

**400 Bad Request - Code Already Taken**

```json
{
    "status": false,
    "message": "This promo code already has been claimed by someone else."
}
```

**400 Bad Request - User Already Has Code**

```json
{
    "status": false,
    "message": "You already have a promo code set."
}
```

**400 Bad Request - No Changes**

```json
{
    "status": false,
    "message": "Your haven't done any changes in your promo code."
}
```

**401 Unauthorized**

```json
{
    "status": false,
    "message": "Unauthorized"
}
```

**500 Internal Server Error**

```json
{
    "status": false,
    "message": "Failed to set affiliate code"
}
```

#### Validation Rules

- Code must be 4-24 characters long
- Code must contain only letters and numbers (alphanumeric)
- Code must be unique across all users
- User can only set their code once (cannot change it later)
- Code is automatically converted to uppercase

---

### 3. POST `/affiliate/use-code`

Use an affiliate code to become someone's affiliate. Grants a signup bonus and establishes the affiliate relationship.

#### Authentication

**Required**: Yes (session-based authentication)

#### Request Body

```typescript
{
    code: string; // The affiliate code to use
}
```

#### Response (Success)

```typescript
{
    status: true;
    message: string;
}
```

#### Example Request

```bash
curl -X POST http://localhost:4000/affiliate/use-code \
  -H "Content-Type: application/json" \
  --cookie "connect.sid=s%3A..." \
  -d '{"code": "FRIEND123"}'
```

#### Example Response (Success)

```json
{
    "status": true,
    "message": "Affiliate code applied successfully! You received 0.2 bonus."
}
```

#### Error Responses

**400 Bad Request - Missing Code**

```json
{
    "status": false,
    "message": "Code is required"
}
```

**400 Bad Request - Invalid Code**

```json
{
    "status": false,
    "message": "Promo code is invalid"
}
```

**400 Bad Request - Own Code**

```json
{
    "status": false,
    "message": "You cannot use your own promo code"
}
```

**400 Bad Request - Already Used**

```json
{
    "status": false,
    "message": "You've already used a promo code."
}
```

**401 Unauthorized**

```json
{
    "status": false,
    "message": "Unauthorized"
}
```

**500 Internal Server Error**

```json
{
    "status": false,
    "message": "An error occurred while using the affiliate code."
}
```

#### Effects

When a user successfully uses an affiliate code:

1. **User receives bonus**: +0.2 to balance
2. **Affiliate relationship created**: User is added to code owner's affiliates list
3. **Rewards updated**: User's `depositBonus` set to true, `freeCases` set to 0
4. **Permanent record**: User's `affiliate.used` field is set (cannot use another code)

#### Special Code

- `LUCKYRUST` is a special code that doesn't require an owner
- Using `LUCKYRUST` still grants the 0.2 bonus but doesn't create an affiliate relationship

---

## Data Models

### Affiliate Statistics Object

```typescript
{
    username: string; // Affiliate's display name
    avatar: string; // Affiliate's avatar URL
    deposited: number; // Total amount deposited by affiliate
    withdraws: number; // Total amount withdrawn by affiliate
    steamid: string; // Affiliate's Steam ID
    earned: number; // Amount earned from this affiliate
}
```

### User Affiliate Schema

```typescript
{
    affiliate: {
        code: string; // User's own affiliate code (empty if not set)
        used: string; // Code the user used (empty if not used)
    }
}
```

### Affiliate Database Schema

```typescript
{
    user: string;                    // Steam ID of code owner
    code: string;                    // The affiliate code (uppercase)
    affiliates: string[];            // Array of Steam IDs who used this code
    earning: number;                 // Current unclaimed earnings
    totalEarnings: number;           // Lifetime total earnings
    lastClaimed: Date;               // Last time earnings were claimed
    deposits: Array<{                // Deposit history from affiliates
        user: string;
        amount: number;
        date: Date;
    }>;
    withdraws: Array<{               // Withdrawal history from affiliates
        user: string;
        amount: number;
        date: Date;
    }>;
    bonuses: Array<{                 // Bonus history from affiliates
        user: string;
        amount: number;
        date: Date;
    }>;
}
```

---

## Affiliate Commission System

### Commission Tiers

Commission percentage is based on the affiliate owner's lifetime losses:

| Lifetime Loss | Commission Rate |
| ------------- | --------------- |
| ≥ $100,000    | 25%             |
| ≥ $50,000     | 20%             |
| ≥ $10,000     | 12%             |
| ≥ $5,000      | 10%             |
| < $5,000      | 8%              |

### Earnings Calculation

```javascript
earned = (totalDeposited - (totalWithdrawn + totalBonuses)) * commissionRate;
```

### Example

If an affiliate:

- Deposited: $500
- Withdrew: $100
- Received bonuses: $50
- Code owner's commission rate: 12%

Earnings = ($500 - ($100 + $50)) \* 0.12 = $42

---

## Frontend Integration

### Example: Fetching Affiliate Stats

```javascript
const response = await fetch("http://localhost:4000/affiliate/stats", {
    credentials: "include", // Include cookies
});

if (response.ok) {
    const affiliates = await response.json();
    console.log(`You have ${affiliates.length} affiliates`);

    const totalEarned = affiliates.reduce((sum, aff) => sum + aff.earned, 0);
    console.log(`Total earned: $${totalEarned.toFixed(2)}`);
}
```

### Example: Setting Affiliate Code

```javascript
async function setAffiliateCode(code) {
    const response = await fetch("http://localhost:4000/affiliate/set-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code }),
    });

    const result = await response.json();

    if (result.status) {
        console.log("Code set successfully!");
    } else {
        console.error(result.message);
    }
}

// Usage
await setAffiliateCode("MYCODE123");
```

### Example: Using Affiliate Code

```javascript
async function useAffiliateCode(code) {
    const response = await fetch("http://localhost:4000/affiliate/use-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code }),
    });

    const result = await response.json();

    if (result.status) {
        console.log("Bonus received! +0.2 to balance");
    } else {
        console.error(result.message);
    }
}

// Usage
await useAffiliateCode("FRIEND123");
```

### Example: Complete Affiliate Dashboard

```javascript
async function loadAffiliateDashboard() {
    // Fetch affiliate stats
    const response = await fetch("http://localhost:4000/affiliate/stats", {
        credentials: "include",
    });

    if (!response.ok) {
        console.error("Failed to load affiliates");
        return;
    }

    const affiliates = await response.json();

    // Calculate totals
    const totalAffiliates = affiliates.length;
    const totalEarned = affiliates.reduce((sum, aff) => sum + aff.earned, 0);
    const totalDeposited = affiliates.reduce((sum, aff) => sum + aff.deposited, 0);

    // Display in UI
    console.log(`Total Affiliates: ${totalAffiliates}`);
    console.log(`Total Earned: $${totalEarned.toFixed(2)}`);
    console.log(`Total Deposited by Affiliates: $${totalDeposited.toFixed(2)}`);

    // Display individual affiliates
    affiliates.forEach(aff => {
        console.log(`${aff.username}: $${aff.earned.toFixed(2)}`);
    });
}
```

---

## Security Considerations

### Authentication

All endpoints require session-based authentication using Passport.js:

- Cookies must be included in requests (`credentials: "include"`)
- Session is validated via `req.isAuthenticated()`
- User data is available via `req.user`

### Input Validation

- Affiliate codes are sanitized and validated
- Uppercase conversion prevents case-sensitivity issues
- Alphanumeric-only requirement prevents injection attacks

### Business Logic Protection

- Users cannot use their own codes
- Users can only set one code (prevents abuse)
- Users can only use one code (prevents bonus farming)
- Code uniqueness is enforced at database level

---

## Related Documentation

- [Cases API Documentation](./CASES.md) - Similar authenticated endpoints
- [Upgrader API Documentation](./UPGRADER.md) - Item-based API patterns
- [Auth Routes](./auth.js) - Authentication system

---

## Troubleshooting

### Common Issues

**Issue**: 401 Unauthorized on all requests

- **Cause**: Missing or invalid session cookie
- **Solution**: Ensure cookies are included in requests (`credentials: "include"`)

**Issue**: Code already taken error

- **Cause**: Another user has already claimed this code
- **Solution**: Choose a different, unique code

**Issue**: Cannot change affiliate code

- **Cause**: Users can only set their code once
- **Solution**: This is by design to prevent abuse

**Issue**: Affiliate stats showing empty array

- **Cause**: No users have used your affiliate code yet
- **Solution**: Share your code with others to gain affiliates

**Issue**: Cannot use affiliate code twice

- **Cause**: Users can only use one affiliate code per account
- **Solution**: This is by design to prevent bonus farming
