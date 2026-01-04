import IRL from "./games/irl.js";
import Mines from "./games/mines.js";
import Plinko from "./games/plinko.js";
import Battles from "./games/battles.js";
import Unboxing from "./games/unboxing.js";
import Upgrader from "./games/upgrader.js";
import Game, { BetsDisabled } from "./games/game.js";
import Auth from "../lib/auth.js";
import { GetUserByCookie } from "../func/GetUserByCookie.js";

const game = new Game();

export default class Games {
    constructor() {
        const b = new BetsDisabled();
        const betsDisabled = b.isDisabled.bind(b);

        this.irl = new IRL(betsDisabled);
        this.mines = new Mines(betsDisabled);
        this.plinko = new Plinko(betsDisabled);
        this.battles = new Battles(betsDisabled);
        this.unboxing = new Unboxing(betsDisabled);
        this.upgrader = new Upgrader(betsDisabled);
    }

    async user(cookie) {
        if (!cookie) return;
        return await GetUserByCookie(cookie);
    }

    listen(io, socket) {
        this.irl.listen(io, socket);
        this.mines.listen(io, socket);
        this.plinko.listen(io, socket);
        this.battles.listen(io, socket);
        this.unboxing.listen(io, socket);
        this.upgrader.listen(io, socket);

        // Announce live bets upon connection
        socket.on("get-live-bets", () => {
            game.announce(null, socket, null);
        });

        socket.on("change:active-balance-type", async activeBalanceType => {
            socket.emit("change:active-balance-type", {
                success: false,
                message: "Balance type change is disabled.",
            });

            // const user = await this.user(socket.cookie);
            // if (!user?.steamid) return;

            // if (activeBalanceType !== "balance" && activeBalanceType !== "sweepstakeBalance")
            //     return;

            // await Auth.setUserActiveBalanceType(user.steamid, activeBalanceType);

            // socket.emit("change:active-balance-type", {
            //     success: true,
            //     activeBalanceType,
            // });
        });
    }
}
