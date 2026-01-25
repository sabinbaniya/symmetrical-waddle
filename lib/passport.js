import passport from "passport";
import { Strategy as SteamStrategy } from "passport-steam";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as DiscordStrategy } from "passport-discord";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";
import User from "../models/User.js";

const MAIN_URL = process.env.MAIN_URL || "http://localhost:3000";
const API_URL = process.env.API_URL || "http://localhost:4000";

passport.serializeUser((user, done) => {
    console.log("serializeUser", user);
    done(null, user._id); // Using steamid as the main identifier
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        console.log("deserializeUser", user);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

// Steam Strategy
passport.use(
    new SteamStrategy(
        {
            returnURL: `${API_URL}/auth/steam/return`,
            realm: `${API_URL}/`,
            apiKey: process.env.STEAM_API_KEY,
        },
        async (identifier, profile, done) => {
            try {
                // Steam profile structure cleaning
                const userProfile = {
                    steamid: profile.id,
                    username: profile.displayName,
                    avatar: profile.photos[2].value, // Large avatar
                    email: null, // Steam doesn't provide email
                };

                // Specific logic for Steam: Try to find by steamid
                let user = await User.findOne({ steamid: userProfile.steamid });

                if (!user) {
                    user = await User.create({
                        username: userProfile.username,
                        steamid: userProfile.steamid,
                        avatar: userProfile.avatar,
                        registerMethod: "steam",
                        registerDate: Date.now(),
                        experience: 0,
                    });
                }

                return done(null, user);
            } catch (err) {
                return done(err, null);
            }
        },
    ),
);

// Google Strategy
passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: `${API_URL}/auth/google/callback`,
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                const userProfile = {
                    username: profile.displayName,
                    email: profile.emails[0].value,
                    avatar: profile.photos[0].value,
                    googleId: profile.id,
                };

                // Find by secondaryID (Google ID) or email
                let user = await User.findOne({
                    $or: [{ secondaryID: userProfile.googleId }, { email: userProfile.email }],
                });

                if (!user) {
                    user = await User.create({
                        username: userProfile.username,
                        secondaryID: userProfile.googleId,
                        email: userProfile.email,
                        avatar: userProfile.avatar,
                        registerMethod: "google",
                        registerDate: Date.now(),
                        experience: 0,
                    });
                } else if (!user.secondaryID) {
                    // Link Google ID if user was previously found only by email
                    user.secondaryID = userProfile.googleId;
                    await user.save();
                }

                return done(null, user);
            } catch (err) {
                return done(err, null);
            }
        },
    ),
);

// Discord Strategy
passport.use(
    new DiscordStrategy(
        {
            clientID: process.env.DISCORD_CLIENT_ID,
            clientSecret: process.env.DISCORD_CLIENT_SECRET,
            callbackURL: `${API_URL}/auth/discord/callback`,
            scope: ["identify", "email"],
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                console.log("[DISCORD AUTH] Profile received:", profile.id, profile.username);
                const userProfile = {
                    username: profile.username,
                    email: profile.email,
                    avatar: `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`,
                    discordId: profile.id,
                };

                let user = await User.findOne({
                    $or: [{ secondaryID: userProfile.discordId }, { email: userProfile.email }],
                });

                if (!user) {
                    console.log(
                        "[DISCORD AUTH] Creating new user for Discord ID:",
                        userProfile.discordId,
                    );
                    user = await User.create({
                        username: userProfile.username,
                        secondaryID: userProfile.discordId,
                        email: userProfile.email,
                        avatar: userProfile.avatar,
                        registerMethod: "discord",
                        registerDate: Date.now(),
                        experience: 0,
                    });
                } else if (!user.secondaryID) {
                    // Link Discord ID if user was previously found only by email
                    user.secondaryID = userProfile.discordId;
                    await user.save();
                }

                return done(null, user);
            } catch (err) {
                console.error("[DISCORD AUTH] Verification Error:", err);
                return done(err, null);
            }
        },
    ),
);

// Debug Log for Discord Configuration
console.log("[DISCORD CONFIG] Client ID:", process.env.DISCORD_CLIENT_ID ? "PRESENT" : "MISSING");
console.log(
    "[DISCORD CONFIG] Client Secret:",
    process.env.DISCORD_CLIENT_SECRET ? "PRESENT" : "MISSING",
);
console.log("[DISCORD CONFIG] Callback URL:", `${API_URL}/auth/discord/callback`);

// Local Strategy
passport.use(
    new LocalStrategy(
        {
            usernameField: "email",
            passwordField: "password",
        },
        async (email, password, done) => {
            try {
                const user = await User.findOne({ email }).select("+password");
                if (!user) {
                    return done(null, false, { message: "Invalid credentials" });
                }

                if (!user.password) {
                    return done(null, false, { message: "Please log in with your social account" });
                }

                const isMatch = await bcrypt.compare(password, user.password);
                if (!isMatch) {
                    return done(null, false, { message: "Invalid credentials" });
                }

                return done(null, user);
            } catch (err) {
                return done(err);
            }
        },
    ),
);

export default passport;
