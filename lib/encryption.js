import "dotenv/config";
import jwt from "jsonwebtoken";

export class Encryption {
    /**
     * Generates a JWT token
     * @returns {string} JWT token
     */
    static generateJwt(payload, expire = "90d") {
        return jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: expire,
        });
    }

    /**
     * Decodes the JWT token
     * @param {JwtPayload} token JWT token
     */
    static decodeJwt(token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return decoded;
    }
}
