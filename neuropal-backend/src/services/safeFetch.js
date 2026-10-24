const fs = require('fs');
const net = require('net');
const https = require('https');
const dns = require('dns').promises;

// Download a user-supplied https URL without letting it reach the server's
// own network (SSRF): the API sits next to MongoDB, Qdrant and Ollama, and on
// a shared VPS next to other people's services.
//   - https only, on every redirect hop (redirects are followed by hand)
//   - every hostname is resolved first and EVERY address must be public;
//     the connection is then pinned to the checked address (no DNS
//     rebinding between the check and the connect)
//   - streamed to disk with a hard byte cap and an overall deadline
//   - errors are generic: no internal hostnames, ports or certs leak back

const BLOCKED = new net.BlockList();
for (const [addr, prefix] of [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.88.99.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
]) {
    BLOCKED.addSubnet(addr, prefix, 'ipv4');
}
for (const [addr, prefix] of [
    // (no ::ffff:0:0/96 rule: BlockList matches IPv4 addresses against
    // IPv4-mapped IPv6 rules, so it would block every IPv4 address; mapped
    // addresses are unwrapped and checked as IPv4 in isPublicAddress)
    ['::', 128],
    ['::1', 128],
    ['64:ff9b::', 96], // NAT64
    ['100::', 64],
    ['2001:db8::', 32],
    ['2002::', 16], // 6to4
    ['fc00::', 7],
    ['fe80::', 10],
    ['ff00::', 8],
]) {
    BLOCKED.addSubnet(addr, prefix, 'ipv6');
}

class FetchError extends Error {
    constructor(message) {
        super(message);
        this.expose = true;
        this.status = 502;
    }
}

function isPublicAddress(address) {
    const family = net.isIP(address);
    if (family === 4) return !BLOCKED.check(address, 'ipv4');
    if (family === 6) {
        const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
        if (mapped) return !BLOCKED.check(mapped[1], 'ipv4');
        return !BLOCKED.check(address, 'ipv6');
    }
    return false;
}

async function resolvePublic(hostname) {
    if (net.isIP(hostname)) {
        if (!isPublicAddress(hostname)) throw new FetchError('that address is not allowed');
        return { address: hostname, family: net.isIP(hostname) };
    }
    let addresses;
    try {
        addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    } catch (e) {
        throw new FetchError('could not find that website');
    }
    if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address))) {
        throw new FetchError('that address is not allowed');
    }
    return addresses[0];
}

function getOnce(url, pinned, deadline) {
    return new Promise((resolve, reject) => {
        // the deadline covers connecting and waiting for headers too, not
        // just the idle socket
        const hardStop = setTimeout(
            () => req.destroy(new FetchError('the website took too long to answer')),
            Math.max(1, deadline - Date.now()),
        );
        const req = https.get(
            url,
            {
                // pin the connection to the address that was checked
                lookup: (host, opts, cb) => {
                    if (opts && opts.all) cb(null, [{ address: pinned.address, family: pinned.family }]);
                    else cb(null, pinned.address, pinned.family);
                },
                servername: url.hostname,
                headers: { 'User-Agent': 'NeuroPal/1.0 (+paper import)', Accept: 'application/pdf,*/*' },
                timeout: Math.max(1000, deadline - Date.now()),
            },
            (res) => {
                clearTimeout(hardStop);
                resolve(res);
            },
        );
        req.on('timeout', () => req.destroy(new FetchError('the website took too long to answer')));
        req.on('error', (e) => {
            clearTimeout(hardStop);
            reject(e instanceof FetchError ? e : new FetchError('could not download the file'));
        });
    });
}

// → { bytes, contentType }. Writes to destPath (removed on failure).
async function downloadPublicHttps(rawUrl, { destPath, maxBytes, timeoutMs = 90000, maxRedirects = 5 }) {
    const deadline = Date.now() + timeoutMs;
    let url;
    try {
        url = new URL(String(rawUrl));
    } catch (e) {
        throw new FetchError('that link is not a valid address');
    }
    for (let hop = 0; hop <= maxRedirects; hop += 1) {
        if (url.protocol !== 'https:') throw new FetchError('only https links can be imported');
        if (url.username || url.password) throw new FetchError('links with a login in them are not allowed');
        const pinned = await resolvePublic(url.hostname.replace(/^\[|\]$/g, ''));
        const res = await getOnce(url, pinned, deadline);
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            try {
                url = new URL(res.headers.location, url);
            } catch (e) {
                throw new FetchError('the website sent a broken redirect');
            }
            continue;
        }
        if (res.statusCode !== 200) {
            res.resume();
            throw new FetchError(`the website answered ${res.statusCode}`);
        }
        const declared = Number(res.headers['content-length']);
        if (Number.isFinite(declared) && declared > maxBytes) {
            res.resume();
            throw new FetchError('that file is too large to import');
        }
        return await new Promise((resolve, reject) => {
            let bytes = 0;
            const out = fs.createWriteStream(destPath, { flags: 'wx' });
            const fail = (err) => {
                res.destroy();
                out.destroy();
                fs.promises.unlink(destPath).catch(() => {});
                reject(err instanceof FetchError ? err : new FetchError('could not download the file'));
            };
            const timer = setTimeout(() => fail(new FetchError('the download took too long')), Math.max(0, deadline - Date.now()));
            res.on('data', (chunk) => {
                bytes += chunk.length;
                if (bytes > maxBytes) {
                    clearTimeout(timer);
                    fail(new FetchError('that file is too large to import'));
                }
            });
            res.on('error', (e) => {
                clearTimeout(timer);
                fail(e);
            });
            out.on('error', (e) => {
                clearTimeout(timer);
                fail(e);
            });
            out.on('finish', () => {
                clearTimeout(timer);
                resolve({ bytes, contentType: String(res.headers['content-type'] || '') });
            });
            res.pipe(out);
        });
    }
    throw new FetchError('too many redirects');
}

module.exports = { downloadPublicHttps, isPublicAddress, FetchError };
