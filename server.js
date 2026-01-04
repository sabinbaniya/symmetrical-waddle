import "dotenv/config";

import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { createServer } from "http";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import GameplaysDB from "./models/Gameplays.js";
import { parse as parseCookie } from "cookie";

import { createRateLimiter } from "./lib/rate.js";

// Socket Classes
import P2P from "./socket/p2p.js";
import Chat from "./socket/chat.js";
import Rain from "./socket/rain.js";
import Games from "./socket/games.js";
//import Transactions from "./socket/transactions.js";
import UpdateCaseItemPrices from "./func/UpdateCaseItemPrices.js";
import Affiliate from "./lib/affiliate.js";
import ProcessP2PPayouts from "./func/ProcessP2PPayouts.js";
import adminRoutes, { setRainInstance } from "./routes/admin.js";
import session from "express-session";
import MongoStore from "connect-mongo";
import passport from "./lib/passport.js";
import authRoutes from "./routes/auth.js";
import casesRoutes from "./routes/cases.js";
import upgraderRoutes from "./routes/upgrader.js";
import affiliateRoutes from "./routes/affiliate.js";
import profileRoutes from "./routes/profile.js";
import coinRoutes from "./routes/coin.js";
import irlRoutes from "./routes/irl.js";
import kinguinRoutes from "./routes/kinguin.js";
import rewardsRoutes from "./routes/rewards.js";
import p2pRoutes from "./routes/p2p.js";
import statsRoutes from "./routes/stats.routes.js";
import sweepstakeRoutes from "./routes/sweepstake.js";
import leaderboardRoutes from "./routes/leaderboard.js";

mongoose.connect(process.env.MONGO_URI);

const PORT = 4000;
const dev = process.env.NODE_ENV !== "production";

const app = express();
const server = createServer(app);

app.set("trust proxy", 2); // Trust all proxies (required for accurate protocol detection behind LB)

app.use(express.json());
app.use(cookieParser());

app.use(
    cors({
        origin: function (origin, callback) {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) return callback(null, true);

            // Allow any origin in development/debugging
            // In production, you might want to restrict this
            return callback(null, true);
        },
        credentials: true,
    }),
);

app.use(
    rateLimit({
        windowMs: 2 * 60 * 1000,
        limit: 250,
        standardHeaders: "draft-7",
        legacyHeaders: false,
    }),
);

const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
    throw new Error("SESSION_SECRET is not defined");
}

const isProduction = process.env.NODE_ENV === "production";

// Session Middleware
app.use(
    session({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
        proxy: true,
        cookie: {
            secure: isProduction,
            maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
            sameSite: isProduction ? "none" : "lax",
        },
    }),
);

// Passport Middleware
app.use(passport.initialize());
app.use(passport.session());

// Auth Routes
app.use("/auth", authRoutes);

// Cases Routes
app.use("/cases", casesRoutes);

// Upgrader Routes
app.use("/upgrader", upgraderRoutes);

// Affiliate Routes
app.use("/affiliate", affiliateRoutes);

// Profile Routes
app.use("/profile", profileRoutes);

// Coin Routes
app.use("/coin", coinRoutes);

// IRL Routes
app.use("/irl", irlRoutes);

// Kinguin Routes
app.use("/kinguin", kinguinRoutes);

// Rewards Routes
app.use("/rewards", rewardsRoutes);

// P2P Routes
app.use("/p2p", p2pRoutes);

// Stats Routes
app.use("/stats", statsRoutes);

// Sweepstake Routes
app.use("/sweepstake", sweepstakeRoutes);

// Leaderboard Routes
app.use("/leaderboard", leaderboardRoutes);

// Socket
const p2p = new P2P();
const chat = new Chat();
const rain = new Rain();
const games = new Games();
//const transactions = new Transactions(app);

// Initialize rain system
rain.initialize().catch(err => {
    console.error("Rain initialization error:", err);
});

// Set rain instance for admin routes
setRainInstance(rain);

const limiter = createRateLimiter(event => {
    switch (event) {
        case "plinko:bet":
            return 50;
        case "send-message":
            return 2000;
        case "tip-rain":
            return 5000;
        case "mines:cashout":
            return 500;
        case "mines:start":
            return 1000;
        case "mines:reveal":
            return 100;
        case "battles:create":
            return 2000;
        case "battles:join":
            return 400;
        case "unboxing:spin":
            return 1000;
        case "upgrader:spin":
            return 1000;
        default:
            return 120;
    }
});

