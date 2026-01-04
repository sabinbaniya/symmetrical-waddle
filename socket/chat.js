import Auth from "../lib/auth.js";
import chatDB from "../models/Chat.js";
import userDB from "../models/User.js";
import rolesDB from "../models/Roles.js";
import { dateToDDMMYYYYHHMM } from "../lib/helpers.js";
import { GetUserByCookie } from "../func/GetUserByCookie.js";

const allowedRooms = ["English", "Turkish", "French"];

export default class Chat {
    constructor() {
        this.online = {};
        this.onlineUsers = {}; // Track usernames with steamids
        this.clients = {};
        this.messages = {};
        this.inflationValues = {};
        this.roleColors = {}; // Cache for role colors

        this.startInflationUpdates();
        this.loadRoleColors(); // Load role colors on initialization

        allowedRooms.forEach(room => {
            this.online[room] = [];
            this.onlineUsers[room] = {};
        });
    }

    async loadRoleColors() {
        try {
            const roles = await rolesDB.find({});
            roles.forEach(role => {
                this.roleColors[role.role] = role.color;
            });
        } catch (e) {
            console.error("Failed to load role colors:", e);
        }
    }

    async refreshRoleColors() {
        await this.loadRoleColors();
    }

    startInflationUpdates() {
        setInterval(() => {
            allowedRooms.forEach(room => {
                if (this.inflationValues[room]) {
                    this.inflationValues[room] += Math.floor(Math.random() * 4) - 2;
                    if (this.inflationValues[room] < 4) this.inflationValues[room] = 4;
                } else {
                    switch (room) {
                        case "English":
                            this.inflationValues[room] = Math.floor(Math.random() * 71) + 50;
                            break;
                        default:
                            this.inflationValues[room] = Math.floor(Math.random() * 8) + 7;
                            break;
                    }
                }
            });
        }, 20_000);

        // Refresh role colors every 5 minutes
        setInterval(async () => {
            await this.refreshRoleColors();
        }, 5 * 60 * 1000);
    }

    async getMessages(room) {
        const response = await chatDB.aggregate([
            {
                $match: { room },
            },
            {
                $project: {
                    messages: 1,
                },
            },
        ]);

        const messages = response?.[0]?.messages;

        if (!messages?.length) return [];
        return messages;
    }

