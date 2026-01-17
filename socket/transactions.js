import url from "url";
import path from "path";
import axios from "axios";
import crypto from "crypto";
import pkg from "fireblocks-sdk";
import fs from "fs";
import Auth from "../lib/auth.js";
import userDB from "../models/User.js";
import Affiliate from "../lib/affiliate.js";
import walletsDB from "../models/Wallets.js";
import cryptoDepositsDB from "../models/Deposits/Crypto.js";
import cryptoWithdrawsDB from "../models/Withdraws/Crypto.js";
import pendingCryptoWithdrawsDB from "../models/Withdraws/PendingCrypto.js";
import { GetUserByCookie } from "../func/GetUserByCookie.js";
import { AssetTitles, AvailableAssets } from "../data/availableAssets.js";
import { GetSweepstakeBalanceForDeposit } from "../func/GetUsdToSweepstakeValue.js";

const { FireblocksSDK } = pkg;
const publicKey = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA0+6wd9OJQpK60ZI7qnZG
jjQ0wNFUHfRv85Tdyek8+ahlg1Ph8uhwl4N6DZw5LwLXhNjzAbQ8LGPxt36RUZl5
YlxTru0jZNKx5lslR+H4i936A4pKBjgiMmSkVwXD9HcfKHTp70GQ812+J0Fvti/v
4nrrUpc011Wo4F6omt1QcYsi4GTI5OsEbeKQ24BtUd6Z1Nm/EP7PfPxeb4CP8KOH
clM8K7OwBUfWrip8Ptljjz9BNOZUF94iyjJ/BIzGJjyCntho64ehpUYP8UJykLVd
CGcu7sVYWnknf1ZGLuqqZQt4qt7cUUhFGielssZP9N9x7wzaAIFcT3yQ+ELDu1SZ
dE4lZsf2uMyfj58V8GDOLLE233+LRsRbJ083x+e2mW5BdAGtGgQBusFfnmv5Bxqd
HgS55hsna5725/44tvxll261TgQvjGrTxwe7e5Ia3d2Syc+e89mXQaI/+cZnylNP
SwCCvx8mOM847T0XkVRX3ZrwXtHIA25uKsPJzUtksDnAowB91j7RJkjXxJcz3Vh1
4k182UFOTPRW9jzdWNSyWQGl/vpe9oQ4c2Ly15+/toBo4YXJeDdDnZ5c/O+KKadc
IMPBpnPrH/0O97uMPuED+nI6ISGOTMLZo35xJ96gPBwyG5s2QxIkKPXIrhgcgUnk
tSM7QYNhlftT4/yVvYnk0YcCAwEAAQ==
-----END PUBLIC KEY-----`.replace(/\\n/g, "\n");

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let apiSecret;
try {
    apiSecret = fs.readFileSync(path.resolve(__dirname, "../fireblocks_secret.key"), "utf8");
} catch (error) {
    console.error("Failed to read fireblocks_secret.key:", error);
    apiSecret = process.env.FIREBLOCKS_SECRET_KEY || "";
}

const apiKey = process.env.FIREBLOCKS_API_KEY || "";
const fireblocks = new FireblocksSDK(apiSecret, apiKey, "https://api.fireblocks.io");

// Vault IDs (set these in your .env)
const OMNIBUS_TREASURY_VAULT_ID = process.env.OMNIBUS_TREASURY_VAULT_ID;

// Classification: account-based vs UTXO-style (SOL stays UTXO-style per doc)
const ACCOUNT_BASED_ASSETS = ["ETH", "USDT", "USDC"]; // SOL intentionally NOT here

/**
 * IMPORTANT: WITHDRAWAL_VAULTS values must be *vault account IDs*.
 * If you only have human-readable names, the resolver below will try to look them up once and cache.
 */
const WITHDRAWAL_VAULTS = {
    ETH: {
        HOT: ["LUCKY-ETH-HOT-01", "LUCKY-ETH-HOT-02", "LUCKY-ETH-HOT-03", "LUCKY-ETH-HOT-04"],
        WARM: ["LUCKY-ETH-WARM-01", "LUCKY-ETH-WARM-02"],
        COLD: ["LUCKY-ETH-COLD-01", "LUCKY-ETH-COLD-02"],
    },
    LTC: {
        HOT: ["LUCKY-LTC-HOT-01", "LUCKY-LTC-HOT-02"],
        WARM: ["LUCKY-LTC-WARM-01", "LUCKY-LTC-WARM-02"],
        COLD: ["LUCKY-LTC-COLD-01", "LUCKY-LTC-COLD-02"],
    },
    SOL: {
        HOT: ["LUCKY-SOL-HOT-01", "LUCKY-SOL-HOT-02"],
        WARM: ["LUCKY-SOL-WARM-01", "LUCKY-SOL-WARM-02"],
        COLD: ["LUCKY-SOL-COLD-01", "LUCKY-SOL-COLD-02"],
    },
};

/** Cached map of name->id (or id->id) after resolving once */
const vaultIdCache = new Map();

async function looksLikeIdOrUuid(candidate) {
    if (!candidate) return false;
    // Fireblocks IDs are numeric-ish strings; also support UUID pattern
    return /^[0-9]+$/.test(candidate) || /^[0-9a-f-]{36}$/i.test(candidate);
}

/**
 * Resolve a vault "name label" to an actual Fireblocks vaultAccountId.
 * If it's already an id, returns as-is.
 * Falls back to input and logs a warning if lookup fails or API method not available.
 */
async function resolveVaultAccountId(candidate) {
    if (!candidate) return candidate;
    if (vaultIdCache.has(candidate)) return vaultIdCache.get(candidate);

    if (await looksLikeIdOrUuid(candidate)) {
        vaultIdCache.set(candidate, candidate);
        return candidate;
    }

    // Try best-effort search over all accounts (paged)
    try {
        // Some SDKs expose getVaultAccountsWithPageInfo; if not available, try getVaultAccounts
        if (typeof fireblocks.getVaultAccountsWithPageInfo === "function") {
            let after = undefined;
            while (true) {
                // Page through accounts; filter by name equality
                const resp = await fireblocks.getVaultAccountsWithPageInfo({ after, limit: 200 });
                const match = (resp?.accounts || []).find(a => a?.name === candidate);
                if (match?.id) {
                    vaultIdCache.set(candidate, String(match.id));
                    return String(match.id);
                }
                after = resp?.paging?.after;
                if (!after) break;
            }
        } else if (typeof fireblocks.getVaultAccounts === "function") {
            const accounts = await fireblocks.getVaultAccounts();
            const match = (accounts || []).find(a => a?.name === candidate);
            if (match?.id) {
                vaultIdCache.set(candidate, String(match.id));
                return String(match.id);
            }
        } else {
            console.warn(
                "Fireblocks SDK: no list-accounts method found; cannot resolve vault names.",
            );
        }
    } catch (e) {
        console.warn(`Failed resolving vault account name "${candidate}" → id:`, e?.message || e);
    }

    // Fallback to original value to avoid hard failure (but most FB API calls will fail if not an id).
    console.warn(
        `Using "${candidate}" as-is. Ensure WITHDRAWAL_VAULTS entries are vaultAccountIds.`,
    );
    vaultIdCache.set(candidate, candidate);
    return candidate;
}

/** Utility: map arrays of names/ids to pure ids */
async function resolveAllVaultIds(arr) {
    const out = [];
    for (const v of arr || []) out.push(await resolveVaultAccountId(v));
    return out;
}

export default class Transactions {
    constructor(app) {
        this.withdraws = null;
        this.lastUsedVaultIndex = {}; // per-asset RR pointer
        this.withdrawMonitor();
        this.initVaults();
        app.post("/webhook", this.handleWebhook.bind(this));
        app.get("/test", this.handleTest.bind(this));
    }

    async initVaults() {
        if (!OMNIBUS_TREASURY_VAULT_ID) {
            console.error("OMNIBUS_TREASURY_VAULT_ID not set in .env");
            return;
        }
        await this.enableAutoFueling();

        // Resolve any non-id entries once at boot
        for (const asset of Object.keys(WITHDRAWAL_VAULTS)) {
            for (const tier of Object.keys(WITHDRAWAL_VAULTS[asset])) {
                WITHDRAWAL_VAULTS[asset][tier] = await resolveAllVaultIds(
                    WITHDRAWAL_VAULTS[asset][tier],
                );
            }
        }
    }

    async enableAutoFueling() {
        try {
            await fireblocks.enableGasStation({ autoFuel: true });
            console.log("Gas Station enabled for intermediate vaults");
        } catch (error) {
            // If already enabled, SDK may throw a benign error—log and continue
            console.warn("Gas Station enablement notice:", error?.message || error);
        }
    }

    async createIntermediateVault(userId, asset) {
        const vaultName = `INT-${userId}-${asset}`;
        const vaultAccount = await fireblocks.createVaultAccount(
            vaultName,
            true, // hiddenOnUI
            userId.toString(),
            false,
        );
        return vaultAccount;
    }

    async getVaultAssetBalance(vaultId, asset) {
        const va = await fireblocks.getVaultAccountById(vaultId);
        const entry = va?.assets?.find(a => a.id === asset);
        if (!entry) return 0;
        const available = parseFloat(entry?.available || "0");
        const balance = parseFloat(entry?.balance || "0");
        return Number.isFinite(available) && available > 0
            ? available
            : Number.isFinite(balance)
              ? balance
              : 0;
    }

    // INT -> OMNIBUS sweep (with externalTxId for idempotency)
    async sweepToOmnibus(vaultAccountId, assetId, amount, sourceTxId) {
        const tx = await fireblocks.createTransaction({
            assetId,
            source: { type: "VAULT_ACCOUNT", id: vaultAccountId },
            destination: { type: "VAULT_ACCOUNT", id: OMNIBUS_TREASURY_VAULT_ID },
            amount,
            note: `Sweep ${assetId} to Omnibus Treasury`,
            externalTxId: `sweep:${sourceTxId || `${vaultAccountId}:${assetId}:${amount}`}`,
        });
        return tx;
    }

    // HOT round-robin with balance check
    async getHotVaultWithSufficientBalance(asset, requiredAmount) {
        const vaults = WITHDRAWAL_VAULTS[asset]?.HOT || [];
        if (vaults.length === 0) return null;

        const startIndex = this.lastUsedVaultIndex[asset] ?? -1;
        const n = vaults.length;

        for (let step = 1; step <= n; step++) {
            const idx = (startIndex + step) % n;
            const candidate = vaults[idx];

            try {
                const bal = await this.getVaultAssetBalance(candidate, asset);
                if (bal >= parseFloat(requiredAmount)) {
                    this.lastUsedVaultIndex[asset] = idx;
                    return candidate;
                }
            } catch (e) {
                console.error(`Failed balance check for hot vault ${candidate}:`, e);
            }
        }
        return null;
    }

    async getLowestBalanceWarmVault(asset) {
        const warmVaults = WITHDRAWAL_VAULTS[asset]?.WARM || [];
        let lowestBalanceVault = null;
        let lowestBalance = Infinity;

        for (const vaultId of warmVaults) {
            try {
                const bal = await this.getVaultAssetBalance(vaultId, asset);
                if (bal < lowestBalance) {
                    lowestBalance = bal;
                    lowestBalanceVault = vaultId;
                }
            } catch (error) {
                console.error(`Failed to fetch balance for warm vault ${vaultId}:`, error);
            }
        }
        if (!lowestBalanceVault) throw new Error(`No warm vaults available for ${asset}`);
        return lowestBalanceVault;
    }

    async getPreferredColdVault(asset) {
        const coldVaults = WITHDRAWAL_VAULTS[asset]?.COLD || [];
        if (coldVaults.length === 0) throw new Error(`No cold vaults configured for ${asset}`);

        // pick the one with the lowest balance (we JIT-fund anyway; this spreads storage)
        let choice = coldVaults[0];
        let lowest = Infinity;
        for (const v of coldVaults) {
            try {
                const bal = await this.getVaultAssetBalance(v, asset);
                if (bal < lowest) {
                    lowest = bal;
                    choice = v;
                }
            } catch {
                // ignore, keep current choice
            }
        }
        return choice;
    }

    // -------------------- WARM (phase 1 & 2) --------------------

    // WARM phase 1: Omnibus -> Warm (JIT funding) with externalTxId
    async fundWarmVault(asset, amount, warmVaultId, withdrawId) {
        const tx = await fireblocks.createTransaction({
            assetId: asset,
            source: { type: "VAULT_ACCOUNT", id: OMNIBUS_TREASURY_VAULT_ID },
            destination: { type: "VAULT_ACCOUNT", id: warmVaultId },
            amount,
            note: `Fund WARM ${warmVaultId} for ${asset} withdrawal`,
            externalTxId: `warm-fund:${withdrawId}`,
        });
        return tx;
    }

    // WARM phase 2: Warm -> user, dispatched by webhook on COMPLETED of phase 1
    async withdrawFromWarmVault(asset, amount, userAddress, warmVaultId, withdrawId) {
        const tx = await fireblocks.createTransaction({
            assetId: asset,
            source: { type: "VAULT_ACCOUNT", id: warmVaultId },
            destination: { type: "ONE_TIME_ADDRESS", oneTimeAddress: { address: userAddress } },
            amount,
            note: `Withdraw ${asset} to ${userAddress}`,
            externalTxId: `warm-payout:${withdrawId}`,
        });
        return tx;
    }

    // -------------------- COLD (phase 1 & 2 with TAP) --------------------

    // Cold phase 1: Omnibus -> Cold (JIT funding) with externalTxId; payout waits for this
    async fundColdVault(asset, amount, coldVaultId, withdrawId) {
        const tx = await fireblocks.createTransaction({
            assetId: asset,
            source: { type: "VAULT_ACCOUNT", id: OMNIBUS_TREASURY_VAULT_ID },
            destination: { type: "VAULT_ACCOUNT", id: coldVaultId },
            amount,
            note: `Fund COLD ${coldVaultId} for ${asset} withdrawal`,
            externalTxId: `cold-fund:${withdrawId}`,
        });
        return tx;
    }

    // Cold phase 2: Cold -> user; will enter PENDING_AUTHORIZATION under TAP
    async createColdWithdrawal(asset, amount, userAddress, coldVaultId, withdrawId) {
        const tx = await fireblocks.createTransaction({
            assetId: asset,
            source: { type: "VAULT_ACCOUNT", id: coldVaultId },
            destination: { type: "ONE_TIME_ADDRESS", oneTimeAddress: { address: userAddress } },
            amount,
            note: `Cold payout ${asset} to ${userAddress}`,
            externalTxId: `cold-payout:${withdrawId}`,
        });
        return tx;
    }

    // ---------- UTXO/SOL per-user deposit address on Omnibus ----------

    async getOrCreateOmnibusUserAddress(userId, asset) {
        if (!OMNIBUS_TREASURY_VAULT_ID) {
            throw new Error("OMNIBUS_TREASURY_VAULT_ID not configured");
        }

        const existing = await walletsDB
            .findOne({
                userId,
                asset,
                vaultID: OMNIBUS_TREASURY_VAULT_ID,
            })
            .lean();

        if (existing?.address) return existing.address;

        const addrResp = await fireblocks.generateNewAddress(OMNIBUS_TREASURY_VAULT_ID, asset);
        const newAddress = addrResp?.address;
        if (!newAddress) throw new Error("Failed to generate new deposit address");

        await new walletsDB({
            vaultID: OMNIBUS_TREASURY_VAULT_ID,
            userId,
            address: newAddress,
            asset,
            createdAt: Date.now(),
        }).save();

        return newAddress;
    }

    // ---------------------------- Webhook handler ----------------------------

    async handleWebhook(req, res) {
        try {
            const { body } = req;
            if (!body) return res.status(400).send("No data received");

            // Verify webhook signature
            const signature = req.headers["fireblocks-signature"];
            if (!signature) {
                console.error("Missing fireblocks-signature header");
                return res.status(401).send("Invalid signature");
            }
            const verifier = crypto.createVerify("RSA-SHA512");
            verifier.update(JSON.stringify(body));
            verifier.end();
            const isVerified = verifier.verify(publicKey, signature, "base64");
            if (!isVerified) {
                console.error("Invalid signature");
                return res.status(401).send("Invalid signature");
            }

            const data = body.data;
            const eventType = body?.eventType;
            const status = data?.status;
            const externalTxId = data?.externalTxId || "";
            const operation = data?.operation;

            // Accept both the official and dotted-lowercase variants
            const isTxnStatusEvent =
                eventType === "TRANSACTION_STATUS_UPDATED" ||
                eventType === "transaction.status.updated";

            if (isTxnStatusEvent) {
                // ----------------- Deposits: EXTERNAL -> VAULT_ACCOUNT -----------------
                // Sweep only when:
                // - status COMPLETED
                // - operation TRANSFER
                // - source is EXTERNAL
                // - destination is a VAULT_ACCOUNT that is an INT vault (account-based flow)
                if (
                    status === "COMPLETED" &&
                    operation === "TRANSFER" &&
                    data.source?.type === "EXTERNAL" &&
                    data.destination?.type === "VAULT_ACCOUNT"
                ) {
                    const intermediateVaultId = data.destination.id;
                    const assetId = data.assetId;

                    // Skip sweeping if this was an Omnibus (UTXO/SOL) direct deposit
                    if (intermediateVaultId === OMNIBUS_TREASURY_VAULT_ID) {
                        // No sweep needed for UTXO/SOL omnibus deposits
                    } else if (ACCOUNT_BASED_ASSETS.includes(assetId)) {
                        // Extra guard: fetch vault to confirm it's an INT-* hidden vault
                        let isIntVault = false;
                        try {
                            const va = await fireblocks.getVaultAccountById(intermediateVaultId);
                            if (va?.name?.startsWith("INT-")) isIntVault = true;
                        } catch {
                            // If lookup fails, still attempt sweep (account-based + not omnibus)
                            isIntVault = true;
                        }

                        if (isIntVault) {
                            const sourceTxId = data.id;
                            const amount = data.amountInfo?.amount;
                            try {
                                await this.sweepToOmnibus(
                                    intermediateVaultId,
                                    assetId,
                                    amount,
                                    sourceTxId,
                                );
                            } catch (e) {
                                console.error("Sweep INT->OMNIBUS failed:", e);
                            }
                        }
                    }
                }

                // ----------------- Warm phase funding completed → trigger payout -----------------
                if (status === "COMPLETED" && externalTxId.startsWith("warm-fund:")) {
                    const withdrawId = externalTxId.split("warm-fund:")[1];
                    const rec = await pendingCryptoWithdrawsDB.findOne({ _id: withdrawId }).lean();
                    if (rec && rec.phase === "FUNDING") {
                        try {
                            const payoutTx = await this.withdrawFromWarmVault(
                                rec.asset,
                                rec.coinAmount,
                                rec.to,
                                rec.warmVaultId,
                                withdrawId,
                            );
                            await pendingCryptoWithdrawsDB.updateOne(
                                { _id: withdrawId },
                                {
                                    $set: {
                                        phase: "PAYOUT_SUBMITTED",
                                        payoutTxID: payoutTx.id,
                                        externalTxIdPayout: `warm-payout:${withdrawId}`,
                                    },
                                },
                            );
                        } catch (e) {
                            console.error("Warm payout submission failed:", e);
                        }
                    }
                }

                // ----------------- Cold phase funding completed → submit TAP’d payout -----------------
                if (status === "COMPLETED" && externalTxId.startsWith("cold-fund:")) {
                    const withdrawId = externalTxId.split("cold-fund:")[1];
                    const rec = await pendingCryptoWithdrawsDB.findOne({ _id: withdrawId }).lean();
                    if (rec && rec.phase === "COLD_FUNDING") {
                        try {
                            const payoutTx = await this.createColdWithdrawal(
                                rec.asset,
                                rec.coinAmount,
                                rec.to,
                                rec.coldVaultId,
                                withdrawId,
                            );
                            await pendingCryptoWithdrawsDB.updateOne(
                                { _id: withdrawId },
                                {
                                    $set: {
                                        phase: "PAYOUT_SUBMITTED",
                                        payoutTxID: payoutTx.id,
                                        externalTxIdPayout: `cold-payout:${withdrawId}`,
                                    },
                                },
                            );
                        } catch (e) {
                            console.error("Cold payout submission failed:", e);
                        }
                    }
                }

                // ----------------- TAP: cold payout awaits manual approval -----------------
                if (status === "PENDING_AUTHORIZATION" && externalTxId.startsWith("cold-payout:")) {
                    const withdrawId = externalTxId.split("cold-payout:")[1];
                    await pendingCryptoWithdrawsDB.updateOne(
                        { _id: withdrawId },
                        { $set: { phase: "AWAITING_TAP" } },
                    );
                }

                // ----------------- Any VAULT_ACCOUNT source completed → finalize withdrawal -----------------
                if (
                    status === "COMPLETED" &&
                    operation === "TRANSFER" &&
                    data.source?.type === "VAULT_ACCOUNT"
                ) {
                    const pending =
                        (await pendingCryptoWithdrawsDB.findOne({ payoutTxID: data.id })) ||
                        (await pendingCryptoWithdrawsDB.findOne({ txID: data.id })) ||
                        (externalTxId &&
                            (await pendingCryptoWithdrawsDB.findOne({
                                externalTxIdFunding: externalTxId,
                            }))) ||
                        null;

                    if (pending) {
                        await new cryptoWithdrawsDB({
                            userId: pending.userId,
                            to: pending.to,
                            txhash: data.id,
                            asset: pending.asset,
                            amount: data.amountInfo?.amount,
                            usdAmount: pending.usdAmount,
                            date: pending.date,
                        }).save();

                        await pendingCryptoWithdrawsDB.deleteOne({ _id: pending._id });
                        await Affiliate.update("withdraw", pending.steamid, pending.usdAmount);
                    }
                }

                // ----------------- Terminal failures → refund and clear pending -----------------
                const terminal =
                    status === "FAILED" ||
                    status === "REJECTED" ||
                    status === "CANCELED" ||
                    status === "EXPIRED" ||
                    status === "BLOCKED";
                if (terminal && data.source?.type === "VAULT_ACCOUNT") {
                    const pending =
                        (await pendingCryptoWithdrawsDB.findOne({ payoutTxID: data.id })) ||
                        (await pendingCryptoWithdrawsDB.findOne({ txID: data.id })) ||
                        (externalTxId &&
                            (await pendingCryptoWithdrawsDB.findOne({
                                externalTxIdFunding: externalTxId,
                            }))) ||
                        null;

                    if (pending) {
                        await userDB.updateOne(
                            { _id: pending.userId },
                            // { $inc: { balance: pending.usdAmount } }
                            { $inc: { sweepstakeBalance: pending.usdAmount } },
                        );
                        await pendingCryptoWithdrawsDB.deleteOne({ _id: pending._id });
                    }
                }
            }

            res.status(200).send("OK");
        } catch (e) {
            console.error("Webhook error:", e);
            res.status(500).send("Server error");
        }
    }

    async handleTest(req, res) {
        if (process.env.NODE_ENV !== "development") return res.status(404).end();
        const tx = await fireblocks.getTransactionById("ab8107dd-e217-4ca1-a271-9b617b920207");
        res.json(tx);
    }

    async user(cookie) {
        if (!cookie) return;
        return await GetUserByCookie(cookie);
    }

    // ----------------------------- Socket listeners -----------------------------

    listen(io, socket) {
        socket.on("deposit-address", async data => {
            if (!socket.limiter?.isAllowed?.(socket, "deposit-address")) {
                return socket.emit("deposit-address", {
                    status: false,
                    error: "Please wait a moment.",
                });
            }
            try {
                const user = await this.user(socket.cookie);
                if (!user?.steamid) return;

                const asset = data?.asset;
                if (!AvailableAssets.includes(asset)) {
                    return socket.emit("deposit-address", {
                        status: false,
                        error: "Invalid asset",
                    });
                }

                // Account-based: per-user INT vault (hidden) + auto-fuel
                if (ACCOUNT_BASED_ASSETS.includes(asset)) {
                    const vaultAccount = await this.createIntermediateVault(user._id, asset);
                    const assetWallet = await fireblocks.createVaultAsset(vaultAccount.id, asset);

                    await new walletsDB({
                        vaultID: vaultAccount.id,
                        steamid: user._id,
                        address: assetWallet.address,
                        asset,
                        createdAt: Date.now(),
                    }).save();

                    return socket.emit("deposit-address", {
                        status: true,
                        address: assetWallet.address,
                    });
                }

                // UTXO-style (BTC/LTC/SOL): unique per-user address from Omnibus
                const userAddress = await this.getOrCreateOmnibusUserAddress(user._id, asset);
                return socket.emit("deposit-address", { status: true, address: userAddress });
            } catch (err) {
                console.error("deposit-address error:", err);
                return socket.emit("deposit-address", {
                    status: false,
                    error: "Unable to create a deposit address right now. Please try again later.",
                });
            }
        });

        socket.on("withdraw", async data => {
            if (!socket.limiter?.isAllowed?.(socket, "withdraw")) {
                return socket.emit("withdraw", { status: false, error: "Please wait a moment." });
            }
            try {
                const user = await this.user(socket.cookie);
                if (!user?.steamid || !data.to || !data.amount) return;

                if (user?.withdrawLock) {
                    return socket.emit("withdraw", {
                        status: false,
                        error: "Withdrawals are locked for your account",
                    });
                }
                if (!AvailableAssets.includes(data.asset)) {
                    return socket.emit("withdraw", { status: false, error: "Invalid asset" });
                }
                const sweepstakeBalance = user.sweepstakeBalance;
                if (sweepstakeBalance < data.amount) {
                    return socket.emit("withdraw", {
                        status: false,
                        error: "Insufficient balance",
                    });
                }
                if (process.env.NODE_ENV === "production" && data.amount < 20) {
                    return socket.emit("withdraw", {
                        status: false,
                        error: "Minimum withdraw amount is $20",
                    });
                }
                if (parseFloat(data.amount) <= 0) {
                    return socket.emit("withdraw", { status: false, error: "Invalid amount" });
                }

                const userCanWithdraw = await Auth.canWithdraw(user._id);
                if (userCanWithdraw?.status === false) {
                    return socket.emit("withdraw", {
                        status: false,
                        error: `You need to wager at least $${userCanWithdraw.amount.toFixed(2)} more to withdraw`,
                    });
                }

                if (data.amount > 5000 && !user?.kyc) {
                    return socket.emit("withdraw", {
                        status: false,
                        error: "You need to complete KYC to withdraw more than $5000",
                        kyc: true,
                    });
                }

                const limitInfo = await Auth.withdrawLimit(user._id, data.amount);
                if (limitInfo.allowed === false) {
                    return socket.emit("withdraw", {
                        status: false,
                        error: `Max withdraw allowed: ${limitInfo.remainingUsd}, limit updates at: ${limitInfo.nextAvailableAt}`,
                    });
                }

                const meetsWagerLimit = await Auth.meetsWagerLimit(user._id, data.amount);
                if (!meetsWagerLimit) {
                    return socket.emit("withdraw", {
                        status: false,
                        error: "You need to wager more to withdraw",
                    });
                }

                socket.emit("withdraw", { status: "pending" });

                // Convert USD -> asset units when needed
                let coinAmount =
                    data.asset === "USDT" || data.asset === "USDC" ? String(data.amount) : null;
                if (!coinAmount) {
                    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${AssetTitles[data.asset]}&vs_currencies=usd`;
                    const priceData = (
                        await axios.get(url, {
                            headers: {
                                accept: "application/json",
                                "x-cg-demo-api-key": process.env.COINGECKO_API_KEY,
                            },
                        })
                    ).data;
                    const price = priceData?.[AssetTitles[data.asset]]?.usd;
                    if (!price) {
                        return socket.emit("withdraw", {
                            status: false,
                            error: "Error fetching price. Please try again later.",
                        });
                    }
                    coinAmount = (data.amount / price).toFixed(8);
                }

                const usdAmount = data.amount;
                const asset = data.asset;
                const to = data.to;

                // ----------------- HOT (≤ $500): RR w/ balance check + externalTxId -----------------
                if (usdAmount <= 500) {
                    const hotVaultId = await this.getHotVaultWithSufficientBalance(
                        asset,
                        coinAmount,
                    );
                    if (!hotVaultId) {
                        return socket.emit("withdraw", {
                            status: false,
                            error: "Hot wallets are temporarily underfunded. Please try again shortly.",
                        });
                    }

                    // Create pending first to get an id for externalTxId idempotency
                    const pendingDoc = await new pendingCryptoWithdrawsDB({
                        userId: user._id,
                        to,
                        asset,
                        usdAmount,
                        coinAmount,
                        tier: "HOT",
                        phase: "SUBMITTED",
                        date: Date.now(),
                    }).save();

                    const tx = await fireblocks.createTransaction({
                        assetId: asset,
                        source: { type: "VAULT_ACCOUNT", id: hotVaultId },
                        destination: { type: "ONE_TIME_ADDRESS", oneTimeAddress: { address: to } },
                        amount: coinAmount,
                        externalTxId: `hot-payout:${pendingDoc._id.toString()}`,
                    });

                    await pendingCryptoWithdrawsDB.updateOne(
                        { _id: pendingDoc._id },
                        {
                            $set: {
                                txID: tx.id,
                                externalTxIdPayout: `hot-payout:${pendingDoc._id.toString()}`,
                            },
                        },
                    );

                    this.withdraws = [
                        ...(this.withdraws || []),
                        { ...pendingDoc.toObject(), txID: tx.id },
                    ];

                    // await userDB.updateOne({ _id: user._id }, { $inc: { balance: -usdAmount } });
                    await userDB.updateOne(
                        { _id: user._id },
                        { $inc: { sweepstakeBalance: -usdAmount } },
                    );
                    return socket.emit("withdraw", { status: true });
                }

                // ----------------- WARM ($500–$1,500): two-phase with webhook sync -----------------
                if (usdAmount <= 1500) {
                    const warmVaultId = await this.getLowestBalanceWarmVault(asset);

                    const pendingDoc = await new pendingCryptoWithdrawsDB({
                        userId: user._id,
                        to,
                        asset,
                        usdAmount,
                        coinAmount,
                        tier: "WARM",
                        phase: "FUNDING",
                        warmVaultId,
                        date: Date.now(),
                    }).save();

                    const fundTx = await this.fundWarmVault(
                        asset,
                        coinAmount,
                        warmVaultId,
                        pendingDoc._id.toString(),
                    );

                    await pendingCryptoWithdrawsDB.updateOne(
                        { _id: pendingDoc._id },
                        {
                            $set: {
                                fundingTxID: fundTx.id,
                                externalTxIdFunding: `warm-fund:${pendingDoc._id.toString()}`,
                            },
                        },
                    );

                    this.withdraws = [
                        ...(this.withdraws || []),
                        { ...pendingDoc.toObject(), fundingTxID: fundTx.id },
                    ];

                    // await userDB.updateOne({ _id: user._id }, { $inc: { balance: -usdAmount } });
                    await userDB.updateOne(
                        { _id: user._id },
                        { $inc: { sweepstakeBalance: -usdAmount } },
                    );
                    return socket.emit("withdraw", { status: true, queued: true });
                }

                // ----------------- COLD (> $1,500): two-phase JIT + TAP -----------------
                const coldVaultId = await this.getPreferredColdVault(asset);

                const pendingCold = await new pendingCryptoWithdrawsDB({
                    userId: user._id,
                    to,
                    asset,
                    usdAmount,
                    coinAmount,
                    tier: "COLD",
                    phase: "COLD_FUNDING",
                    coldVaultId,
                    date: Date.now(),
                }).save();

                const coldFundTx = await this.fundColdVault(
                    asset,
                    coinAmount,
                    coldVaultId,
                    pendingCold._id.toString(),
                );

                await pendingCryptoWithdrawsDB.updateOne(
                    { _id: pendingCold._id },
                    {
                        $set: {
                            fundingTxID: coldFundTx.id,
                            externalTxIdFunding: `cold-fund:${pendingCold._id.toString()}`,
                        },
                    },
                );

                this.withdraws = [
                    ...(this.withdraws || []),
                    { ...pendingCold.toObject(), fundingTxID: coldFundTx.id },
                ];

                // await userDB.updateOne({ _id: user._id }, { $inc: { balance: -usdAmount } });
                await userDB.updateOne(
                    { _id: user._id },
                    { $inc: { sweepstakeBalance: -usdAmount } },
                );
                return socket.emit("withdraw", { status: true, queued: true });
            } catch (e) {
                console.error(e);
                return socket.emit("withdraw", {
                    status: false,
                    error: "An error occurred, please try again later.",
                });
            }
        });
    }

    // ---------------------------- Pending monitor ----------------------------

    async withdrawMonitor() {
        if (this.withdraws === null) {
            this.withdraws = await pendingCryptoWithdrawsDB.find({}).lean();
        }
        const monitor = async () => {
            try {
                for (const withdraw of this.withdraws) {
                    const id = withdraw.payoutTxID || withdraw.txID || withdraw.fundingTxID;
                    if (!id) continue;

                    const tx = await fireblocks.getTransactionById(id);

                    if (tx?.status === "COMPLETED") {
                        // Warm & cold funding completion are handled by webhook; skip finalization here for FUNDING phases.
                        if (
                            (withdraw.tier === "WARM" && withdraw.phase === "FUNDING") ||
                            (withdraw.tier === "COLD" && withdraw.phase === "COLD_FUNDING")
                        )
                            continue;

                        await new cryptoWithdrawsDB({
                            userId: withdraw.userId,
                            to: withdraw.to,
                            txhash: id,
                            asset: withdraw.asset,
                            amount: tx.amountInfo?.amount,
                            usdAmount: withdraw.usdAmount,
                            date: withdraw.date,
                        }).save();

                        await pendingCryptoWithdrawsDB.deleteOne({ _id: withdraw._id });
                        this.withdraws = this.withdraws.filter(
                            w => String(w._id) !== String(withdraw._id),
                        );
                        await Affiliate.update("withdraw", withdraw.userId, withdraw.usdAmount);
                    } else if (
                        tx?.status === "FAILED" ||
                        tx?.status === "REJECTED" ||
                        tx?.status === "CANCELED" ||
                        tx?.status === "EXPIRED" ||
                        tx?.status === "BLOCKED"
                    ) {
                        await userDB.updateOne(
                            { _id: withdraw.userId },
                            // { $inc: { balance: withdraw.usdAmount } }
                            { $inc: { sweepstakeBalance: withdraw.usdAmount } },
                        );
                        await pendingCryptoWithdrawsDB.deleteOne({ _id: withdraw._id });
                        this.withdraws = this.withdraws.filter(
                            w => String(w._id) !== String(withdraw._id),
                        );
                    }
                }
            } catch (e) {
                console.error("Withdraw monitor error:", e);
            }
        };
        setInterval(monitor, 1000 * 60 * 2);
        monitor();
    }
}
