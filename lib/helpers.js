// Converts seconds into MM:SS format
export function secondsToMMSS(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    const paddedMinutes = String(minutes).padStart(2, "0");
    const paddedSeconds = String(remainingSeconds).padStart(2, "0");
    return `${paddedMinutes}:${paddedSeconds}`;
}

// Converts milliseconds into seconds with two decimal places
export function msToSeconds(ms) {
    let seconds = (ms / 1000).toFixed(2);
    return seconds.padStart(5, "0");
}

// Converts seconds into HH:MM:SS format
export function secondsToHHMMSS(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    const pad = num => num.toString().padStart(2, "0");
    return `${pad(hours)}:${pad(minutes)}:${pad(remainingSeconds)}`;
}

// Converts seconds into the format "DD/MM/YYYY HH (AM/PM)
export function secondsToDDMMYYYYHHMM(seconds) {
    const date = new Date(seconds * 1000);

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";

    hours = hours % 12;
    hours = hours ? hours : 12;
    const formattedHours = String(hours).padStart(2, "0");

    return `${day}/${month}/${year} ${formattedHours}:${minutes}${ampm}`;
}

export function dateToHHMM(date) {
    const d = new Date(date);
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
}

export function dateToDDMMYYYYHHMM(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

// Returns a truncated wallet address
export function truncateWalletAddress(walletAddress, prefixLength = 12, suffixLength = 6) {
    // Check if the wallet address is valid
    if (typeof walletAddress !== "string" || walletAddress.length < prefixLength + suffixLength)
        return walletAddress; // Return the original address if it's invalid or too short

    // Extract the prefix and suffix parts of the address
    const prefix = walletAddress.substring(0, prefixLength - 4);
    const suffix = walletAddress.substring(walletAddress.length - suffixLength);

    // Generate the truncated address with prefix, ellipsis, and suffix
    const truncatedAddress = `${prefix}...${suffix}`;

    return truncatedAddress;
}

export function truncateUsername(username, prefixLength = 12, suffixLength = 6) {
    // Check if the username is valid
    if (typeof username !== "string" || username.length < prefixLength + suffixLength)
        return username; // Return the original username if it's invalid or too short

    // Extract the prefix and suffix parts of the username
    const prefix = username.substring(0, prefixLength);
    const suffix = username.substring(username.length - suffixLength);

    // Generate the truncated username with prefix, ellipsis, and suffix
    const truncatedUsername = `${prefix}...${suffix}`;

    return truncatedUsername;
}

export function msToCompleteDate(timestamp) {
    const date = new Date(timestamp);
    const options = { year: "numeric", month: "long", day: "numeric" };
    return date.toLocaleDateString("en-US", options);
}

// Dates like '1m ago', 'Now', '1d ago'
export function subjectiveDate(date) {
    const now = new Date();
    const secondsPast = (now.getTime() - new Date(date).getTime()) / 1000;

    if (secondsPast < 60) {
        return "Now";
    }
    if (secondsPast < 3600) {
        const minutes = Math.floor(secondsPast / 60);
        return `${minutes}m ago`;
    }
    if (secondsPast < 86400) {
        const hours = Math.floor(secondsPast / 3600);
        return `${hours}h ago`;
    }
    if (secondsPast < 2592000) {
        const days = Math.floor(secondsPast / 86400);
        return `${days}d ago`;
    }
    if (secondsPast < 31536000) {
        const months = Math.floor(secondsPast / 2592000);
        return `${months}mo ago`;
    }
    const years = Math.floor(secondsPast / 31536000);
    return `${years}y ago`;
}

export function formatPrice(price) {
    if (typeof price === "string") {
        if (price.includes("$")) return parseFloat(price.replace("$", ""));
        return parseFloat(price);
    }
    return price;
}

/**
 * Every level, it requires 1.05x more experience to level up
 * Initial experience required to level up is 1000
 *
 * Level 0 --> Level 1 = 1000 EXP
 * Level 1 --> Level 2 = 1100 EXP
 * Level 2 --> Level 3 = 1210 EXP...
 *
 * If user has 1000 EXP, they are level 1
 * If 2100, they are level 2
 */
export function expToLevel(exp) {
    if (exp < 1000) return 0;

    let level = 0;
    let requiredExp = 1000;

    while (exp >= requiredExp) {
        exp -= requiredExp;
        level++;
        requiredExp = Math.floor(requiredExp * 1.05);
    }

    return level;
}

export function maxExpForLevel(level) {
    if (level === 0) return 1000;

    let requiredExp = 1000;

    for (let i = 1; i <= level; i++) {
        requiredExp = Math.floor(requiredExp * 1.05);
    }

    return requiredExp;
}

export function cumulativeExpUptoLevel(level) {
    let exp = 0;
    let requiredExp = 1000;

    for (let i = 0; i < level; i++) {
        exp += requiredExp;
        requiredExp = Math.floor(requiredExp * 1.05);
    }

    return exp;
}

export function expToNextLevel(exp) {
    const level = expToLevel(exp);
    const nextLevelExp = cumulativeExpUptoLevel(level + 1);
    return nextLevelExp - exp;
}

export function expProgress(exp) {
    const level = expToLevel(exp);
    const currentLevelStartExp = cumulativeExpUptoLevel(level);
    const nextLevelStartExp = cumulativeExpUptoLevel(level + 1);

    return (exp - currentLevelStartExp) / (nextLevelStartExp - currentLevelStartExp);
}

export function calculateRarity(percentage) {
    if (percentage < 1) return "very-rare";
    else if (percentage < 10) return "rare";
    else if (percentage < 25) return "uncommon";
    else if (percentage < 50) return "common";
    else return "default";
}

export function rarityToColor(rarity) {
    switch (rarity) {
        case "very-rare":
            return "#FFCB77";
        case "rare":
            return "#F6C00F";
        case "uncommon":
            return "#C164DC";
        case "common":
            return "#607CFF";
        default:
            return "#8E9093";
    }
}

export function calculateCasePrice(items) {
    // items: [{ price: number, percentage: number }]
    let rawPrice = 0;

    for (const item of items) {
        rawPrice += item.price * (item.percentage / 100);
    }

    const priceWithHouseEdge = rawPrice + rawPrice * 0.05;
    return parseFloat(priceWithHouseEdge.toFixed(2));
}

const CRYPTO_DECIMALS = {
    USDT: 6,
    ETH: 18,
    BTC: 8,
    MATIC: 18,
    BNB: 18,
    // Add more as needed
};

export function formatCryptoAmount(amount, asset) {
    if (!amount) return "0";

    // Get decimal places for the asset, default to 6 if not found
    const decimals = CRYPTO_DECIMALS[asset] || 6;

    // Convert the amount by dividing with the appropriate power of 10
    const convertedAmount = Number(amount) / Math.pow(10, decimals);

    // Convert to string to handle scientific notation
    const numberStr = convertedAmount.toString();

    // Split by decimal point if exists
    const [integerPart, decimalPart] = numberStr.split(".");

    // Add commas to integer part
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    // For decimal part, limit to a reasonable number of places (e.g., 8 for most crypto)
    const formattedDecimal = decimalPart ? decimalPart.slice(0, 8) : "";

    // Return formatted string
    return formattedDecimal ? `${formattedInteger}.${formattedDecimal}` : formattedInteger;
}