const io = new Server(server, {
    path: "/socket.io",
    cors: { origin: process.env.MAIN_URL, credentials: true },
    transports: ["websocket"],
    pingInterval: 25000,
    pingTimeout: 60000,
});

io.use((socket, next) => {
    if (socket.handshake.headers.cookie) {
        const parsedCookies = parseCookie(socket.handshake.headers.cookie);
        const userCookie = parsedCookies["connect.sid"];
        if (userCookie) socket.cookie = userCookie;
    }

    socket.limiter = limiter;

    next();
});

io.on("connection", socket => {
    // Socket Listeners
    try {
        p2p.listen(io, socket);
    } catch (e) {
        console.error("P2P Error:", e);
    }
    try {
        chat.listen(io, socket);
    } catch (e) {
        console.error("Chat Error:", e);
    }
    try {
        rain.listen(io, socket);
    } catch (e) {
        console.error("Rain Error:", e);
    }
    try {
        games.listen(io, socket);
    } catch (e) {
        console.error("Games Error:", e);
    }
    // try {
    //     transactions.listen(io, socket);
    // } catch (e) {
    //     console.error("Transaction Error:", e);
    // }
});

// Update case item prices
const updateFunc = () => {
    try {
        UpdateCaseItemPrices();
    } catch (e) {
        console.error("UpdateCaseItemPrices Error:", e);
    }
};

updateFunc();
setInterval(
    () => {
        updateFunc();
    },
    1000 * 60 * 60 * 1,
);

// Monthly affiliate earnings distribution
let latestAffiliateCheck = null;
setInterval(
    () => {
        if (new Date().getDate() === 1 && latestAffiliateCheck !== new Date().getMonth()) {
            latestAffiliateCheck = new Date().getMonth();

            // Distribute this month's affiliate earnings
            console.log("[AFFILIATE] Distributing affiliate earnings of the month");
            Affiliate.distribute();
        }
    },
    1000 * 60 * 60 * 6,
);

// Process deferred P2P payouts (runs hourly)
setInterval(
    async () => {
        try {
            await ProcessP2PPayouts();
        } catch (e) {
            console.error("ProcessP2PPayouts Error:", e);
        }
    },
    1000 * 60 * 60,
);

// Admin routes
app.use("/admin", adminRoutes);

app.get("/affiliate-earnings", async (req, res) => {
    if (process.env.NODE_ENV !== "development") {
        return res.status(403).send("Forbidden");
    }

    // Distribute this month's affiliate earnings
    console.log("[AFFILIATE] Distributing affiliate earnings of the month");
    await Affiliate.distribute();

    return res.status(200).send("Affiliate earnings distributed successfully");
});

// Public Fairness endpoint to fetch battle item pools snapshot
app.get("/api/fairness/battles/:gameID/items", async (req, res) => {
    try {
        const gameID = req.params.gameID;
        const doc = await GameplaysDB.findOne({ gameID }).lean();
        if (!doc) return res.status(404).json({ error: "Not found" });
        const sanitizeItem = i => ({
            image: i?.image ?? null,
            price: i?.price ?? null,
            percentage: i?.percentage ?? null,
            marketHashName: i?.marketHashName ?? null,
        });
        const itemPools = Array.isArray(doc.itemPools)
            ? doc.itemPools.map(roundPools =>
                  Array.isArray(roundPools)
                      ? roundPools.map(pool => (Array.isArray(pool) ? pool.map(sanitizeItem) : []))
                      : [],
              )
            : [];
        return res.json({
            gameID,
            rounds: doc.round - 1,
            maxParticipants: doc.maxParticipants,
            itemPools,
            forces: doc.forces || [],
        });
    } catch (e) {
        console.error("/api/fairness/battles/:gameID/items error", e);
        return res.status(500).json({ error: "Internal error" });
    }
});

server
    .once("error", err => {
        console.error(err);
    })
    .listen(PORT, () => {
        console.log(`> Ready on localhost:${PORT}`);
    });
