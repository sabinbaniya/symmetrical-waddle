import Auth from "../lib/auth.js";
import rainDB from "../models/Rain.js";
import userDB from "../models/User.js";
import gamesDB from "../models/Games.js";
import { GetUserByCookie } from "../func/GetUserByCookie.js";

export default class Rain {
    constructor() {
        this.currentRain = null;
        this.distributionTimer = null;
        this.rainCountdownTimer = null;
        this.io = null;

        // Configuration constants
        this.RAIN_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours
        this.RAIN_JOIN_DURATION = 60 * 1000; // 60 seconds to join
        this.MIN_TIP_AMOUNT = 1; // Minimum 1 coin to tip
        this.MIN_WAGER_REQUIREMENT = 0; // Minimum 0 coins wagered in 7 days (for testing)
        this.WAGER_PERIOD_DAYS = 7; // 7 day wager period
    }

    // ==================== INITIALIZATION ====================

    async initialize() {
        let rain = await rainDB.findOne({ status: { $in: ["idle", "raining"] } });

        if (!rain) {
            rain = await this.createNewRainSession();
        }

        this.currentRain = rain;
        this.startDistributionTimer();
    }

    async createNewRainSession() {
        return await rainDB.create({
            pot: 0,
            participants: [],
            status: "idle",
            nextDistribution: new Date(Date.now() + this.RAIN_INTERVAL),
            distributionInterval: this.RAIN_INTERVAL,
            rainDuration: this.RAIN_JOIN_DURATION,
        });
    }

    startDistributionTimer() {
        if (this.distributionTimer) {
            clearInterval(this.distributionTimer);
        }

        // Check every minute if it's time to start rain
        this.distributionTimer = setInterval(async () => {
            await this.checkAndStartRain();
        }, 60 * 1000);
    }

    async checkAndStartRain() {
        const rain = await rainDB.findOne({ status: "idle" });
        if (!rain) return;

        if (new Date() >= rain.nextDistribution && rain.pot > 0) {
            await this.startRain();
        }
    }

    // ==================== RAIN LIFECYCLE ====================

    async startRain() {
        const rain = await rainDB.findOne({ status: "idle" });
        if (!rain || rain.pot <= 0) return;

        const rainStartTime = new Date();
        const endsAt = new Date(rainStartTime.getTime() + this.RAIN_JOIN_DURATION);

        await rainDB.updateOne(
            { _id: rain._id },
            {
                status: "raining",
                rainStartTime: rainStartTime,
                participants: [],
            },
        );

        this.broadcastRainStarted(rain.pot, endsAt);
        this.scheduleDistribution();
    }

    broadcastRainStarted(pot, endsAt) {
        if (this.io) {
            this.io.emit("rain-started", {
                pot: pot,
                duration: this.RAIN_JOIN_DURATION,
                endsAt: endsAt,
            });
        }
    }

    scheduleDistribution() {
        this.rainCountdownTimer = setTimeout(async () => {
            await this.distributeRain();
        }, this.RAIN_JOIN_DURATION);
    }

    async distributeRain() {
        const rain = await rainDB.findOne({ status: "raining" });

        if (!rain || rain.pot <= 0) {
            await this.resetRain();
            return;
        }

        await rainDB.updateOne({ _id: rain._id }, { status: "distributing" });

        try {
            const joinedParticipants = rain.participants || [];

            if (joinedParticipants.length === 0) {
                await this.handleNoParticipants(rain.pot);
                return;
            }

            const eligibleParticipants = this.filterEligibleParticipants(joinedParticipants);
            const winners = this.calculateWinnerShares(eligibleParticipants, rain.pot);

            await this.awardWinners(winners);
            await this.saveDistributionHistory(rain, eligibleParticipants, winners);
            this.broadcastDistributionResults(rain.pot, winners, eligibleParticipants.length);

            await this.resetRain();
        } catch (error) {
            console.error("Rain distribution error:", error);
            await rainDB.updateOne({ _id: rain._id }, { status: "active" });
        }
    }

    async handleNoParticipants(pot) {
        await this.resetRain();
        if (this.io) {
            this.io.emit("rain-ended", {
                message: "Rain ended - no one joined",
                pot: pot,
            });
        }
    }

    filterEligibleParticipants(participants) {
        return participants.filter(p => p.wager7d >= this.MIN_WAGER_REQUIREMENT);
    }

    calculateWinnerShares(participants, pot) {
        const totalLevels = participants.reduce((sum, p) => sum + p.level, 0);
        const totalWager = participants.reduce((sum, p) => sum + p.wager7d, 0);

        return participants.map(participant => {
            const share = this.calculateParticipantShare(
                participant,
                participants.length,
                totalLevels,
                totalWager,
            );
            const amount = Math.floor(pot * share * 100) / 100;

            return {
                steamid: participant.steamid,
                username: participant.username,
                amount: amount,
                level: participant.level,
                wager7d: participant.wager7d,
            };
        });
    }

