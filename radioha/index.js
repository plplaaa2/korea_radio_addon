const http = require('http');
const { randomBytes, randomUUID } = require('crypto');
const { isIP } = require('net');
const child_process = require("child_process");
const fs = require('fs');
const axios = require('axios');
const path = require('path');

const port = 3005;
const OPTIONS_FILE = '/data/options.json';
const STATION_CHANGES_FILE = path.join(path.dirname(OPTIONS_FILE), 'radio-stations.json');
let mytoken = 'homeassistant'; // 기본값
// Keep browser credentials separate from the integration API credential. Related: index.html.
const localBrowserSession = randomBytes(32).toString('hex');
const remoteBrowserSession = randomBytes(32).toString('hex');
const defaultToken = mytoken;
const sessionCookie = 'radioha_session';
const ingressPeer = '172.30.32.2';
const maxBodyBytes = 16 * 1024;
const maxAuthFailures = 4096;

// Bound concurrent FFmpeg processes. Related: config.json, Dockerfile.
let maxConcurrentStreams = 8;
let activeStreams = 0;

try {
    if (fs.existsSync(OPTIONS_FILE)) {
        const options = JSON.parse(fs.readFileSync(OPTIONS_FILE, 'utf8'));
        if (Number.isInteger(options.max_concurrent_streams) &&
            options.max_concurrent_streams >= 1 && options.max_concurrent_streams <= 64) {
            maxConcurrentStreams = options.max_concurrent_streams;
        }
        if (typeof options.token === 'string' && options.token) {
            mytoken = options.token;
            console.log(`[Config] 토큰이 사용자 정의 값으로 설정되었습니다.`);
        }
    }
} catch {
    console.error('[ERROR] Could not read add-on options');
}

const instance = axios.create({ timeout: 3000 });
const bitrateMap = { "0": 192, "1": 128, "2": 96 };

// Home Assistant Superivsor API 설정
const SUPERVISOR_TOKEN = process.env.SUPERVISOR_TOKEN;
console.log("[HA API] SUPERVISOR_TOKEN 존재 여부:", !!SUPERVISOR_TOKEN);
const hassInstance = axios.create({
    baseURL: 'http://supervisor/core/api',
    headers: {
        'Authorization': `Bearer ${SUPERVISOR_TOKEN}`,
        'Content-Type': 'application/json'
    },
    timeout: 5000
});

// 공통으로 사용할 풀 버전 User-Agent
const FULL_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * 보안 관련 유틸리티 함수
 */
function setSecurityHeaders(resp) {
    resp.setHeader('X-Content-Type-Options', 'nosniff');
    resp.setHeader('X-Frame-Options', 'SAMEORIGIN');
    resp.setHeader('X-XSS-Protection', '1; mode=block');
    resp.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Content-Security-Policy는 인라인 스크립트 허용을 위해 유연하게 설정 (필요시 강화)
    resp.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self';");
}

function validateParam(param, type) {
    if (type === 'volume') {
        if (typeof param !== 'number' && (typeof param !== 'string' || !/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(param))) return false;
        return Number.isFinite(Number(param)) && Number(param) >= 0 && Number(param) <= 1;
    }
    if (typeof param !== 'string' || !param) return false;
    const patterns = {
        'token': /^[a-zA-Z0-9_-]+$/,
        'key': /^[a-z0-9_]+$/,
        'entity_id': /^media_player\.[a-z0-9_]+$/,
        'action': /^(media_play|media_pause|media_stop|media_play_pause)$/
    };
    return patterns[type] ? patterns[type].test(param) : true;
}

function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, function (m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[m];
    });
}

// [보안] 사설 IP 대역(RFC 1918) 및 루프백, 링크 로컬 판별 함수
function isPrivateIP(ip) {
    if (!ip) return false;
    if (ip === '::1' || ip.startsWith('fe80:')) return true;
    if (ip === '127.0.0.1') return true;
    if (ip.startsWith('10.')) return true;
    if (ip.startsWith('192.168.')) return true;
    if (ip.startsWith('169.254.')) return true;
    if (ip.startsWith('172.')) {
        const parts = ip.split('.');
        if (parts.length >= 2) {
            const second = parseInt(parts[1], 10);
            if (second >= 16 && second <= 31) return true;
        }
    }
    return false;
}