    async addMessage(room, message) {
        try {
            await chatDB.findOneAndUpdate(
                { room },
                {
                    $push: {
                        messages: {
                            $each: [message],
                            $slice: -50,
                        },
                    },
                },
                { upsert: true },
            );
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    addMessageToMemory(room, message) {
        if (!this.messages[room]) {
            this.messages[room] = [];
        }

        this.messages[room].push(message);

        if (this.messages[room].length > 50) {
            this.messages[room] = this.messages[room].slice(-50);
        }
    }

    async broadcastMessages(room) {
        if (!this?.io) return;

        this.io.to(room).emit("message-response", {
            status: true,
            room,
            output: this.messages[room] || [],
        });
    }

    listen(io, socket) {
        this.io = io;

        socket.on("disconnect", () => {
            if (this.clients?.[socket.id]) {
                const client = this.clients[socket.id];
                const onlineIndex = this.online?.[client.room]?.indexOf(client.steamid);

                if (onlineIndex !== -1) {
                    this.online[client.room].splice(onlineIndex, 1);
                    delete this.onlineUsers[client.room][client.steamid];
                }

                delete this.clients[socket.id];
            }
        });

        socket.on("join-room", async data => {
            if (!socket.limiter.isAllowed(socket, "join-room")) {
                return socket.emit("message-response", {
                    status: false,
                    room: data?.room,
                    message: "Please wait a moment.",
                });
            }

            const room = data?.room;
            if (!allowedRooms.includes(room)) return;

            // Refresh role colors to ensure they're up to date
            await this.refreshRoleColors();

            socket.join(room);

            if (!this.messages?.[room]) {
                try {
                    const messages = await this.getMessages(room);
                    this.messages[room] = messages.slice(-50);
                } catch (e) {
                    console.error(e);
                    return socket.emit("message-response", {
                        status: false,
                        room,
                        message: "A Server exception has occured",
                    });
                }
            }

            io.to(room).emit("get-messages", { messages: this.messages[room] });

            const onlineNumbers = {};

            if (socket.cookie) {
                try {
                    const user = await GetUserByCookie(socket.cookie);

                    if (user?.steamid) {
                        this.clients[socket.id] = {
                            steamid: user.steamid,
                            room,
                        };

                        if (!this.online?.[room]) this.online[room] = [user.steamid];

                        for (let r of Object.keys(this.online)) {
                            if (this.online[r].includes(user.steamid)) {
                                this.online[r].splice(this.online[r].indexOf(user.steamid), 1);
                                delete this.onlineUsers[r][user.steamid];
                            }
                        }

                        this.online[room].push(user.steamid);
                        this.onlineUsers[room][user.steamid] = {
                            username: user.username,
                            avatar: user.avatar
                        };
                    }
                } catch (e) {
                    console.error(e);
                }
            }

            for (let r of Object.keys(this.online)) {
                onlineNumbers[r] = this.online[r].length + this.inflationValues[r];
            }

            io.emit("online-users", onlineNumbers);
        });

        socket.on("online-users", () => {
            const onlineNumbers = {};

            for (let r of Object.keys(this.online)) {
                onlineNumbers[r] = this.online[r].length + this.inflationValues[r];
            }

            socket.emit("online-users", onlineNumbers);
        });

        socket.on("get-online-users", () => {
            const room = this.clients[socket.id]?.room;
            if (room && this.onlineUsers[room]) {
                socket.emit("online-users-list", {
                    users: this.onlineUsers[room]
                });
            }
        });

        socket.on("send-message", async data => {
            if (!socket.limiter.isAllowed(socket, "send-message")) {
                return socket.emit("message-response", {
                    status: false,
                    room: data?.room,
                    message: "You are sending messages too fast",
                });
            }

            if (!socket.cookie) return;

            const user = await GetUserByCookie(socket.cookie);
            if (!user?.steamid) return;

            const room = data?.room;
            if (!allowedRooms.includes(room)) return;

            const messageText = data?.message;
            if (!messageText) return;

            if (user?.muted && user.muted > Date.now()) {
                return socket.emit("message-response", {
                    status: false,
                    room,
                    message: `You are muted until ${dateToDDMMYYYYHHMM(user.muted)}`,
                });
            }

            if (user?.banned) {
                return socket.emit("message-response", {
                    status: false,
                    room,
                    message: "You are banned from the website.",
                });
            }

            if (messageText.length > 256) {
                return socket.emit("message-response", {
                    status: false,
                    room,
                    message: "Your message is too long.",
                });
            }

            if (
                messageText.startsWith("/mute") ||
                messageText.startsWith("/ban") ||
                messageText.startsWith("/unmute") ||
                messageText.startsWith("/unban")
            ) {
                if (user.role === "mod" || user.role === "admin") {
                    const [command, target] = messageText.split(" ");

                    if (!target) {
                        return socket.emit("message-response", {
                            status: false,
                            room,
                            message: "Please specify a user to mute/ban.",
                        });
                    }

                    if (command === "/mute") {
                        let duration = messageText.split(" ")[2];

                        switch (duration.at(-1)) {
                            case "s":
                                duration = parseInt(duration.slice(0, -1)) * 1000;
                                break;
                            case "m":
                                duration = parseInt(duration.slice(0, -1)) * 60 * 1000;
                                break;
                            case "h":
                                duration = parseInt(duration.slice(0, -1)) * 60 * 60 * 1000;
                                break;
                            case "d":
                                duration = parseInt(duration.slice(0, -1)) * 24 * 60 * 60 * 1000;
                                break;
                            default:
                                return socket.emit("message-response", {
                                    status: false,
                                    room,
                                    message: "Invalid duration format. Use s, m, h, or d.",
                                });
                        }

                        const muteDate = Date.now() + duration;

                        await userDB.updateOne(
                            {
                                steamid: target,
                            },
                            {
                                $set: { muted: muteDate },
                            },
                        );

                        return socket.emit("message-response", {
                            status: true,
                            room,
                            message: `User ${target} has been muted.`,
                        });
                    } else if (command === "/ban") {
                        await userDB.updateOne(
                            {
                                steamid: target,
                            },
                            {
                                $set: { banned: true },
                            },
                        );

                        return socket.emit("message-response", {
                            status: true,
                            room,
                            message: `User ${target} has been banned.`,
                        });
                    } else if (command === "/unmute") {
                        await userDB.updateOne(
                            {
                                steamid: target,
                            },
                            {
                                $set: { muted: null },
                            },
                        );

                        return socket.emit("message-response", {
                            status: true,
                            room,
                            message: `User ${target} has been unmuted.`,
                        });
                    } else if (command === "/unban") {
                        await userDB.updateOne(
                            {
                                steamid: target,
                            },
                            {
                                $set: { banned: false },
                            },
                        );

                        return socket.emit("message-response", {
                            status: true,
                            room,
                            message: `User ${target} has been unbanned.`,
                        });
                    }
                }
            }

            if (!this.messages?.[room]) {
                try {
                    const messages = await this.getMessages(room);
                    this.messages[room] = messages.slice(-50);
                } catch (e) {
                    console.error(e);

                    return socket.emit("message-response", {
                        status: false,
                        room,
                        message: "A Server exception has occured",
                    });
                }
            }

            const message = {
                message: messageText,
                date: Date.now(),
                user: {
                    steamid: user.steamid,
                    username: user.username,
                    avatar: user.avatar,
                    level: Auth.expToLevel(user.experience),
                    role: user.role, // Include role in message
                    color: this.roleColors[user.role] || "#000000", // Include role color
                },
            };

            try {
                this.addMessageToMemory(room, message);
                await this.addMessage(room, message);
                await this.broadcastMessages(room);
            } catch (e) {
                console.error(e);
                return socket.emit("message-response", {
                    status: false,
                    room,
                    message: "Failed to send message",
                });
            }
        });
    }
}
