/**
 * Netlify Function : notify.js
 *
 * Webhook Google Calendar — appelé quand Fred accepte ou refuse une course.
 * Sans Twilio, on logue la décision. Pour notifier le client :
 * option A) Fred répond directement via WhatsApp (déjà dans ses contacts)
 * option B) Brancher Twilio plus tard si besoin
 *
 * Variable d'environnement :
 *  WEBHOOK_SECRET  → doit correspondre au channel token Google
 */

const https  = require('https');
const crypto = require('crypto');

function verifyWebhook(headers) {
  const token    = headers['x-goog-channel-token'];
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected || !token) return false;
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token)); }
  catch { return false; }
}

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
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { const j = JSON.parse(d); j.access_token ? resolve(j.access_token) : reject(new Error(d)); });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

async function getEvent(token, eventId) {
  const calId = encodeURIComponent(process.env.FRED_CALENDAR_ID);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.googleapis.com',
      path: `/calendar/v3/calendars/${calId}/events/${eventId}`,
      headers: { 'Authorization': `Bearer ${token}` },
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject); req.end();
  });
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };

  if (event.httpMethod === 'GET') return { statusCode: 200, headers, body: 'OK' };

  if (!verifyWebhook(event.headers))
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };

  try {
    const eventId       = event.headers['x-goog-resource-id'];
    const resourceState = event.headers['x-goog-resource-state'];

    if (resourceState !== 'exists' || !eventId)
      return { statusCode: 200, headers, body: JSON.stringify({ skipped: true }) };

    const token    = await getAccessToken();
    const calEvent = await getEvent(token, eventId);
    const priv     = calEvent.extendedProperties?.private || {};

    if (!priv.clientName) return { statusCode: 200, headers, body: JSON.stringify({ skipped: true }) };

    const status = calEvent.status;
    console.log(`[notify] Event ${eventId} → ${status} | Client: ${priv.clientName} | Tel: ${priv.clientPhone}`);

    // Ici : brancher Twilio, email, ou autre si besoin dans le futur
    // Pour l'instant Fred notifie le client directement via WhatsApp

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, status }) };

  } catch (err) {
    console.error('notify.js error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
