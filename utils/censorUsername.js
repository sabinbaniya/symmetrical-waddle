/**
 * Censors a username by showing only the first 2 characters followed by asterisks
 * @param {string} username - The username to censor
 * @returns {string} - The censored username (e.g., "hello" -> "he***")
 */
export function censorUsername(username) {
    if (!username || typeof username !== "string") {
        return "***";
    }

    // If username is 2 characters or less, show first character + asterisks
    if (username.length <= 2) {
        return username.charAt(0) + "***";
    }

    // Show first 2 characters + asterisks
    return username.substring(0, 2) + "***";
}

export default censorUsername;
