import http from 'node:http';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import readline from 'node:readline';
import { createEngine } from './engine.mjs';

const PORT = 3210, MGBA_PORT = 8765, clients = new Set();
let state = { commands: [], active: null, queue: [], mode: 'collective', updatedAt: Date.now() };
function broadcast(s) { state = s; const chunk = `data: ${JSON.stringify(s)}\n\n`; for (const res of clients) res.write(chunk); }
function sendMgba(button, frames) { return new Promise((resolve, reject) => { const sock = net.createConnection({ host: '127.0.0.1', port: MGBA_PORT }); let done = false; const end = e => { if (done) return; done = true; clearTimeout(timer); sock.destroy(); e ? reject(e) : resolve(); }; const timer = setTimeout(() => end(new Error('Timeout TCP')), 2500); sock.once('error', end); sock.once('connect', () => sock.write(`${button} ${frames}\n`, end)); }); }
const engine = createEngine({ send: sendMgba, notify: broadcast });
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
const server = http.createServer(async (req, res) => {
    const path = new URL(req.url, 'http://127.0.0.1').pathname;
    if (req.method === 'GET' && path === '/api/events') { res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive' }); clients.add(res); res.write(`data: ${JSON.stringify(engine.status())}\n\n`); req.on('close', () => clients.delete(res)); return; }
    if (req.method === 'GET' && path === '/api/state') return json(res, 200, engine.status());
    if (req.method !== 'POST' || !['/api/test/command', '/api/test/gift', '/api/test/next'].includes(path)) return json(res, 404, { error: 'Rota não encontrada' });
    // Development/testing endpoints restricted to loopback, never expose on public network.
    try {
        let raw = ''; for await (const c of req) { raw += c; if (raw.length > 8192) throw new Error('payload grande'); } const data = JSON.parse(raw || '{}'); let result;
        if (path === '/api/test/command') result = await engine.input(data.user || 'terminal', data.command, { force: false });
        if (path === '/api/test/gift') result = engine.grant(data.user || 'treinador', data.credits);
        if (path === '/api/test/next') { engine.advance('operador'); result = { ok: true }; }
        return json(res, result.ok ? 200 : 400, result);
    } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
});
server.listen(PORT, '127.0.0.1', () => console.log(`[API] http://127.0.0.1:${PORT}`));
setInterval(() => engine.tick(), 1000).unref();

const testMode = process.argv.includes('--test');
const username = process.env.TIKTOK_USER?.trim().replace(/^@/, '');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('line', async line => { const value = line.trim(); if (value === '/quit') process.exit(0); if (value.startsWith('/gift ')) { const m = value.match(/^\/gift\s+(\S+)\s+(\d+)$/); console.log(m ? engine.grant(m[1], Number(m[2])) : 'Use /gift usuario creditos'); return; } if (value === '/next') { engine.advance('operador'); return; } if (value.startsWith('/as ')) { const m = value.match(/^\/as\s+(\S+)\s+(\S+)$/); console.log(m ? await engine.input(m[1], m[2]) : 'Use /as usuario comando'); return; } console.log(await engine.input('terminal', value)); });
if (testMode) { console.log('[TESTE] /gift ash 10 | /as ash right | /next | /quit'); }
else if (!username) { console.log('Defina TIKTOK_USER ou execute npm run test:live'); }
else {
    try {
        const { TikTokLiveConnection, WebcastEvent, ControlEvent } = await import('tiktok-live-connector');
        const conn = new TikTokLiveConnection(username, { processInitialData: false, enableExtendedGiftInfo: false });
        const finalized = new Map(); const pending = new Map();
        const giftKey = e => e.groupId ? `${e.groupId}:${e.user?.id || e.user?.uniqueId || e.user?.displayId}:${e.giftId}` : null;
        conn.on(WebcastEvent.CHAT, async e => { const u = e.user?.uniqueId || e.user?.displayId || String(e.user?.id || 'anonimo'); const result = await engine.input(u, e.comment ?? e.content); if (result.ok) console.log(`[Chat] @${u}: ${result.command}`); });
        conn.on(WebcastEvent.GIFT, e => {
            console.log('[GIFT]', JSON.stringify({
                user: event.user?.uniqueId,
                giftId: event.giftId,
                repeatCount: event.repeatCount,
                repeatEnd: event.repeatEnd,
                diamondCount: event.diamondCount,
                gift: event.gift
            }, null, 2));
            const u = e.user?.uniqueId || e.user?.displayId || String(e.user?.id || 'anonimo'); const key = giftKey(e); const type = e.gift?.type ?? e.giftType; const streak = Number(type) === 1;
            if (streak && e.repeatEnd !== 1 && e.repeatEnd !== true) { if (key) pending.set(key, Date.now()); return; }
            if (key && finalized.has(key)) { return; }
            // For an ungrouped event, de-duplication is best-effort only.
            const quantity = Math.max(1, Math.floor(Number(e.repeatCount) || 1));
            const diamonds = Number(e.gift?.diamondCount ?? e.diamondCount);
            if (!Number.isFinite(diamonds) || diamonds <= 0) { console.warn('[Gift] sem valor verificável; ignorado:', e.giftId); return; }
            const credits = Math.floor(quantity * diamonds * 2);
            const r = engine.grant(u, credits); if (r.ok) { if (key) { finalized.set(key, Date.now()); pending.delete(key); } console.log(`[Gift] @${u}: ${e.gift?.name || e.giftId} × ${quantity} (${diamonds} diamantes/unidade) => ${credits} comandos`); } else console.warn('[Gift] não aplicado:', r.reason);
        });
        conn.on(ControlEvent.ERROR, e => console.error('[TikTok]', e?.info || e));
        setInterval(() => { for (const [k, t] of finalized) if (Date.now() - t > 120000) finalized.delete(k); for (const [k, t] of pending) if (Date.now() - t > 30000) { pending.delete(k); console.warn('[Gift] combo sem final confirmado; não concedido automaticamente:', k); } }, 5000).unref();
        console.log(`[TikTok] conectando @${username}...`); await conn.connect(); console.log('[TikTok] conectado!');
    } catch (e) { console.error('[TikTok] falha ao conectar:', e.message); console.log('Servidor local continua funcionando para testes.'); }
}
