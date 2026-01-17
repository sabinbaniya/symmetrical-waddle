import Auth from "../lib/auth.js";
import p2pDB from "../models/P2P.js";
import userDB from "../models/User.js";
import rewardsDB from "../models/Rewards.js";
import SimplifiedItem from "../func/SimplifiedItem.js";
import { getCombinedInventory } from "../lib/inventory.js";
import { GetUserByCookie } from "../func/GetUserByCookie.js";
import Affiliate from "../lib/affiliate.js";
import Rewards from "../lib/rewards.js";
import { GetSweepstakeBalanceForDeposit } from "../func/GetUsdToSweepstakeValue.js";

export default class P2P {
    constructor() {
        this.pool = []; // Item Pool - These are items on the marketplace waiting for a buyer
        this.connections = {}; // userId: socketID
        this.getPool();
    }

    async user(cookie) {
        if (!cookie) return;
        return await GetUserByCookie(cookie);
    }

    async getPool() {
        const records = await p2pDB.find().lean();

        const nextPool = [];
        for (const r of records) {
            // Skip and timeout expired pending trades
            if (r.status === "pending") {
                if (r?.deadline && Date.now() > r.deadline) {
                    try {
                        await p2pDB.updateOne({ "item.id": r.item.id }, { status: "timeout" });
                        await this.timeout(r);
                        continue; // do not add to pool
                    } catch (e) {
                        console.error("[P2P] getPool timeout handling error", e);
                        // fall through to avoid crashing; do not add to pool
                        continue;
                    }
                }
            }

            // Only keep marketplace and still-valid pending items
            if (r.status === "marketplace" || r.status === "pending") {
                const obj = {
                    ...r.item,
                    seller: r.seller,
                    status: r.status,
                };
                if (r["buyer"]) obj.buyer = r["buyer"];
                nextPool.push(obj);
            }
        }

        this.pool = nextPool;
    }

    getItemByID(id) {
        for (let item of this.pool) {
            if (item.id === id) {
                return item;
            }
        }
        return null;
    }

    getItemAndIndexByID(id) {
        let item, index;
        for (let i = 0; i < this.pool.length; i++) {
            let poolItem = this.pool[i];
            if (poolItem.id === id) {
                item = poolItem;
                index = i;
            }
        }

        return { item, index };
    }

    async timeout(data) {
        if (data?.status !== "pending") return;

        // If seller didn't confirm
        if (data.confirmations.seller === false) {
            // Refund buyer's sweepstake balance
            // await userDB.updateOne({ _id: data.buyer }, { $inc: { balance: data.item.price } });
            await userDB.updateOne(
                { _id: data.buyer },
                { $inc: { sweepstakeBalance: data.item.price } },
            );
        }

        // If buyer didn't confirm
        else {
            // Refund buyer's balance
            // await userDB.updateOne({ _id: data.buyer }, { $inc: { balance: data.item.price } });
            await userDB.updateOne(
                { _id: data.buyer },
                { $inc: { sweepstakeBalance: data.item.price } },
            );
        }

        // Remove from pool
        this.pool = this.pool.filter(i => i.id !== data.item.id);

        return;
    }

