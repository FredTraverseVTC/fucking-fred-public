/**
 * Netlify Function : reserve.js
 *
 * Flow :
 *  1. Reçoit la demande de course (client + trajet)
 *  2. Valide et sanitize les entrées
 *  3. Crée un event TENTATIVE dans Google Calendar de Fred
 *  4. Fred accepte ou refuse depuis son téléphone (Google Calendar)
 *  5. notify.js gère la suite
 *
 * Variables d'environnement Netlify :
 *  GOOGLE_CLIENT_ID       → Google Cloud Console → OAuth 2.0 Client ID
 *  GOOGLE_CLIENT_SECRET   → Google Cloud Console → OAuth 2.0 Client Secret
 *  GOOGLE_REFRESH_TOKEN   → Obtenu via scripts/oauth-setup.js
 *  FRED_CALENDAR_ID       → Email Gmail de Fred (ex: fred@gmail.com)
 *  WEBHOOK_SECRET         → openssl rand -hex 32
 */

const https  = require('https');
const crypto = require('crypto');

// ── RATE LIMITING ──
const rateLimitStore = new Map();
function checkRateLimit(ip) {
  const now = Date.now(), window = 60000, max = 5;
  const e = rateLimitStore.get(ip) || { count: 0, resetAt: now + window };
  if (now > e.resetAt) { e.count = 0; e.resetAt = now + window; }
  e.count++;
  rateLimitStore.set(ip, e);
  return e.count <= max;
}

// ── VALIDATION ──
function isValidPhone(p) { return /^[+]?[0-9\s\-().]{7,20}$/.test(p.trim()); }
function isValidName(n)  { return n.trim().length >= 2 && n.trim().length <= 80; }
function sanitize(s)     { return s ? s.toString().replace(/[<>"']/g, '').trim().slice(0, 500) : ''; }

// ── GOOGLE OAUTH ──
async function getAccessToken() {
  const body = JSON.stringify({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    grant_type:    'refresh_token',
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const j = JSON.parse(d);
        j.access_token ? resolve(j.access_token) : reject(new Error('Token failed: ' + d));
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

// ── GOOGLE CALENDAR ──
async function createEvent(token, trip, client) {
  const start = new Date(`${trip.date}T${trip.time}:00`);
  const end   = new Date(start.getTime() + parseInt(trip.dur || 30) * 60000);

  const event = {
    summary:     `🚗 Course VTC — ${trip.from} → ${trip.to}`,
    location:    trip.from,
    description: [
      `👤 Client : ${client.name}`,
      `📱 Téléphone : ${client.phone}`,
      client.notes ? `📝 Notes : ${client.notes}` : '',
      ``,
      `📍 Départ  : ${trip.from}`,
      `📍 Arrivée : ${trip.to}`,
      `📏 Distance : ${trip.dist} km`,
      `⏱  Durée estimée : ${trip.dur} min`,
      `💶 Tarif : ${trip.prix} €${trip.note ? ' (' + trip.note + ')' : ''}`,
      `👥 Passagers : ${client.passengers || '—'}`,
      `🧳 Bagages : ${client.luggage || '—'}`,
      ``,
      `Réservation via Fred Traverse VTC`,
    ].filter(Boolean).join('\n'),
    start: { dateTime: start.toISOString(), timeZone: 'Europe/Paris' },
    end:   { dateTime: end.toISOString(),   timeZone: 'Europe/Paris' },
    status:  'tentative',
    colorId: '5',
    extendedProperties: {
      private: { clientPhone: client.phone, clientName: client.name }
    },
  };

  const body = JSON.stringify(event);
  const calId = encodeURIComponent(process.env.FRED_CALENDAR_ID);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.googleapis.com',
      path:     `/calendar/v3/calendars/${calId}/events`,
      method:   'POST',
      headers:  { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const j = JSON.parse(d);
        j.id ? resolve(j) : reject(new Error('Calendar failed: ' + d));
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

// ── HANDLER ──
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const ip = event.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(ip)) return { statusCode: 429, headers, body: JSON.stringify({ error: 'Trop de demandes. Réessayez dans une minute.' }) };

  try {
    const { client, trip } = JSON.parse(event.body);

    if (!client?.name || !client?.phone || !trip?.from || !trip?.to)
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Données manquantes' }) };
    if (!isValidName(client.name))
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nom invalide' }) };
    if (!isValidPhone(client.phone))
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Téléphone invalide' }) };
    if (!trip.date || !trip.time)
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Date ou heure manquante' }) };
    if (new Date(`${trip.date}T${trip.time}`) < new Date())
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'La date doit être dans le futur' }) };

    client.name  = sanitize(client.name);
    client.phone = sanitize(client.phone);
    client.notes = sanitize(client.notes);
    trip.from    = sanitize(trip.from);
    trip.to      = sanitize(trip.to);

    const token   = await getAccessToken();
    const calEvent = await createEvent(token, trip, client);

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, eventId: calEvent.id }) };

  } catch (err) {
    console.error('reserve.js error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
