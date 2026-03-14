# 🚗 Fred VTC Toulouse — App de réservation

## Structure du projet

```
fred-vtc/
├── public/
│   └── index.html          ← La page web (dark/light, calcul trajet, réservation)
├── netlify/
│   └── functions/
│       ├── reserve.js      ← Crée l'event Google Calendar + SMS/WhatsApp client
│       └── notify.js       ← Webhook : notifie le client quand Fred accepte/refuse
├── scripts/
│   └── oauth-setup.js      ← Script one-shot pour obtenir le token OAuth de Fred
├── netlify.toml            ← Config Netlify
└── README.md
```

---

## Setup complet (une fois)

### Étape 1 — GitHub
1. Créer un compte sur github.com
2. Nouveau repo → "fred-vtc" (privé recommandé)
3. Uploader tous ces fichiers

### Étape 2 — Google Cloud Console (15 min)
1. Aller sur https://console.cloud.google.com
2. Créer un nouveau projet : "Fred VTC"
3. Activer l'API : Rechercher "Google Calendar API" → Activer
4. Identifiants → Créer des identifiants → ID client OAuth 2.0
   - Type : Application de bureau
   - Copier le **Client ID** et **Client Secret**
5. Ouvrir `scripts/oauth-setup.js`
   - Remplacer `VOTRE_CLIENT_ID` et `VOTRE_CLIENT_SECRET`
6. Depuis un terminal : `node scripts/oauth-setup.js`
   - Fred se connecte avec son compte Google
   - Copier le **Refresh Token** affiché

### Étape 3 — Twilio (10 min)
1. Créer un compte sur https://twilio.com (gratuit, 15$ de crédit offert)
2. Récupérer **Account SID** et **Auth Token** depuis le dashboard
3. Acheter un numéro de téléphone (~1$/mois) → pour les SMS
4. Pour WhatsApp : Twilio Console → Messaging → Try WhatsApp → numéro sandbox gratuit

### Étape 4 — Netlify (5 min)
1. Aller sur https://app.netlify.com
2. "Add new site" → "Import from Git" → connecter GitHub → choisir "fred-vtc"
3. Build settings : laissez tout par défaut (netlify.toml s'en charge)
4. **Site settings → Environment variables** → Ajouter :

```
GOOGLE_CLIENT_ID        = xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET    = xxxx
GOOGLE_REFRESH_TOKEN    = xxxx       ← obtenu via scripts/oauth-setup.js
FRED_CALENDAR_ID        = fred@gmail.com
FRED_PHONE              = +33612345678
# Twilio supprimé — Fred notifie directement via WhatsApp
WEBHOOK_SECRET          = xxxx       ← générer avec : openssl rand -hex 32
ADMIN_SECRET            = xxxx       ← générer avec : openssl rand -hex 32
WATCH_CHANNEL_ID        =            ← rempli après le 1er appel à renew-watch
WATCH_RESOURCE_ID       =            ← rempli après le 1er appel à renew-watch
```

**Générer les secrets** (dans un terminal) :
```bash
openssl rand -hex 32   # → WEBHOOK_SECRET
openssl rand -hex 32   # → ADMIN_SECRET
```

5. Redéployer le site (Deploys → Trigger deploy)

### Étape 5 — Webhook Google Calendar (optionnel, pour les confirmations auto)
1. Une fois le site déployé, noter l'URL : `https://VOTRE-SITE.netlify.app`
2. Appeler une fois cette URL pour enregistrer le webhook :
   `https://VOTRE-SITE.netlify.app/.netlify/functions/register-watch`
   (à implémenter si besoin — voir Google Calendar Push Notifications)

---

## Remplacer le numéro de Fred dans la page

Dans `public/index.html`, chercher `+33612345678` et remplacer par le vrai numéro.

## Remplacer le nom de Fred

Chercher `Thomas Mercier` dans `public/index.html`.

---

## Flow complet

```
Client scanne le QR code
  → Calcule son trajet (OSRM, gratuit)
  → Voit le prix estimé
  → Remplit nom + téléphone + canal (SMS ou WhatsApp)
  → Clique "Envoyer la demande à Fred"
      → reserve.js crée un event TENTATIVE dans Google Calendar de Fred
      → Client reçoit SMS/WhatsApp : "Demande envoyée, Fred confirme sous peu"
  
Fred reçoit une notif sur son téléphone
  → Il voit : "Course Matabiau → Blagnac — 25 min — 35€ — Jean Dupont"
  → Il appuie ✓ (confirme) ou ✗ (refuse) dans Google Calendar
      → notify.js détecte le changement (webhook)
      → Client reçoit SMS/WhatsApp de confirmation ou refus
```

---

## Sécurité en place

| Protection | Mécanisme |
|---|---|
| Rate limiting | 5 requêtes/min/IP (reserve.js) |
| Validation inputs | Nom, téléphone, date, canal vérifiés |
| Sanitization | Toutes les entrées nettoyées (XSS) |
| Webhook Google | Token secret vérifié (timing-safe) |
| Headers HTTP | X-Frame-Options, CSP, XSS-Protection |
| Secrets | Jamais dans le code, env vars Netlify |
| Renouvellement webhook | Automatique toutes les 6 jours |

---

## Coûts mensuels

| Service       | Coût          |
|---------------|---------------|
| Netlify       | 0€            |
| GitHub        | 0€            |
| Google APIs   | 0€            |
| **Total**     | **~quelques € selon volume** |
