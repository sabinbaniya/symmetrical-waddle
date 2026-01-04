import Auth from "../lib/auth.js";
import mongoose from "mongoose";
import cookieSignature from "cookie-signature";

export async function GetUserByCookie(cookie, session) {
    if (!cookie) return null;

    try {
        // Cookie comes as s:sessionID.signature
        // Remove 's:' prefix if present
        const val = cookie.startsWith("s:") ? cookie.slice(2) : cookie;

        const sessionID = cookieSignature.unsign(val, process.env.SESSION_SECRET);

        if (!sessionID) return null;

        // Find session in 'sessions' collection
        // connect-mongo stores sessions with _id = sessionID
        const sessionDoc = await mongoose.connection.db
            .collection("sessions")
            .findOne({ _id: sessionID });

        if (!sessionDoc || !sessionDoc.session) return null;

        const sessionData = JSON.parse(sessionDoc.session);

        if (!sessionData.passport || !sessionData.passport.user) return null;

        const steamid = sessionData.passport.user;

        const user = await Auth.getUserBySteamid(steamid, null, session);

        if (user?.banned) {
            return null;
        }

        if (!user?.steamid) return null;
        return user;
    } catch (e) {
        console.error(e);
        return null;
    }
}