// [보안] IP별 인증 실패 횟수 및 임시 차단(Ban) 상태 관리 객체
const authFailures = new Map();

function normalizeIP(value = '') {
    const ip = value.replace(/^::ffff:/i, '').trim();
    return isIP(ip) ? ip : '';
}

function isIngress(req) {
    return normalizeIP(req.socket.remoteAddress) === ingressPeer && Boolean(req.headers['x-ingress-path']);
}

function getClientIP(req) {
    return normalizeIP(req.socket.remoteAddress);
}

function checkIPBan(clientIP) {
    const record = authFailures.get(clientIP);
    if (!record) return { isBanned: false };

    const now = Date.now();
    if (record.bannedUntil && now < record.bannedUntil) {
        const remaining = Math.ceil((record.bannedUntil - now) / 1000);
        return { isBanned: true, remaining };
    }

    if (now >= (record.bannedUntil || record.lastFailed + 60000)) {
        authFailures.delete(clientIP);
    }
    return { isBanned: false };
}

function recordAuthFailure(clientIP) {
    const now = Date.now();
    const record = authFailures.get(clientIP);
    if (!record) {
        if (authFailures.size >= maxAuthFailures) authFailures.delete(authFailures.keys().next().value);
        authFailures.set(clientIP, { count: 1, lastFailed: now, bannedUntil: 0 });
        return;
    }
    // 1분 이내의 연속된 실패인 경우 카운트 누적
    if (now - record.lastFailed < 60000) {
        record.count++;
        record.lastFailed = now;
        if (record.count >= 5) {
            record.bannedUntil = now + 300000; // 5분간 임시 차단
            console.warn(`[Security Alert] IP ${clientIP}가 인증 실패 5회 초과로 5분간 임시 차단(Ban)되었습니다.`);
        }
    } else {
        record.count = 1;
        record.lastFailed = now;
    }
}

function clearAuthFailures(clientIP) {
    authFailures.delete(clientIP);
}

function isLocalRequest(req) {
    if (isIngress(req)) return true;
    if (req.headers.forwarded || req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.headers['x-ingress-path']) return false;
    const peer = getClientIP(req);
    return peer !== ingressPeer && isPrivateIP(peer);
}

// Overlay station edits on the packaged catalog. Related: radio-list.json, index.html.
function readStationChanges() {
    try {
        const changes = JSON.parse(fs.readFileSync(STATION_CHANGES_FILE, 'utf8'));
        if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('Invalid station changes');
        return changes;
    } catch (error) {
        if (error.code === 'ENOENT') return {};
        throw error;
    }
}

function getRadioData(changes = readStationChanges()) {
    const stations = JSON.parse(fs.readFileSync(path.join(__dirname, 'radio-list.json'), 'utf8'));
    for (const [key, station] of Object.entries(changes)) {
        if (!validateParam(key, 'key')) continue;
        if (station === null) delete stations[key];
        else Object.defineProperty(stations, key, { value: station, enumerable: true, configurable: true, writable: true });
    }
    return stations;
}