    calculateParticipantShare(participant, participantCount, totalLevels, totalWager) {
        // Single participant gets 100%
        if (participantCount === 1) {
            return 1;
        }

        const levelScore = totalLevels > 0 ? participant.level / totalLevels : 0;
        const wagerScore = totalWager > 0 ? participant.wager7d / totalWager : 0;

        // If no one wagered, use level only
        if (totalWager === 0) {
            return levelScore;
        }

        // Weighted: 50% level + 50% wager
        return 0.5 * levelScore + 0.5 * wagerScore;
    }

    async awardWinners(winners) {
        for (const winner of winners) {
            await userDB.updateOne(
                { steamid: winner.steamid },
                // { $inc: { balance: winner.amount } }
                { $inc: { sweepstakeBalance: winner.amount } },
            );
        }
    }

    async saveDistributionHistory(rain, eligibleParticipants, winners) {
        await rainDB.updateOne(
            { _id: rain._id },
            {
                $push: {
                    history: {
                        $each: [
                            {
                                amount: rain.pot,
                                participants: eligibleParticipants.length,
                                distributedAt: new Date(),
                                winners: winners,
                            },
                        ],
                        $slice: -50, // Keep last 50 distributions
                    },
                },
            },
        );
    }

    broadcastDistributionResults(pot, winners, participantCount) {
        if (this.io) {
            this.io.emit("rain-distributed", {
                pot: pot,
                winners: winners,
                totalParticipants: participantCount,
                eligibleParticipants: participantCount,
            });
        }
    }

    async resetRain() {
        await rainDB.updateOne(
            { status: { $in: ["raining", "distributing"] } },
            {
                pot: 0,
                participants: [],
                tips: [],
                status: "idle",
                lastDistribution: new Date(),
                nextDistribution: new Date(Date.now() + this.RAIN_INTERVAL),
                rainStartTime: null,
            },
        );

        if (this.rainCountdownTimer) {
            clearTimeout(this.rainCountdownTimer);
            this.rainCountdownTimer = null;
        }

        await this.broadcastRainReset();
    }

    async broadcastRainReset() {
        if (this.io) {
            const newRain = await rainDB.findOne({ status: "idle" });
            this.io.emit("rain-status", {
                pot: 0,
                nextDistribution: newRain.nextDistribution,
                status: "idle",
            });
        }
    }

    // ==================== UTILITIES ====================

    async getUserWager7d(steamid) {
        const sevenDaysAgo = new Date(Date.now() - this.WAGER_PERIOD_DAYS * 24 * 60 * 60 * 1000);

        const result = await gamesDB.aggregate([
            {
                $match: {
                    user: steamid,
                    date: { $gte: sevenDaysAgo },
                },
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$wager" },
                },
            },
        ]);

