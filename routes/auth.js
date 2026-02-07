import express from "express";
import passport from "passport";
import bcrypt from "bcrypt";
import User from "../models/User.js";
import { z } from "zod";
import { verifySync } from "otplib";
import jwt from "jsonwebtoken";

const router = express.Router();
const MAIN_URL = process.env.MAIN_URL || "http://localhost:3000";
const isProduction = process.env.NODE_ENV === "production";

// --- Steam Auth ---
router.get("/steam", passport.authenticate("steam", { failureRedirect: MAIN_URL }));

router.get("/steam/return", (req, res, next) => {
    passport.authenticate("steam", { failureRedirect: MAIN_URL }, async (err, user) => {
        if (err || !user) return res.redirect(MAIN_URL);

        if (user.twoFactorEnabled) {
            const preAuthToken = jwt.sign(
                { userId: user._id },
                process.env.SESSION_SECRET,
                { expiresIn: "5m" }
            );
            return res.redirect(`${MAIN_URL}?required2fa=true&token=${preAuthToken}`);
        }

        req.login(user, (err) => {
            if (err) return next(err);
            res.cookie("logged-in", "true", {
                maxAge: 1000 * 60 * 60 * 24 * 7,
                secure: isProduction,
                sameSite: isProduction ? "none" : "lax",
            });
            res.redirect(MAIN_URL);
        });
    })(req, res, next);
});

// --- Google Auth ---
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get("/google/callback", (req, res, next) => {
    passport.authenticate("google", { failureRedirect: MAIN_URL }, async (err, user) => {
        if (err || !user) return res.redirect(MAIN_URL);

        if (user.twoFactorEnabled) {
            const preAuthToken = jwt.sign(
                { userId: user._id },
                process.env.SESSION_SECRET,
                { expiresIn: "5m" }
            );
            return res.redirect(`${MAIN_URL}?required2fa=true&token=${preAuthToken}`);
        }

        req.login(user, (err) => {
            if (err) return next(err);
            res.cookie("logged-in", "true", {
                maxAge: 1000 * 60 * 60 * 24 * 7,
                secure: isProduction,
                sameSite: isProduction ? "none" : "lax",
            });
            res.redirect(MAIN_URL);
        });
    })(req, res, next);
});

// --- Discord Auth ---
router.get("/discord", passport.authenticate("discord"));

router.get("/discord/callback", (req, res, next) => {
    passport.authenticate("discord", { failureRedirect: MAIN_URL }, async (err, user) => {
        if (err || !user) return res.redirect(MAIN_URL);

        if (user.twoFactorEnabled) {
            const preAuthToken = jwt.sign(
                { userId: user._id },
                process.env.SESSION_SECRET,
                { expiresIn: "5m" }
            );
            return res.redirect(`${MAIN_URL}?required2fa=true&token=${preAuthToken}`);
        }

        req.login(user, (err) => {
            if (err) return next(err);
            res.cookie("logged-in", "true", {
                maxAge: 1000 * 60 * 60 * 24 * 7,
                secure: isProduction,
                sameSite: isProduction ? "none" : "lax",
            });
            res.redirect(MAIN_URL);
        });
    })(req, res, next);
});

// --- Logout ---
router.get("/logout", (req, res, next) => {
    req.logout(err => {
        if (err) {
            return next(err);
        }
        res.redirect(MAIN_URL);
    });
});

// --- Get Current User ---
router.get("/me", (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ user: req.user });
    } else {
        res.status(401).json({ user: null });
    }
});

// --- Local Auth ---

const registerSchema = z.object({
    username: z.string().min(3, "Username must be at least 3 characters").max(30, "Username must be at most 30 characters"),
    email: z.email("Invalid email format"),
    password: z.string().min(6, "Password must be at least 6 characters"),
});

const loginSchema = z.object({
    email: z.email("Invalid email format"),
    password: z.string().min(1, "Password is required"),
});

router.post("/register", async (req, res) => {
    try {
        const validation = registerSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: validation.error.issues[0].message });
        }

        const { username, email, password } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "Email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            username,
            email,
            password: hashedPassword,
            registerMethod: "email",
            registerDate: Date.now(),
            experience: 0,
            avatar: "https://files.heydrop.com/avatars/default.png", // Default avatar
        });

        req.login(newUser, (err) => {
            if (err) return res.status(500).json({ message: "Login failed after registration" });
            
            res.cookie("logged-in", "true", {
                maxAge: 1000 * 60 * 60 * 24 * 7,
                secure: isProduction,
                sameSite: isProduction ? "none" : "lax",
            });
            
            return res.status(201).json({ user: newUser });
        });

    } catch (error) {
        console.error("Register Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

router.post("/login", (req, res, next) => {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(400).json({ message: validation.error.issues[0].message });
    }

    passport.authenticate("local", (err, user, info) => {
        if (err) return next(err);
        if (!user) return res.status(400).json({ message: info?.message || "Login failed" });

        if (user.twoFactorEnabled) {
            const preAuthToken = jwt.sign(
                { userId: user._id },
                process.env.SESSION_SECRET,
                { expiresIn: "5m" }
            );
            return res.json({
                twoFactorRequired: true,
                preAuthToken,
            });
        }

        req.login(user, (err) => {
            if (err) return next(err);

            res.cookie("logged-in", "true", {
                maxAge: 1000 * 60 * 60 * 24 * 7,
                secure: isProduction,
                sameSite: isProduction ? "none" : "lax",
            });

            return res.json({ user });
        });
    })(req, res, next);
});

router.post("/login/2fa", async (req, res, next) => {
    try {
        const { preAuthToken, code } = req.body;

        if (!preAuthToken || !code) {
            return res.status(400).json({ message: "Pre-auth token and verification code are required" });
        }

        let decoded;
        try {
            decoded = jwt.verify(preAuthToken, process.env.SESSION_SECRET);
        } catch (err) {
            return res.status(401).json({ message: "Invalid or expired pre-auth token" });
        }

        const userId = decoded.userId;
        const user = await User.findById(userId).select("+twoFactorSecret +twoFactorEnabled");
        if (!user || !user.twoFactorEnabled) {
            return res.status(400).json({ message: "2FA is not enabled for this user" });
        }

        const isValid = verifySync({ token: code, secret: user.twoFactorSecret }).valid;
        if (!isValid) {
            return res.status(400).json({ message: "Invalid verification code" });
        }

        req.login(user, (err) => {
            if (err) return next(err);

            res.cookie("logged-in", "true", {
                maxAge: 1000 * 60 * 60 * 24 * 7,
                secure: isProduction,
                sameSite: isProduction ? "none" : "lax",
            });

            return res.json({ user });
        });
    } catch (error) {
        console.error("2FA login error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

export default router;
