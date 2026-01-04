import Redis from "ioredis";

/**
 * @type {Redis}
 */
const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    tls: process.env.NODE_ENV === "production" && {
        rejectUnauthorized: false,
    }, // Amazon requires TLS, leave object empty to enable
    maxRetriesPerRequest: 5,
});

redis.on("connect", () => {
    console.log("✅ Redis connected");
});

redis.on("error", err => {
    console.error("❌ Redis error:", err);
});

export { redis };
