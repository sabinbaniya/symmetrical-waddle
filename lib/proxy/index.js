import axios from "axios";
import { readFileSync } from "fs";
import { setupCache } from "axios-cache-interceptor";

let lastUsedProxy = null;

function getRandomProxy(proxyList) {
    let proxy;
    do {
        proxy = proxyList[Math.floor(Math.random() * proxyList.length)];
    } while (proxy === lastUsedProxy && proxyList.length > 1);

    lastUsedProxy = proxy;
    return proxy;
}

function makeRequestWithProxy(url, proxy, timeout = 2000) {
    const [host, port, username, password] = proxy.split(":");

    const axiosInstance = axios.create({
        proxy: {
            host,
            port: parseInt(port),
            auth: { username, password },
            protocol: "http",
        },
        timeout: timeout,
    });
    setupCache(axiosInstance, {
        ttl: 1000 * 60 * 60 * 3,
    });

    return axiosInstance.get(url);
}

export async function axiosProxy(url, maxAttempts = 3, timeout = 5000) {
    // Read the list of proxies from list.txt
    const proxyList = readFileSync(process.cwd() + "/lib/proxy/list.txt", "utf-8")
        .split("\n")
        .filter(Boolean);

    if (proxyList.length === 0) {
        throw new Error("No proxies found in list.txt");
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const proxy = getRandomProxy(proxyList);

        try {
            const response = await makeRequestWithProxy(url, proxy, timeout);
            return response.data;
        } catch (error) {
            console.error(`Attempt ${attempt} failed:`, error.message);

            if (attempt === maxAttempts) {
                console.log(error);
                throw new Error(`Failed after ${maxAttempts} attempts`);
            }
        }
    }
}
