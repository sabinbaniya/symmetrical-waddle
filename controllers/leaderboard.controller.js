import User from "../models/User.js";
import Games from "../models/Games.js";
import censorUsername from "../utils/censorUsername.js";

export const getLeaderboard = async (req, res) => {
    try {
        const period = req.query.period || "weekly";

        const endDate = new Date();
        let startDate;

        switch (period) {
            case "monthly":
                startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
                break;
            case "weekly":
            default:
                startDate = new Date(endDate);
                startDate.setDate(endDate.getDate() - 7);
                break;
        }

        // Get top 20 users by experience
        const users = await User.aggregate([
            {
                $match: {
                    experience: { $gt: 0 },
                    banned: false,
                },
            },
            {
                $sort: { experience: -1 },
            },
            {
                $limit: 20,
            },
            {
                $project: {
                    _id: 1,
                    avatar: 1,
                    username: 1,
                },
            },
        ]);

        // For each user, calculate their total wager in the period
        const usersWithWager = await Promise.all(
            users.map(async user => {
                const wagerResult = await Games.aggregate([
                    {
                        $match: {
                            user: user._id,
                            date: {
                                $gte: startDate,
                                $lt: endDate,
                            },
                        },
                    },
                    {
                        $group: {
                            _id: null,
                            totalWager: { $sum: "$wager" },
                        },
                    },
                ]);

                return {
                    ...user,
                    wager: wagerResult[0]?.totalWager || 0,
                    username: censorUsername(user.username),
                };
            }),
        );

        // Sort by wager descending
        usersWithWager.sort((a, b) => b.wager - a.wager);

        // Remove _id before sending to client
        const result = usersWithWager.map(({ _id, ...rest }) => rest);

        return res.status(200).json(result);
    } catch (error) {
        console.error("Error fetching leaderboard:", error);
        return res.status(500).json({
            error: "Failed to fetch leaderboard data.",
        });
    }
};
