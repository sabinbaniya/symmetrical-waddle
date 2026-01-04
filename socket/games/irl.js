import Game, { ProvablyFair } from "./game.js";
import { redis } from "../../lib/redis/client.js";
import { CACHE_KEYS } from "../../lib/redis/keys.js";
import GamesDB from "../../models/Games.js";
import irlDB from "../../models/IRL.js";
import GetIRLCase from "../../func/GetIRLCase.js";
import Auth from "../../lib/auth.js";

const ALLOWED_SPINNER_AMOUNTS = [1, 2, 3, 4];
const SPIN_DURATION = 4300;
const N = 5;
const MAX_WIN_USD = 5_000;

export default class IRLUnboxing extends Game {
    constructor(betsDisabled) {
        super(betsDisabled);
        this.resultArrayLength = 100;
        this.pf = new ProvablyFair();
    }

    percentageToItem(percentage, items) {
        let cumulative = 0;
        const cumulativeDistribution = items.map(item => {
            cumulative += item.percentage;
            return { ...item, cumulative };
        });
        return cumulativeDistribution.find(item => percentage <= item.cumulative);
    }

    async start(caseID, case__ = null, pfContext = null) {
        const case_ = case__ || (await GetIRLCase(caseID));
        if (!case_ || !case_.items?.length) return { status: false, message: "Invalid case" };

        const resultItems = [];
        const items = case_.items;

        if (items.filter(i => i.price).length !== items.length) {
            console.error(`IRL Case ${caseID} contains items without price`);
            return { status: false, message: "An error occured" };
        }

        let percentages;
        if (pfContext && pfContext.serverSeed && pfContext.clientSeed && pfContext.nonce != null) {
            percentages = Array.from({ length: this.resultArrayLength }, (_, i) => {
                const u32 = this.pf.deriveUint32(
                    pfContext.serverSeed,
                    pfContext.clientSeed,
                    pfContext.nonce,
                    i + 1,
                );
                return Math.round(((u32 % 1_000_000) / 1_000_000) * 100 * 100) / 100;
            });
        } else {
            percentages = this.createPercentageArray(this.resultArrayLength);
        }
        for (let i = 0; i < this.resultArrayLength; i++) {
            const item = this.percentageToItem(percentages[i], items);
            if (!item) {
                console.error(`IRL Case ${caseID} contains invalid items`);
                return { status: false, message: "An error occured" };
            }
            resultItems.push(item);
        }

        const max = this.resultArrayLength - 20;
        const min = this.resultArrayLength - 40;
        let force;
        if (pfContext && pfContext.serverSeed && pfContext.clientSeed && pfContext.nonce != null) {
            const span = max - min + 1;
            const u32 = this.pf.deriveUint32(
                pfContext.serverSeed,
                pfContext.clientSeed,
                pfContext.nonce,
                9999,
            );
            force = min + (u32 % span);
        } else {
            force = Math.floor(Math.random() * (max - min + 1)) + min;
        }
        const item = resultItems[force];

        const result = {
            force,
            item,
            itemsArray: resultItems.map(i => ({
                image: i.image,
                price: i.price,
                percentage: i.percentage,
                name: i.name,
            })),
            earning: parseFloat(item.price ? item.price.replace("$", "") : "0"),
        };

        return { status: true, data: result };
    }

