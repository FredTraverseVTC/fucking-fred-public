/**
 * scripts/oauth-setup.js
 * 
 * Script à exécuter UNE SEULE FOIS pour obtenir le refresh token de Fred.
 * 
 * Prérequis :
 *  1. Créer un projet sur https://console.cloud.google.com
 *  2. Activer l'API Google Calendar
 *  3. Créer des identifiants OAuth 2.0 (type : Application de bureau)
 *  4. Copier Client ID et Client Secret ci-dessous
 * 
 * Utilisation :
 *   node scripts/oauth-setup.js
 *   → Ouvre un lien dans le navigateur
 *   → Fred se connecte avec son compte Google
 *   → Coller le code affiché dans le terminal
 *   → Le refresh token s'affiche → copier dans Netlify env vars
 */

const https   = require('https');
const http    = require('http');
const url     = require('url');
const { exec } = require('child_process');

// ── À REMPLIR ──
const CLIENT_ID     = 'VOTRE_CLIENT_ID.apps.googleusercontent.com';
const CLIENT_SECRET = 'VOTRE_CLIENT_SECRET';
const REDIRECT_URI  = 'http://localhost:3000/callback';
const SCOPES        = 'https://www.googleapis.com/auth/calendar';

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
  client_id:     CLIENT_ID,
  redirect_uri:  REDIRECT_URI,
  response_type: 'code',
  scope:         SCOPES,
  access_type:   'offline',
  prompt:        'consent',
});

console.log('\n🔐 Setup OAuth Google Calendar pour Fred\n');
console.log('Ouverture du navigateur...');
console.log('Si ça ne s\'ouvre pas, copiez ce lien :\n');
console.log(authUrl + '\n');

// Ouvrir le navigateur
exec(`open "${authUrl}" 2>/dev/null || xdg-open "${authUrl}" 2>/dev/null || start "${authUrl}"`);

// Serveur local pour récupérer le code
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname !== '/callback') return;

  const code = parsed.query.code;
  if (!code) {
    res.end('Erreur : pas de code.');
    return;
  }

  res.end('<h2>✅ Autorisation reçue ! Fermez cet onglet et revenez au terminal.</h2>');
  server.close();

  // Échanger le code contre un refresh token
  const body = JSON.stringify({
    code,
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri:  REDIRECT_URI,
    grant_type:    'authorization_code',
  });

  const tokenReq = https.request({
    hostname: 'oauth2.googleapis.com',
    path:     '/token',
    method:   'POST',
    headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, tokenRes => {
    let data = '';
    tokenRes.on('data', c => data += c);
    tokenRes.on('end', () => {
      const json = JSON.parse(data);
      if (json.refresh_token) {
        console.log('\n✅ Succès ! Copiez ces valeurs dans Netlify → Site settings → Environment variables :\n');
        console.log(`GOOGLE_CLIENT_ID     = ${CLIENT_ID}`);
        console.log(`GOOGLE_CLIENT_SECRET = ${CLIENT_SECRET}`);
        console.log(`GOOGLE_REFRESH_TOKEN = ${json.refresh_token}`);
        console.log(`FRED_CALENDAR_ID     = [email Gmail de Fred]`);
        console.log('\n');
      } else {
        console.error('Erreur token :', data);
      }
    });
  });

  tokenReq.write(body);
  tokenReq.end();
});

server.listen(3000, () => {
  console.log('En attente de l\'autorisation de Fred sur le navigateur...\n');
});