        return result?.[0]?.total || 0;
    }

    async getRainStatus() {
        const rain = await rainDB.findOne({ status: { $in: ["idle", "raining"] } });
        if (!rain) return null;

        const status = {
            pot: rain.pot,
            nextDistribution: rain.nextDistribution,
            status: rain.status,
            rainStartTime: rain.rainStartTime,
            participantsCount: rain.participants?.length || 0,
        };

        if (rain.status === "raining" && rain.rainStartTime) {
            status.endsAt = new Date(rain.rainStartTime.getTime() + this.RAIN_JOIN_DURATION);
            status.duration = this.RAIN_JOIN_DURATION;
        }

        return status;
    }

    // ==================== SOCKET EVENT HANDLERS ====================

    listen(io, socket) {
        this.io = io;

        socket.on("get-rain-status", async () => {
            await this.handleGetRainStatus(socket);
        });

        socket.on("join-rain", async data => {
            await this.handleJoinRain(socket, io);
        });

        socket.on("tip-rain", async data => {
            await this.handleTipRain(socket, io, data);
        });

        socket.on("admin-add-rain", async data => {
            await this.handleAdminAddRain(socket, io, data);
        });
    }

    async handleGetRainStatus(socket) {
        const status = await this.getRainStatus();
        socket.emit("rain-status", status);
    }

    async handleJoinRain(socket, io) {
        // Validate authentication
        const authError = this.validateAuthentication(socket);
        if (authError) {
            return socket.emit("rain-response", authError);
        }

        const user = await GetUserByCookie(socket.cookie);
        if (!user?.steamid) {
            return socket.emit("rain-response", {
                status: false,
                message: "Invalid user session.",
            });
        }

        // Validate rain exists
        const rain = await rainDB.findOne({ status: "raining" });
        if (!rain) {
            return socket.emit("rain-response", {
                status: false,
                message: "No active rain to join.",
            });
        }

        // Check if already joined
        if (rain.participants.some(p => p.steamid === user.steamid)) {
            return socket.emit("rain-response", {
                status: false,
                message: "You have already joined this rain.",
            });
        }

        // Add participant
        await this.addParticipant(rain, user);

        socket.emit("rain-response", {
            status: true,
            message: "Successfully joined the rain!",
        });

        await this.broadcastParticipantJoined(io, user.username);
    }

    async addParticipant(rain, user) {
        const wager7d = await this.getUserWager7d(user.steamid);

        const participant = {
            steamid: user.steamid,
            username: user.username,
            avatar: user.avatar,
            level: Auth.expToLevel(user.experience),
            wager7d: wager7d,
            joinedAt: new Date(),
        };

        await rainDB.updateOne({ _id: rain._id }, { $push: { participants: participant } });
    }

    async broadcastParticipantJoined(io, username) {
        const updatedRain = await rainDB.findOne({ status: "raining" });
        io.emit("rain-participant-joined", {
            participantsCount: updatedRain.participants.length,
            username: username,
        });
    }

    async handleTipRain(socket, io, data) {
        // Rate limiting
        if (!socket.limiter.isAllowed(socket, "tip-rain")) {
            return socket.emit("rain-response", {
                status: false,
                message: "Please wait before tipping again.",
            });
        }

        // Validate authentication
        const authError = this.validateAuthentication(socket);
        if (authError) {
            return socket.emit("rain-response", authError);
        }

        // Validate amount
        const amount = parseFloat(data?.amount);
        const amountError = this.validateTipAmount(amount);
        if (amountError) {
            return socket.emit("rain-response", amountError);
        }

        const user = await GetUserByCookie(socket.cookie);
        if (!user?.steamid) {
            return socket.emit("rain-response", {
                status: false,
                message: "Invalid user session.",
            });
        }

        // Validate balance
        const sweepstakeBalance = user.sweepstakeBalance;
        if (sweepstakeBalance < amount) {
            return socket.emit("rain-response", {
                status: false,
                message: "Insufficient balance.",
            });
        }

        const rain = await rainDB.findOne({ status: { $in: ["idle", "raining"] } });
        if (!rain) {
            return socket.emit("rain-response", {
                status: false,
                message: "No active rain session.",
            });
        }

        // Process tip
        await this.processTip(rain, user, amount);
        await this.broadcastRainStatusUpdate(io);

        socket.emit("rain-response", {
            status: true,
            message: `Successfully tipped ${amount} coins to rain!`,
        });
    }

    async processTip(rain, user, amount) {
        await userDB.updateOne({ steamid: user.steamid }, { $inc: { sweepstakeBalance: -amount } });

        await rainDB.updateOne(
            { _id: rain._id },
            {
                $inc: { pot: amount },
                $push: {
                    tips: {
                        steamid: user.steamid,
                        username: user.username,
                        amount: amount,
                        date: new Date(),
                    },
                },
            },
        );
    }

    async handleAdminAddRain(socket, io, data) {
        // Validate authentication
        const authError = this.validateAuthentication(socket);
        if (authError) {
            return socket.emit("rain-response", authError);
        }

        const user = await GetUserByCookie(socket.cookie);
        if (!user?.steamid) {
            return socket.emit("rain-response", {
                status: false,
                message: "Invalid user session.",
            });
        }

        // Validate admin role
        if (user.role !== "admin" && user.role !== "mod") {
            return socket.emit("rain-response", {
                status: false,
                message: "Unauthorized. Admin access required.",
            });
        }

        // Validate amount
        const amount = parseFloat(data?.amount);
        if (!amount || amount <= 0) {
            return socket.emit("rain-response", {
                status: false,
                message: "Invalid amount.",
            });
        }

        const rain = await rainDB.findOne({ status: { $in: ["idle", "raining"] } });
        if (!rain) {
            return socket.emit("rain-response", {
                status: false,
                message: "No active rain session.",
            });
        }

        // Add to pot (admin doesn't pay)
        await this.processAdminTip(rain, user, amount);
        await this.broadcastRainStatusUpdate(io);

        socket.emit("rain-response", {
            status: true,
            message: `Successfully added ${amount} coins to rain pot!`,
        });
    }

    async processAdminTip(rain, user, amount) {
        await rainDB.updateOne(
            { _id: rain._id },
            {
                $inc: { pot: amount },
                $push: {
                    tips: {
                        steamid: user.steamid,
                        username: `[ADMIN] ${user.username}`,
                        amount: amount,
                        date: new Date(),
                    },
                },
            },
        );
    }

    async broadcastRainStatusUpdate(io) {
        const updatedStatus = await this.getRainStatus();
        io.emit("rain-status", updatedStatus);
    }

    // ==================== VALIDATION HELPERS ====================

    validateAuthentication(socket) {
        if (!socket.cookie) {
            return {
                status: false,
                message: "You must be logged in.",
            };
        }
        return null;
    }

    validateTipAmount(amount) {
        if (!amount || amount < this.MIN_TIP_AMOUNT || amount <= 0 || isNaN(amount)) {
            return {
                status: false,
                message: `Minimum tip amount is ${this.MIN_TIP_AMOUNT} coins.`,
            };
        }
        return null;
    }
}
