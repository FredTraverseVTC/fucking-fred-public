# 🚗 Fred VTC Toulouse — App de réservation

## Structure du projet

```
fred-vtc/
├── public/
│   ├── index.html          ← La page web (dark/light, calcul trajet, réservation)
│   ├── manifest.json       ← Config PWA
│   ├── sw.js               ← Service Worker (cache offline)
│   └── icons/              ← Icônes PWA
├── netlify.toml            ← Config Netlify (redirects, headers de sécurité)
└── README.md
```

---

## Setup complet (une fois)

### Étape 1 — GitHub
1. Créer un compte sur github.com
2. Nouveau repo → "fred-vtc" (privé recommandé)
3. Uploader tous ces fichiers

### Étape 2 — Netlify (5 min)
1. Aller sur https://app.netlify.com
2. "Add new site" → "Import from Git" → connecter GitHub → choisir "fred-vtc"
3. Build settings : laissez tout par défaut (netlify.toml s'en charge)
4. **Site settings → Environment variables** → Ajouter :
   - `OWNER_PHONE_NUMBER` = `+33XXXXXXXXX` (numéro de Fred au format international)
5. Redéployer le site (Deploys → Trigger deploy)

### Étape 3 — Calendly
1. Créer un compte sur https://calendly.com
2. Créer un type d'événement "Course VTC"
3. Mettre à jour l'URL Calendly dans `public/index.html` (chercher `CALENDLY_URL`)

---

## Personnalisation

### Numéro de téléphone
Configuré via la variable d'environnement Netlify `OWNER_PHONE_NUMBER`. Le build injecte automatiquement le numéro dans la page.

### Remplacer le nom de Fred
Chercher `Traverse` dans `public/index.html`.

---

## Flow complet

```
Client scanne le QR code
  → Calcule son trajet (OSRM, gratuit)
  → Voit le prix estimé
  → Choisit un créneau via Calendly
  → OU envoie un message WhatsApp pré-rempli à Fred

Fred reçoit la notification
  → Via Calendly (email + calendrier)
  → Ou via WhatsApp directement
```

---

## Sécurité en place

| Protection | Mécanisme |
|---|---|
| Sanitization | Entrées nettoyées côté client (XSS) |
| Headers HTTP | X-Frame-Options, CSP, XSS-Protection, Referrer-Policy |
| Permissions-Policy | Géolocalisation limitée au site, micro/caméra désactivés |

---

## Coûts mensuels

| Service       | Coût          |
|---------------|---------------|
| Netlify       | 0€            |
| GitHub        | 0€            |
| Calendly      | 0€ (plan gratuit) |
| **Total**     | **0€**        |
