/**
 * Netlify Function : renew-watch.js
 * 
 * Google Calendar Push Notifications expirent après 7 jours max.
 * Cette fonction renouvelle le watch automatiquement toutes les 6 jours.
 * 
 * À activer via Netlify Scheduled Functions (gratuit) :
 * Dans netlify.toml ajouter :
 *   [functions."renew-watch"]
 *     schedule = "0 6 */6 * *"   ← toutes les 6 jours à 6h du matin
 */

const https = require('https');
const crypto = require('crypto');

async function getGoogleAccessToken() {
  const body = JSON.stringify({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    grant_type:    'refresh_token',
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const j = JSON.parse(d);
        j.access_token ? resolve(j.access_token) : reject(new Error('Token refresh failed: ' + d));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Arrêter l'ancien watch avant d'en créer un nouveau
async function stopWatch(accessToken, channelId, resourceId) {
  const body = JSON.stringify({ id: channelId, resourceId });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'www.googleapis.com',
      path:     '/calendar/v3/channels/stop',
      method:   'POST',
      headers:  {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      res.on('data', () => {});
      res.on('end', () => resolve());
    });
    req.on('error', () => resolve()); // Pas bloquant si déjà expiré
    req.write(body);
    req.end();
  });
}

async function registerWatch(accessToken) {
  const siteUrl    = process.env.URL || process.env.DEPLOY_URL; // Netlify injecte l'URL du site
  const webhookUrl = `${siteUrl}/.netlify/functions/notify`;
  const channelId  = `fred-vtc-watch-${Date.now()}`;

  const body = JSON.stringify({
    id:      channelId,
    type:    'web_hook',
    address: webhookUrl,
    token:   process.env.WEBHOOK_SECRET, // envoyé dans x-goog-channel-token
    params:  { ttl: '604800' }, // 7 jours en secondes (max Google)
  });

  const calendarId = encodeURIComponent(process.env.FRED_CALENDAR_ID);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.googleapis.com',
      path:     `/calendar/v3/calendars/${calendarId}/events/watch`,
      method:   'POST',
      headers:  {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const j = JSON.parse(d);
        if (j.id) resolve(j);
        else reject(new Error('Watch registration failed: ' + d));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };

  // Vérification basique si appelé manuellement (pas par le scheduler)
  if (event.httpMethod === 'POST') {
    const secret = event.headers['x-admin-secret'];
    if (!secret || secret !== process.env.ADMIN_SECRET) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  try {
    const accessToken = await getGoogleAccessToken();

    // Si on a un ancien watch, l'arrêter proprement
    const oldChannelId  = process.env.WATCH_CHANNEL_ID;
    const oldResourceId = process.env.WATCH_RESOURCE_ID;
    if (oldChannelId && oldResourceId) {
      await stopWatch(accessToken, oldChannelId, oldResourceId);
      console.log('Old watch stopped:', oldChannelId);
    }

    // Créer un nouveau watch
    const watch = await registerWatch(accessToken);
    console.log('New watch registered:', {
      id:         watch.id,
      resourceId: watch.resourceId,
      expiration: new Date(parseInt(watch.expiration)).toISOString(),
    });

    // Note: Pour persister les nouveaux IDs, les stocker dans Netlify env vars via l'API Netlify
    // ou utiliser un KV store (Netlify Blobs). Ici on log pour l'instant.
    console.log('ACTION REQUISE — Mettre à jour dans Netlify env vars:');
    console.log(`WATCH_CHANNEL_ID  = ${watch.id}`);
    console.log(`WATCH_RESOURCE_ID = ${watch.resourceId}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success:    true,
        channelId:  watch.id,
        resourceId: watch.resourceId,
        expiration: new Date(parseInt(watch.expiration)).toISOString(),
      }),
    };
  } catch (err) {
    console.error('renew-watch.js error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