    listen(io, socket) {
        socket.on("marketplace", data => {
            const clone = structuredClone(
                this.pool.filter(i => i.status === "marketplace" && i.appid === data.appid),
            );
            clone.sort((a, b) => b.price - a.price);
            socket.emit("marketplace", { marketplace: clone });
        });

        socket.on("deposit-item", async datas => {
            if (!datas.length) return;

            if (!socket.limiter.isAllowed(socket, "deposit-item")) {
                return socket.emit("deposit-item", {
                    status: false,
                    error: "Please wait a moment.",
                });
            }

            const user = await this.user(socket.cookie);
            if (!user?._id) return;

            if (!Array.isArray(datas))
                return socket.emit("deposit-item", { status: false, error: "Invalid request" });

            if (!user?.tradeURL) {
                return socket.emit("deposit-item", {
                    status: false,
                    error: "You have to set trade URL in order to continue",
                });
            }

            let userInventory;
            try {
                userInventory = (await getCombinedInventory(user.steamid)).inventory;
            } catch (e) {
                console.error(e);
                return socket.emit("deposit-item", {
                    status: false,
                    error: "An error occured",
                });
            }

            if (!userInventory) {
                return socket.emit("deposit-item", {
                    status: false,
                    error: "An error occured",
                });
            }

            const toAdd = [];

            for (let item of this.pool) {
                let ids = datas.map(d => d.id);
                if (ids.includes(item.id))
                    return socket.emit("deposit-item", {
                        status: false,
                        error: "You already deposited this item",
                    });
            }

            const previousHistoryOfItem = await p2pDB.findOne({
                "item.id": datas[0].id,
                status: "marketplace",
                seller: user._id,
            });

            if (previousHistoryOfItem) {
                return socket.emit("deposit-item", {
                    status: false,
                    error: "You already deposited this item",
                });
            }

            for (let data of datas) {
                try {
                    // Check if item is duplicated
                    const duplicateItem = this.getItemByID(data.id);
                    if (duplicateItem) {
                        return socket.emit("deposit-item", {
                            status: false,
                            error: "This item is already listed.",
                        });
                    }

                    // Be sure user has this item
                    const itemAsset = userInventory.assets.filter(a => data.id === a.assetid)?.[0];
                    if (!itemAsset) {
                        return socket.emit("deposit-item", {
                            status: false,
                            error: "You don't own this item anymore.",
                        });
                    }

                    // Get item info
                    const item_raw = userInventory.descriptions.filter(
                        d => d.classid === itemAsset.classid,
                    )[0];

                    const item = await SimplifiedItem(item_raw, userInventory.assets, true);

                    item["seller"] = user._id;
                    item["rate"] = Math.max(-25, Math.min(25, data?.rate || 0));

                    toAdd.push(item);
                } catch (e) {
                    console.error(e);
                    socket.emit("deposit-item", {
                        status: false,
                        error: "An error occured",
                    });
                }
            }

            for (let item of toAdd) {
                let lastPrice = item["price"] + (item["price"] * item["rate"]) / 100;
                lastPrice = Math.round(lastPrice * 100) / 100;

                // Add item to the pool
                this.pool.unshift({
                    ...item,
                    price: lastPrice,
                    status: "marketplace",
                });

                // Add trade record
                const tradeObject = {
                    seller: user._id,
                    item: {
                        appid: item["appid"],
                        id: item["id"],
                        gun: item["gun"],
                        skin: item["skin"],
                        type: item["type"],
                        rate: item["rate"],
                        image: item["image"],
                        price: lastPrice,
                    },
                    status: "marketplace",
                };

                if (item?.wear) tradeObject["item"]["wear"] = item.wear;

                const newTrade = new p2pDB(tradeObject);
                await newTrade.save();
            }

            console.log("Pool:", this.pool);

            await Auth.addNotification(user._id, {
                date: Date.now(),
                title: "Deposit Pending",
                message: "Please wait until a buyer withdraws your item.",
            });

            return socket.emit("deposit-item", { status: true });
        });

        socket.on("cancel-deposit", async data => {
            if (!data) return;

            if (!socket.limiter.isAllowed(socket, "cancel-deposit")) {
                return socket.emit("cancel-deposit", {
                    status: false,
                    error: "Please wait a moment.",
                });
            }

            const user = await this.user(socket.cookie);
            if (!user?._id) return;

            const item = this.pool.filter(
                p => p["seller"].toString() === user._id.toString() && p["id"] === data.id,
            )?.[0];
            if (!item) return;

            if (item?.["buyer"])
                return socket.emit("cancel-deposit", {
                    status: false,
                    error: "You cannot cancel the deposit when there is a buyer",
                });

            this.pool = this.pool.filter(p => p["id"] !== data.id);
            await p2pDB.deleteOne({ "item.id": data.id });

            await Auth.addNotification(user._id, {
                date: Date.now(),
                title: "Deposit Cancelled",
                message: "Your deposit has been cancelled.",
            });

            return socket.emit("cancel-deposit", { status: true });
        });

        socket.on("withdraw-item", async datas => {
            if (!datas.length) return;

            if (!socket.limiter.isAllowed(socket, "withdraw-item")) {
                return socket.emit("withdraw-item", {
                    status: false,
                    error: "Please wait a moment.",
                });
            }

            const user = await this.user(socket.cookie);
            if (!user?._id) return;

            if (!user?.tradeURL) {
                return socket.emit("withdraw-item", {
                    status: false,
                    error: "You have to set trade URL in order to continue",
                });
            }

            if (user?.withdrawLock) {
                return socket.emit("withdraw-item", {
                    status: false,
                    error: "Withdrawals are locked for your account",
                });
            }

            const userCanWithdraw = await Auth.canWithdraw(user._id);
            if (userCanWithdraw?.status === false) {
                return socket.emit("withdraw-item", {
                    status: false,
                    error: `You need to wager at least $${userCanWithdraw.amount.toFixed(2)} more to withdraw`,
                });
            }

            let totalCost = 0;
            const toAdd = [];
            const indexes = [];

            for (let data of datas) {
                try {
                    let { item, index } = this.getItemAndIndexByID(data.id);

                    // Check if item is buyable
                    if (item["buyer"]) {
                        return socket.emit("withdraw-item", {
                            status: false,
                            error: "You cannot buy this item at the moment",
                        });
                    }

                    // Check if seller and buyer is same user
                    if (item["seller"].toString() === user._id.toString()) {
                        return socket.emit("withdraw-item", {
                            status: false,
                            error: "You cannot buy your own item",
                        });
                    }

                    totalCost += item["price"];

                    toAdd.push(item);
                    indexes.push(index);
                } catch (e) {
                    console.error(e);
                    socket.emit("withdraw-item", { status: false, error: "An error occured" });
                }
            }

            const sweepstakeBalance = user.sweepstakeBalance;
            // Check if buyer has sufficent balance
            if (sweepstakeBalance < totalCost) {
                return socket.emit("withdraw-item", {
                    status: false,
                    error: "Insufficent balance",
                });
            }

            // Check KYC requirement
            if (totalCost > 5000 && !user?.kyc) {
                return socket.emit("withdraw-item", {
                    status: false,
                    error: `You need to complete KYC to withdraw more than $5000`,
                    kyc: true,
                });
            }

            // if (process.env.NODE_ENV === "production" && totalCost < 15) {
            //     return socket.emit("withdraw-item", {
            //         status: false,
            //         error: "Minimum withdraw amount is $15",
            //     });
            // }

            const updates = {};

            for (let i = 0; i < toAdd.length; i++) {
                let item = toAdd[i];
                let index = indexes[i];

                // Start withdraw process
                this.pool[index] = { ...this.pool[index], buyer: user._id, status: "pending" };

                // Update transaction record
                const _30_MIN = 1000 * 60 * 30;
                const updated = await p2pDB
                    .findOneAndUpdate(
                        { seller: item["seller"], "item.id": item.id },
                        {
                            buyer: user._id,
                            deadline: Date.now() + _30_MIN,
                            status: "pending",
                        },
                        {
                            new: true,
                            projection: {
                                _id: 0,
                            },
                        },
                    )
                    .lean();

                updated["buyer"] = {
                    avatar: user.avatar,
                    username: user.username,
                    userId: user._id,
                };

                updates[item["seller"]] = [...(updates[item["seller"]] || []), updated];
            }

            // Update buyer sweepstakeBalance
            await userDB.updateOne(
                { _id: user._id },
                { $inc: { sweepstakeBalance: -1 * totalCost } },
            );

            for (let seller of Object.keys(updates)) {
                io.to(this.connections[seller]).emit("seller-response", updates[seller]);
            }

            await Auth.addNotification(user._id, {
                date: Date.now(),
                title: "Withdraw Pending",
                message: "Please wait until seller sends you a trade offer.",
            });

            return socket.emit("withdraw-item", { status: true, totalCost });
        });

        socket.on("check-trades", async () => {
            if (!socket.limiter.isAllowed(socket, "check-trades")) {
                return socket.emit("check-trades", {
                    status: false,
                    error: "Please wait a moment.",
                });
            }

            const user = await this.user(socket.cookie);
            if (!user?._id) return;

            this.connections[user._id.toString()] = socket.id;

            const buyerResponse = [];
            const sellerResponse = [];

            // Check if user has a pending transaction
            for (let poolItem of this.pool) {
                if (poolItem.status !== "marketplace" && poolItem.status !== "pending") continue;

                if (poolItem.seller.toString() === user._id.toString() || poolItem.buyer?.toString() === user._id.toString()) {
                    const item = await p2pDB.findOne({ "item.id": poolItem.id }, { _id: 0 }).lean();
                    if (!item) continue;

                    // Check deadline
                    if (item?.deadline && Date.now() > item.deadline) {
                        await p2pDB.updateOne({ "item.id": poolItem.id }, { status: "timeout" });
                        await this.timeout(item);
                        continue;
                    }

                    // Send seller information (both pending trades and marketplace listings)
                    if (poolItem["seller"].toString() === user._id.toString()) {
                        if (poolItem["buyer"]) {
                            // Has a buyer - pending trade
                            const buyer = await userDB.findOne({ _id: poolItem["buyer"] });

                            item["buyer"] = {
                                avatar: buyer.avatar,
                                username: buyer.username,
                                userId: poolItem["buyer"],
                            };

                            item["tradeLink"] = buyer.tradeURL;
                        } else {
                            // No buyer yet - still on marketplace
                            item["buyer"] = null;
                            item["tradeLink"] = null;
                        }
                        sellerResponse.push(item);
                    } else if (poolItem["buyer"]?.toString() === user._id.toString()) {
                        // Add buyer information to the item
                        item["buyer"] = poolItem["buyer"];
                        buyerResponse.push(item);
                    }
                }
            }

            // Also include CS2 seller holds that are successful but under payout hold
            try {
                if (user?.steamid) {
                    const holds = await p2pDB
                        .find(
                            {
                                seller: user._id,
                                status: "success",
                                payoutReleased: { $ne: true },
                                "item.appid": 730,
                            },
                            { _id: 0 },
                        )
                        .lean();

                    if (holds?.length) {
                        for (const h of holds) {
                            sellerResponse.push(h);
                        }
                    }
                }
            } catch (e) {
                console.error("[P2P] check-trades holds error", e);
            }

            // Send separate responses for buyer and seller
            if (buyerResponse.length > 0) {
                socket.emit("buyer-response", buyerResponse);
            }
            if (sellerResponse.length > 0) {
                socket.emit("seller-response", sellerResponse);
            }

            // If no responses, clear states
            if (buyerResponse.length === 0 && sellerResponse.length === 0) {
                try {
                    socket.emit("buyer-response", []);
                    socket.emit("seller-response", []);
                } catch (e) {}
            }
        });

        socket.on("create-trade", async data => {
            if (!data?.id) return;

            if (!socket.limiter.isAllowed(socket, "create-trade")) {
                return socket.emit("create-trade", {
                    status: false,
                    error: "Please wait a moment.",
                });
            }

            const item = this.getItemByID(data.id);
            if (!item) {
                return socket.emit("create-trade", { status: false, error: "Item not found" });
            }
            if (!item["buyer"]) {
                return socket.emit("create-trade", { status: false, error: "No buyer yet" });
            }

            const buyer = await userDB.findOne({ _id: item["buyer"] });
            if (!buyer?.tradeURL) {
                return socket.emit("create-trade", {
                    status: false,
                    error: "Buyer trade URL not available",
                });
            }

            return socket.emit("create-trade", { status: true, url: buyer.tradeURL });
        });

        socket.on("confirm-trade", async data => {
            try {
                if (!data.position || !data.id) return;

                if (!socket.limiter.isAllowed(socket, "confirm-trade")) {
                    return socket.emit("confirm-trade", {
                        status: false,
                        error: "Please wait a moment.",
                    });
                }

                const user = await this.user(socket.cookie);
                if (!user?._id) return;

                const query = { "item.id": data.id };
                query[data.position] = user.steamid;

                const record = await p2pDB.findOne({ "item.id": data.id }).lean();

                const update = {};
                update["confirmations." + data.position] = true;

                // Buyer cannot confirm the trade before seller
                if (data.position === "buyer" && !record.confirmations.seller) {
                    return socket.emit("confirm-trade", {
                        status: false,
                        error: "You cannot confirm the trade until seller sends a trade offer.",
                    });
                }

                // FINAL STEP
                // If buyer confirms, trade is completed
                else if (data.position === "buyer") {
                    // Mark success immediately but defer payout for CS2
                    update["status"] = "success";

                    const isCS2 = record.item.appid === 730;

                    // Buyer balance already deducted on withdraw; never refund buyer
                    // Determine payout timing for seller
                    if (isCS2) {
                        const ONE_WEEK = 1000 * 60 * 60 * 24 * 7;
                        update["payoutAt"] = Date.now() + ONE_WEEK;
                        update["payoutReleased"] = false;
                    } else {
                        // Immediate payout for non-CS2
                        // Check if user has a deposit bonus
                        const rewardRecord = await rewardsDB.findOne(
                            { _id: user._id },
                            { depositBonus: 1 },
                        );

                        const addAmount = rewardRecord?.depositBonus
                            ? record.item.price + (record.item.price * 5) / 100
                            : record.item.price;

                        const sweepstakeBalance = await GetSweepstakeBalanceForDeposit(addAmount);
                        await userDB.updateOne(
                            { _id: user._id },
                            { $inc: { balance: addAmount, sweepstakeBalance } },
                        );

                        await Affiliate.update("deposit", record.seller, addAmount);
                        await Affiliate.update("withdraw", record.buyer, record.item.price);

                        if (rewardRecord?.depositBonus) {
                            await Rewards.useDepositBonus(record.seller);
                        }
                    }

                    // Remove from pool
                    this.pool = this.pool.filter(i => i.id !== record.item.id);

                    await Auth.addNotification(record.buyer, {
                        date: Date.now(),
                        title: "Withdraw Completed",
                        message: "Withdraw has been completed successfully.",
                    });

                    await Auth.addNotification(record.seller, {
                        date: Date.now(),
                        title: isCS2 ? "Deposit Hold" : "Deposit Completed",
                        message: isCS2
                            ? "Your sale is successful. CS2 payouts are released after 7 days to protect against refunds."
                            : "Deposit has been completed successfully.",
                    });
                }

                await p2pDB.updateOne(query, update);

                socket.emit("confirm-trade", { status: true });

                io.to(this.connections[record["buyer"]]).emit("response-reload");
                io.to(this.connections[record["seller"]]).emit("response-reload");

                // Emit confirmation response to trigger frontend refresh
                io.to(this.connections[record["buyer"]]).emit("confirm-trade-response");
                io.to(this.connections[record["seller"]]).emit("confirm-trade-response");
            } catch (e) {
                console.error(e);
                return socket.emit("confirm-trade", { status: false, error: "An error occured" });
            }
        });

        socket.on("not-received-trade", async data => {
            if (!socket.limiter.isAllowed(socket, "not-received-trade")) {
                return socket.emit("not-received-trade", {
                    status: false,
                    error: "Please wait a moment.",
                });
            }

            const user = await this.user(socket.cookie);
            if (!user?._id) return;

            // Seller marked trade as completed but buyer didn't receive the trade
            const record = await p2pDB.findOneAndUpdate(
                { buyer: user._id, "item.id": data.id },
                { status: "failed" },
            );

            this.pool = this.pool.filter(i => i.id !== record.item.id);

            socket.emit("failed-trade", { id: data.id });
            io.to(this.connections[record["seller"]]).emit("failed-trade", { id: data.id });

            await Auth.addNotification(user._id, {
                date: Date.now(),
                title: "Trade Failed",
                message: "The trade has been marked as completed but you didn't receive the item.",
            });
        });
    }
}