    listen(io, socket) {
        this.io = io;

        socket.on("irl:demo-spin", async data => {
            if (!this.rateLimit(socket, "irl:demo-spin")) return;

            if (await this.betsDisabled()) {
                return socket.emit("irl:demo-spin", {
                    status: false,
                    message: "Bets are currently disabled",
                });
            }

            if (!ALLOWED_SPINNER_AMOUNTS.includes(data.spinnerAmount))
                return socket.emit("irl:demo-spin", { status: false, message: "Invalid amount" });

            data.caseID = decodeURIComponent(data?.caseID?.trim());

            const results = [];
            let _status = true,
                _message;
            let totalEarning = 0;

            for (let i = 0; i < data.spinnerAmount; i++) {
                const { data: result, status, message } = await this.start(data.caseID);
                if (!status) {
                    _status = false;
                    _message = message;
                    break;
                }
                results.push(result);
                totalEarning += result.earning;
            }

            if (!_status)
                return socket.emit("irl:demo-spin", { status: _status, message: _message });
            socket.emit("irl:demo-spin", {
                status: _status,
                data: { pools: results, earning: totalEarning },
            });
        });

        socket.on("irl:spin", async data => {
            if (await this.betsDisabled()) {
                return socket.emit("irl:spin", {
                    status: false,
                    message: "Bets are currently disabled",
                });
            }

            if (!this.rateLimit(socket, "irl:spin")) return;

            const user = await this.user(socket.cookie);
            if (!user) return socket.emit("irl:spin", { status: false, message: "Invalid user" });

            if (!ALLOWED_SPINNER_AMOUNTS.includes(data.spinnerAmount))
                return socket.emit("irl:spin", { status: false, message: "Invalid amount" });

            data.caseID = decodeURIComponent(data?.caseID?.trim());
            let case_ = await GetIRLCase(data.caseID);
            if (!case_ || !case_.items?.length)
                return socket.emit("irl:spin", { status: false, message: "Invalid case" });

            const casePrice = case_.price;
            // Require clientSeed for PF
            if (!data.clientSeed || typeof data.clientSeed !== "string")
                return socket.emit("irl:spin", {
                    status: false,
                    message: "clientSeed is required",
                });

            const userBalance = await Auth.getUserBalance(user.steamid);
            if (userBalance < casePrice * data.spinnerAmount || casePrice * data.spinnerAmount <= 0)
                return socket.emit("irl:spin", { status: false, message: "Insufficient balance" });

            const results = [];
            let _status = true,
                _message;
            let totalEarning = 0;

            // Provably Fair seeds and commitment
            const serverSeed = (await import("crypto")).randomBytes(32).toString("hex");
            const nonce = await redis.incr(CACHE_KEYS.GAMES_IRL_NONCE_BY_USER(user.steamid));
            const serverSeedCommitment = this.pf.computeServerSeedCommitment(serverSeed);
            const pfStart = { serverSeedCommitment, clientSeed: data.clientSeed, nonce };
            socket.emit("irl:pf", pfStart);

            for (let i = 0; i < data.spinnerAmount; i++) {
                const { data: result, status, message } = await this.start(null, case_, pfStart);
                if (!status) {
                    ((_status = false), (_message = message));
                    break;
                }
                results.push(result);
                totalEarning += result.earning;
            }

            if (totalEarning > MAX_WIN_USD) {
                totalEarning = MAX_WIN_USD;
            }

            if (!_status) return socket.emit("irl:spin", { status: _status, message: _message });

            socket.emit("irl:spin", {
                status: _status,
                data: { pools: results, earning: totalEarning },
            });

            const balanceResponse = await this.addBalance(
                socket.cookie,
                totalEarning - casePrice * data.spinnerAmount,
            );
            if (!balanceResponse)
                return socket.emit("irl:spin", { status: false, message: "An error occured" });

            await irlDB.updateOne({ id: data.caseID }, { $inc: { spins: data.spinnerAmount } });

            this.saveGame([
                {
                    game: "irl",
                    user: user.steamid,
                    wager: casePrice * data.spinnerAmount,
                    earning: totalEarning,
                    pf: pfStart,
                },
                null,
                user.activeBalanceType,
            ]);

            setTimeout(async () => {
                this.announce(io, null, {
                    game: "IRL Unboxing",
                    date: Date.now(),
                    pfp: user.avatar,
                    user: user.username,
                    payout: totalEarning,
                    wager: casePrice * data.spinnerAmount,
                    multiplier: totalEarning / (casePrice * data.spinnerAmount),
                });
                // Reveal server seed and persist after 4 seconds
                try {
                    socket.emit("irl:proof", {
                        serverSeed,
                        serverSeedCommitment,
                        clientSeed: data.clientSeed,
                        nonce,
                    });
                    await GamesDB.updateOne(
                        {
                            user: user.steamid,
                            game: "irl",
                            "pf.serverSeedCommitment": serverSeedCommitment,
                        },
                        { $set: { "pf.serverSeed": serverSeed } },
                    );
                } catch {}
            }, 4000);
        });
    }
}
