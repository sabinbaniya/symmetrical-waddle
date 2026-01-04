import express from "express";
import passport from "passport";

const router = express.Router();
const MAIN_URL = process.env.MAIN_URL || "http://localhost:3000";
const isProduction = process.env.NODE_ENV === "production";

// --- Steam Auth ---
router.get("/steam", passport.authenticate("steam", { failureRedirect: MAIN_URL }));

router.get(
    "/steam/return",
    passport.authenticate("steam", { failureRedirect: MAIN_URL }),
    (req, res) => {
        res.cookie("logged-in", "true", {
            maxAge: 1000 * 60 * 60 * 24 * 7,
            secure: isProduction,
            sameSite: isProduction ? "none" : "lax",
        });
        res.redirect(MAIN_URL);
    },
);

// --- Google Auth ---
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get(
    "/google/callback",
    passport.authenticate("google", { failureRedirect: MAIN_URL }),
    (req, res) => {
        res.cookie("logged-in", "true", {
            maxAge: 1000 * 60 * 60 * 24 * 7,
            secure: isProduction,
            sameSite: isProduction ? "none" : "lax",
        });
        res.redirect(MAIN_URL);
    },
);

// --- Discord Auth ---
router.get("/discord", passport.authenticate("discord"));

router.get(
    "/discord/callback",
    passport.authenticate("discord", { failureRedirect: MAIN_URL }),
    (req, res) => {
        res.cookie("logged-in", "true", {
            maxAge: 1000 * 60 * 60 * 24 * 7,
            secure: isProduction,
            sameSite: isProduction ? "none" : "lax",
        });
        res.redirect(MAIN_URL);
    },
);

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

export default router;