function saveStationChanges(changes) {
    const temporary = STATION_CHANGES_FILE + '.' + randomUUID() + '.tmp';
    try {
        fs.writeFileSync(temporary, JSON.stringify(changes, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        fs.renameSync(temporary, STATION_CHANGES_FILE);
    } finally {
        fs.rmSync(temporary, { force: true });
    }
}

function updateStation(postData, resp) {
    const { action, key, name, freq, url } = postData;
    if (!['add', 'edit', 'delete'].includes(action)) return resp.writeHead(400).end('잘못된 작업입니다.');
    const changes = readStationChanges();
    const stations = getRadioData(changes);
    if (action !== 'add' && (!validateParam(key, 'key') || !Object.hasOwn(stations, key))) {
        return resp.writeHead(404).end('방송을 찾을 수 없습니다.');
    }
    const stationKey = action === 'add' ? 'custom_' + randomUUID().replace(/-/g, '') : key;
    if (action === 'delete') {
        if (stationKey.startsWith('custom_')) delete changes[stationKey];
        else changes[stationKey] = null;
    } else {
        const current = stations[stationKey];
        const originalUrl = typeof current === 'string' ? current : current?.url;
        const stationName = typeof name === 'string' ? name.trim() : '';
        let stationUrl = typeof url === 'string' ? url.trim() : '';
        if (!stationName || stationName.length > 80 || !Number.isFinite(freq) || freq < 0 || freq > 10000 || stationUrl.length > 2048) {
            return resp.writeHead(400).end('방송명, 주파수 또는 스트림 주소를 확인하세요.');
        }
        if (!(action === 'edit' && stationUrl && stationUrl === originalUrl)) {
            const parsed = URL.parse(stationUrl);
            if (!parsed || !['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
                return resp.writeHead(400).end('HTTP 또는 HTTPS 스트림 주소를 입력하세요.');
            }
            stationUrl = parsed.href;
        }
        changes[stationKey] = { name: stationName, freq, url: stationUrl };
    }
    saveStationChanges(changes);
    resp.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return resp.end(JSON.stringify(getRadioData(changes)));
}

// KBS 주소 파싱
function getkbs(param) {
    return new Promise((resolve) => {
        let kbs_ch = { 'kbs_1radio': '21', 'kbs_3radio': '23', 'kbs_classic': '24', 'kbs_cool': '25', 'kbs_happy': '22' };
        instance.get('https://cfpwwwapi.kbs.co.kr/api/v1/landing/live/channel_code/' + kbs_ch[param], {
            headers: {
                'User-Agent': FULL_UA,
                'Referer': 'https://onair.kbs.co.kr/'
            }
        }).then(response => {
            const kbs_src = response.data.channel_item;
            let media_src = "invalid";
            for (let i = 0; i < kbs_src.length; i++) {
                if (kbs_src[i].media_type == 'radio') {
                    media_src = kbs_src[i].service_url;
                    break;
                }
            }
            resolve(media_src);
        }).catch(() => resolve("invalid"));
    });
}

// MBC 주소 파싱
function getmbc(ch) {
    return new Promise(function (resolve, reject) {
        try {
            let mbc_ch = {
                'mbc_fm4u': 'mfm',
                'mbc_fm': 'sfm',
            };

            instance({
                method: 'get',
                url: 'https://sminiplay.imbc.com/aacplay.ashx?agent=webapp&channel=' + mbc_ch[ch] + '&callback=jarvis.miniInfo.loadOnAirComplete',
                headers: {
                    'User-Agent': FULL_UA,
                    'Referer': 'https://mini.imbc.com/',
                    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept-Encoding': 'gzip, deflate'
                }
            })

                .then(response => {
                    var text = 'https://' + response.data.split('"https://')[1].split('"')[0];
                    resolve(text);

                }).catch(e => {
                    console.log(e)
                    resolve("invalid");
                })
        } catch {
            resolve("invalid");
        }
    })
}

function getsbs(ch) {
    return new Promise((resolve) => {
        let sbs_ch = { 'sbs_power': ['powerfm', 'powerpc'], 'sbs_love': ['lovefm', 'lovepc'] };
        if (!sbs_ch[ch]) return resolve("invalid");
        instance.get(`https://apis.sbs.co.kr/play-api/1.0/livestream/${sbs_ch[ch][1]}/${sbs_ch[ch][0]}?protocol=hls&ssl=Y`, {
            headers: {
                'User-Agent': FULL_UA,
                'Referer': 'https://gorealraplayer.radio.sbs.co.kr/'
            }
        }).then(response => resolve(response.data)).catch(() => resolve("invalid"));
    });
}

/**
 * Stream until the HTTP response closes. Related: Dockerfile, index.html.
 */
function return_pipe(urls, resp, req, key) {
    if (resp.destroyed || resp.writableEnded) return;
    if (typeof urls !== 'string' || !/^https?:\/\//i.test(urls)) {
        resp.writeHead(502);
        return resp.end('Stream unavailable');
    }
    if (activeStreams >= maxConcurrentStreams) {
        return resp.writeHead(503, { 'Retry-After': '5' }).end('Stream capacity reached');
    }

    const myUrl = new URL(req.url, 'http://localhost');
    const urlParams = myUrl.searchParams;
    let bitrateRaw = urlParams.get("atype") || "1";
    const bitrate = Object.hasOwn(bitrateMap, bitrateRaw) ? bitrateMap[bitrateRaw] : 128;
    const format = urlParams.get("format") || "wav";

    // 채널 맞춤형 헤더 구성 (필요한 경우에만 Referer 추가)
    let headerStr = `User-Agent: ${FULL_UA}\r\n`;
    if (key === 'obs') {
        headerStr += `Referer: https://www.obs.co.kr/\r\n`;
    }

    const isMp3 = format === 'mp3';
    const outFormat = isMp3 ? 'mp3' : 'wav';
    const contentType = isMp3 ? 'audio/mpeg' : 'audio/wav';

    // [Smart Engine] 초기 로딩이 가장 빠른 순정 상태의 옵션으로 복구 (안정적인 기존 reconnect 옵션 유지 및 bufsize 병목만 제거)
    const ffmpegArgs = [
        "-headers", headerStr,
        "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "3",
        "-loglevel", "error", "-i", urls,
        "-c:a", "mp3", "-b:a", `${bitrate}k`, "-ac", "2",
        "-f", outFormat, "pipe:1"
    ];

    console.log(`[Smart Engine] ${key} - ${bitrate}k (Format: ${outFormat})`);

    resp.setHeaders(new Map(Object.entries({
        'Content-Type': contentType,
        'Transfer-Encoding': 'chunked',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    })));

    const xffmpeg = child_process.spawn("ffmpeg", ffmpegArgs, { stdio: ['ignore', 'pipe', 'ignore'] });
    activeStreams++;
    resp.once('close', () => {
        if (xffmpeg.exitCode === null && xffmpeg.signalCode === null) xffmpeg.kill('SIGKILL');
    });
    const fail = () => {
        if (resp.destroyed || resp.writableEnded) return;
        if (resp.headersSent) return resp.destroy();
        for (const name of resp.getHeaderNames()) resp.removeHeader(name);
        resp.writeHead(502);
        resp.end('Stream unavailable');
    };
    xffmpeg.once('error', fail);
    xffmpeg.stdout.once('error', fail);
    xffmpeg.stdout.pipe(resp, { end: false });
    xffmpeg.once('close', code => {
        activeStreams--;
        if (code !== 0 || !resp.headersSent) fail();
        else if (!resp.destroyed) resp.end();
    });
}

// 호스트의 실제 내부 IP를 가져오는 함수 (Supervisor API 활용)
async function getHostIP() {
    try {
        const response = await axios.get('http://supervisor/network/info', {
            headers: { 'Authorization': `Bearer ${SUPERVISOR_TOKEN}` },
            timeout: 2000
        });
        const interfaces = response.data.data.interfaces;
        // 192.168.x.x 또는 10.x.x.x 같은 일반적인 LAN 대역 우선 검색
        for (const iface of interfaces) {
            if (iface.enabled && iface.ipv4 && iface.ipv4.address.length > 0) {
                for (const addr of iface.ipv4.address) {
                    const ip = addr.split('/')[0];
                    if (isIP(ip) === 4 && (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.'))) {
                        return ip;
                    }
                }
            }
        }
        // LAN 대역을 못 찾으면 127/172(Internal)가 아닌 첫 주소 반환
        for (const iface of interfaces) {
            if (iface.enabled && iface.ipv4 && iface.ipv4.address.length > 0) {
                const ip = iface.ipv4.address[0].split('/')[0];
                if (isIP(ip) === 4 && !ip.startsWith('127.') && !ip.startsWith('172.30.')) return ip;
            }
        }
    } catch (e) {
        console.error("[Network] Supervisor API에서 IP 정보를 가져오지 못했습니다:", e.message);
    }
    return null;
}

/**
 * Bound JSON inputs and contain request failures. Related: index.html, DOC.md.
 */
const liveServer = http.createServer((req, resp) => {
    const dispatch = body => handleRequest(req, resp, body).catch(() => {
        console.error('[ERROR] Request processing failed');
        if (resp.destroyed || resp.writableEnded) return;
        if (resp.headersSent) return resp.destroy();
        resp.writeHead(500);
        resp.end('Internal Server Error');
    });
    if (req.method === 'POST') {
        const chunks = [];
        let size = 0;
        let rejected = false;
        req.on('data', chunk => {
            if (rejected) return;
            size += chunk.length;
            if (size > maxBodyBytes) {
                rejected = true;
                chunks.length = 0;
                resp.writeHead(413, { Connection: 'close' });
                resp.end('Payload Too Large');
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (!rejected) dispatch(Buffer.concat(chunks).toString('utf8'));
        });
        req.on('error', () => resp.destroy());
    } else {
        dispatch('');
    }
});

async function handleRequest(req, resp, body) {
    const myUrl = new URL(req.url, 'http://localhost');
    const urlParams = myUrl.searchParams;
    const urlPath = myUrl.pathname;

    // [보안] 1. IP 추출 및 임시 차단(Ban) 확인
    const clientIP = getClientIP(req);
    const denyUnauthorized = () => {
        const banInfo = checkIPBan(clientIP);
        if (banInfo.isBanned) {
            resp.writeHead(429, { 'Retry-After': banInfo.remaining });
            return resp.end('Too Many Requests');
        }
        recordAuthFailure(clientIP);
        setTimeout(() => {
            if (resp.destroyed) return;
            resp.writeHead(403);
            resp.end('Forbidden');
        }, 1000);
    };

    const isLocal = isLocalRequest(req);

    // POST 바디 파싱
    let postData = {};
    if (req.method === 'POST' && body) {
        try { postData = JSON.parse(body); } catch { postData = null; }
        if (!postData || typeof postData !== 'object' || Array.isArray(postData)) {
            resp.writeHead(400);
            return resp.end('Invalid JSON object');
        }
    }

    const getParam = name => Object.hasOwn(postData, name) ? postData[name] : urlParams.get(name);
        const token = getParam('token');
        const isAuthorized = token === mytoken && (isLocal || mytoken !== defaultToken);
        const ingress = isIngress(req);
        const session = isLocal ? localBrowserSession : remoteBrowserSession;
        const hasSession = (req.headers.cookie || '').split(';').some(cookie => cookie.trim() === `${sessionCookie}=${session}`);
        // Keep HA player discovery and control behind authenticated Ingress. Related: index.html, config.json.
        const playerPaths = ['/get_players', '/play_on_player', '/media_action', '/set_volume', '/mute_volume'];
        if (playerPaths.includes(urlPath) && !ingress) {
            return resp.writeHead(403).end('Forbidden: Home Assistant Ingress required');
        }
        const browserRead = ['/radio', '/get_radio_list', '/get_players'].includes(urlPath);
        const browserWrite = req.method === 'POST' && /^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '') &&
            (!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin');

        // [보안] 2. 인증 가드 통합 적용 (보안 지연 및 실패 기록 연계)
        const protectedPaths = ["/radio", "/get_radio_list", "/get_players", "/play_on_player", "/media_action", "/set_volume", "/mute_volume"];
        if (protectedPaths.includes(urlPath)) {
            if (!isAuthorized && !((hasSession || ingress) && (browserRead || browserWrite))) return denyUnauthorized();
            if (isAuthorized) clearAuthFailures(clientIP);
        }

        // [보안] 3. 외부망 웹 페이지 요청 시 보안 헤더 적용
        if (urlPath === "/" && !isLocal) {
            setSecurityHeaders(resp);
        }

        // 4. 엔드포인트 라우팅 (Switch-case 구조화)
        switch (urlPath) {
            case "/manage_stations": {
                resp.setHeader('Content-Type', 'text/plain; charset=utf-8');
                if (req.method !== 'POST') return resp.writeHead(405, { Allow: 'POST' }).end('POST required');
                if (!isLocal || !browserWrite || mytoken === defaultToken) {
                    return resp.writeHead(403).end('내부망 또는 Ingress에서 사용자 지정 토큰을 설정한 뒤 이용하세요.');
                }
                if (!isAuthorized) return denyUnauthorized();
                clearAuthFailures(clientIP);
                return updateStation(postData, resp);
            }
            case "/manifest.json": {
                try {
                    const manifest = fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8');

                    resp.writeHead(200, { 'Content-Type': 'application/json' });
                    resp.end(manifest);
                } catch (e) {
                    resp.statusCode = 404;
                    resp.end("Not Found");
                }
                break;
            }

            case "/service-worker.js": {
                try {
                    const sw = fs.readFileSync(path.join(__dirname, 'service-worker.js'), 'utf8');
                    resp.writeHead(200, { 'Content-Type': 'application/javascript' });
                    resp.end(sw);
                } catch (e) {
                    resp.statusCode = 404;
                    resp.end("Not Found");
                }
                break;
            }

            case "/icon.png": {
                try {
                    const iconPath = fs.existsSync(path.join(__dirname, 'icon.png')) 
                        ? path.join(__dirname, 'icon.png')
                        : path.join(__dirname, '../icon.png');
                    const icon = fs.readFileSync(iconPath);
                    resp.writeHead(200, { 'Content-Type': 'image/png' });
                    resp.end(icon);
                } catch (e) {
                    resp.statusCode = 404;
                    resp.end("Not Found");
                }
                break;
            }

            case "/": {
                // [보안] 외부망 접속 시 웹 UI 진입 권한 검증 (토큰 스캔 봇 차단 및 유출 방지)
                if (!isLocal && !isAuthorized && !hasSession) return denyUnauthorized();
                if (isAuthorized) {
                    clearAuthFailures(clientIP);
                }

                resp.setHeader('Cache-Control', 'no-store');
                resp.setHeader('Referrer-Policy', 'no-referrer');
                if (!ingress && !hasSession) {
                    const secure = req.headers['x-forwarded-proto'] === 'https';
                    resp.setHeader('Set-Cookie', `${sessionCookie}=${session}; HttpOnly; SameSite=Lax; Max-Age=2592000${secure ? '; Secure' : ''}`);
                }
                const currentData = getRadioData();
                const sortedKeys = Object.keys(currentData).sort((a, b) => {
                    const freqA = (typeof currentData[a] === 'object') ? currentData[a].freq : 999;
                    const freqB = (typeof currentData[b] === 'object') ? currentData[b].freq : 999;
                    return freqA - freqB;
                });

                const radioButtons = sortedKeys.map(key => {
                    const info = currentData[key];
                    const name = escapeHtml((typeof info === 'object') ? info.name : key.toUpperCase());
                    const freq = (typeof info === 'object') ? escapeHtml(String(info.freq)) + ' MHz' : '';
                    return `<button type="button" class="radio-btn" data-station-key="${escapeHtml(key)}">
                                <div class="btn-name">${name}</div>
                                <div class="btn-freq">${freq}</div>
                            </button>`;
                }).join('');

                try {
                    let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
                    const configScript = `<script>const API_CONFIG = { isLocal: ${isLocal}, ingress: ${ingress} };</script>`;
                    html = html.replace('</head>', () => `${configScript}\n</head>`);
                    html = html.replace(/{{RADIO_BUTTONS}}/g, () => radioButtons);
                    resp.setHeader('Content-Type', 'text/html; charset=utf-8');
                    resp.end(html);
                } catch (e) {
                    resp.writeHead(500);
                    resp.end("Internal Server Error");
                }
                break;
            }

            case "/radio": {
                const key = getParam('keys');
                if (!validateParam(key, 'key')) {
                    resp.statusCode = 400;
                    return resp.end("Bad Request");
                }
                const currentData = getRadioData();
                const station = Object.hasOwn(currentData, key) ? currentData[key] : undefined;
                if (station) {
                    let stream = typeof station === 'string' ? station : station.url;
                    if (stream === 'kbs_lib') stream = await getkbs(key);
                    else if (stream === 'mbc_lib') stream = await getmbc(key);
                    else if (stream === 'sbs_lib') stream = await getsbs(key);
                    return_pipe(stream, resp, req, key);
                } else {
                    resp.statusCode = 404;
                    resp.end("Not Found");
                }
                break;
            }

            case "/get_radio_list": {
                const currentData = getRadioData();
                resp.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
                resp.end(JSON.stringify(currentData));
                break;
            }

            case "/get_players": {
                hassInstance.get('/states')
                    .then(r => {
                        const players = r.data.filter(s => s.entity_id.startsWith('media_player.'))
                            .map(s => ({ name: s.attributes.friendly_name || s.entity_id, id: s.entity_id }));
                        resp.writeHead(200, { 'Content-Type': 'application/json' });
                        resp.end(JSON.stringify(players));
                    })
                    .catch(() => resp.end("[]"));
                break;
            }

            case "/play_on_player": {
                const entity_id = getParam('entity_id');
                const keys = getParam('keys');
                const atype = getParam('atype') || '1';

                if (!validateParam(entity_id, 'entity_id') || !validateParam(keys, 'key')) {
                    resp.statusCode = 400;
                    return resp.end("Bad Request");
                }

                // Use only a Supervisor-provided playback address. Related: config.json.
                const hostIp = await getHostIP();
                if (!hostIp) {
                    return resp.writeHead(503).end('Speaker playback address unavailable');
                }
                const streamParams = new URLSearchParams({ token: mytoken, keys, atype });
                const streamUrl = `http://${hostIp}:${port}/radio?${streamParams}`;
                // [보안] 로그에 민감한 인증 토큰(token) 정보가 노출되는 현상을 예방하기 위해 마스킹 처리
                console.log(`[INFO] Remote play: ${entity_id}, station: ${keys}`);

                hassInstance.post('/services/media_player/play_media', {
                    entity_id: entity_id,
                    media_content_id: streamUrl,
                    media_content_type: 'music'
                }).then(() => resp.end("Success")).catch(() => (resp.statusCode = 500, resp.end("Error")));
                break;
            }

            case "/media_action": {
                const entity_id = getParam('entity_id');
                const action = getParam('action');

                if (!validateParam(entity_id, 'entity_id') || !validateParam(action, 'action')) {
                    resp.statusCode = 400;
                    return resp.end("Bad Request");
                }

                hassInstance.post(`/services/media_player/${action}`, { entity_id })
                    .then(() => resp.end("Success"))
                    .catch(() => (resp.statusCode = 500, resp.end("Error")));
                break;
            }

            case "/set_volume": {
                const entity_id = getParam('entity_id');
                const volume = getParam('volume');

                if (!validateParam(entity_id, 'entity_id') || !validateParam(volume, 'volume')) {
                    resp.statusCode = 400;
                    return resp.end("Bad Request");
                }

                hassInstance.post('/services/media_player/volume_set', {
                    entity_id: entity_id,
                    volume_level: parseFloat(volume)
                }).then(() => resp.end("Success")).catch(() => (resp.statusCode = 500, resp.end("Error")));
                break;
            }

            case "/mute_volume": {
                const entity_id = getParam('entity_id');
                const mute = getParam('mute') === 'true' || getParam('mute') === true;

        if (!validateParam(entity_id, 'entity_id')) {
                    resp.statusCode = 400;
                    return resp.end("Bad Request");
                }

                hassInstance.post('/services/media_player/volume_mute', {
                    entity_id: entity_id,
                    is_volume_muted: mute
                }).then(() => resp.end("Success")).catch(() => (resp.statusCode = 500, resp.end("Error")));
                break;
            }

            default: {
                resp.statusCode = 404;
                resp.end("Not Found");
            }
        }
}

liveServer.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
});
