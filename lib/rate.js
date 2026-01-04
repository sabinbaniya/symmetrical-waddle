export function createRateLimiter(getDelay) {
    const lastTimestamps = {};
    const pendingEvents = new Set();

    function isAllowed(socket, event) {
        const delay = getDelay(event) || 1000;
        const identifier = socket.handshake.address || socket.id;
        const key = `${identifier}:${event}`;
        const now = Date.now();
        const last = lastTimestamps[key] || 0;

        // Check if this exact event is already being processed
        if (pendingEvents.has(key)) {
            return false;
        }

        if (now - last < delay) {
            return false;
        }

        // Mark this event as being processed
        pendingEvents.add(key);
        
        // Update timestamp immediately to prevent race conditions
        lastTimestamps[key] = now;
        
        // Remove from pending after a short delay to allow the event to complete
        setTimeout(() => {
            pendingEvents.delete(key);
        }, 100);

        return true;
    }

    return { isAllowed };
}
