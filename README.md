# Mailing — Emailing personnalisé, gratuit et auto-hébergé

Application complète d'envoi d'emails personnalisés en masse (mail-merge), fonctionnant avec n'importe quel serveur SMTP standard (Gmail, Outlook, Yahoo, Postfix, Exim, Mailcow, SMTP personnalisé). Aucune API payante requise.

## Fonctionnalités (version actuelle)

- Authentification JWT, rôles Administrateur / Utilisateur
- Comptes SMTP multiples avec chiffrement AES-256 des mots de passe, test de connexion, rotation entre plusieurs comptes
- Gestion des contacts (CRUD, recherche, tri, filtres, tags)
- Import de contacts depuis CSV / Excel / TXT avec mapping de colonnes
- Segments dynamiques (règles combinables ET/OU)
- Éditeur de modèles HTML riche (TipTap) avec variables de fusion `{{prenom}}`, `{{nom}}`, `{{entreprise}}`, `{{fonction}}`, `{{ville}}`, `{{pays}}`, `{{email}}`
- Campagnes : ciblage (contact unique / segments / toute la base), pièces jointes, aperçu par destinataire réel
- Moteur d'envoi intelligent : délai + aléa entre envois, limitation de débit, réessais avec backoff, reconnexion SMTP automatique, pause/reprise/annulation
- Suivi des ouvertures (pixel de suivi) ; suivi des clics disponible mais suspendu (`CLICK_TRACKING_ENABLED`)
- Lien de désinscription dans chaque email + en-tête `List-Unsubscribe` (désinscription en un clic Gmail/Yahoo)
- Version texte générée automatiquement à côté du HTML
- Détection des rebonds définitifs (adresse inexistante) : le contact est exclu des campagnes suivantes
- Envoi de test d'une campagne à sa propre adresse, sans impact sur les statistiques
- Tableau de bord, progression en temps réel (Socket.IO), journal détaillé par destinataire, résultats par groupe
- Recherche d'entreprises (Geoapify) avec suggestion d'emails (Hunter.io)
- Brouillons, journal d'envoi, sauvegarde quotidienne de la base

Le détail des fonctionnalités livrées dans cette version ("Build Now") et de celles prévues pour une itération ultérieure ("Build Next" : récurrence des campagnes, Swagger, import/export de campagnes, sauvegarde/restauration automatique, recherche globale, raccourcis clavier...) est documenté dans le plan d'architecture du projet.

## Stack technique

- **Backend** : Node.js, Express, TypeScript, Prisma, MySQL, Nodemailer, Socket.IO, JWT, AES-256-GCM
- **Frontend** : React, TypeScript, Vite, Tailwind CSS (mode sombre), TanStack Query, TipTap, Socket.IO client

## Démarrage rapide avec Docker

Prérequis : Docker et Docker Compose.

1. Copier le fichier d'environnement et le personnaliser :

   ```bash
   cp .env.example .env
   ```

   Renseigner au minimum :
   - `JWT_SECRET` — chaîne aléatoire longue (`openssl rand -hex 32`)
   - `ENCRYPTION_KEY` — exactement 64 caractères hexadécimaux (`openssl rand -hex 32`)
   - `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD` — mots de passe MySQL
   - `PUBLIC_BASE_URL` — URL publique de l'API (nécessaire pour que les liens de suivi d'ouverture/clic fonctionnent une fois l'application exposée sur Internet)
   - `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — identifiants du premier compte administrateur créé automatiquement

2. Lancer l'ensemble (base de données MySQL, backend, frontend) :

   ```bash
   docker compose up -d --build
   ```

   Au démarrage, le backend applique automatiquement les migrations Prisma (`prisma migrate deploy`) puis crée le compte administrateur défini dans `.env` s'il n'existe pas encore.

3. Accéder à l'application :
   - Frontend : http://localhost:5173
   - API backend : http://localhost:4000/api/health

## Développement local (sans Docker)

Prérequis : Node.js 20+, une instance MySQL accessible.

```bash
npm install                     # installe les deux workspaces (backend + frontend)

# Backend
cp .env.example backend/.env    # ou configurer les variables au niveau racine, selon votre outillage
cd backend
npx prisma migrate dev          # crée le schéma dans la base configurée par DATABASE_URL
npm run prisma:seed             # crée le compte administrateur initial
npm run dev                     # démarre l'API sur http://localhost:4000

# Frontend (dans un autre terminal)
cd frontend
cp .env.example .env
npm run dev                     # démarre l'interface sur http://localhost:5173
```

## Configuration d'un compte SMTP

Une fois connecté à l'application avec le compte administrateur, aller dans **Comptes SMTP** et ajouter un compte :

- **Gmail** : hôte `smtp.gmail.com`, port `587`, sécurité `STARTTLS`, utilisateur = adresse Gmail, mot de passe = un [mot de passe d'application](https://support.google.com/accounts/answer/185833) (la double authentification doit être activée).
- **Outlook / Microsoft 365** : hôte `smtp.office365.com`, port `587`, sécurité `STARTTLS`.
- **Yahoo Mail** : hôte `smtp.mail.yahoo.com`, port `587` ou `465` (`SSL`), mot de passe d'application requis également.
- **Serveur SMTP personnalisé / Postfix / Exim / Mailcow** : renseigner l'hôte, le port et le mode de sécurité fournis par votre hébergeur ou votre administrateur système.

Utiliser le bouton **Tester la connexion** après chaque ajout pour vérifier les identifiants avant tout envoi réel.

## Suivi des ouvertures, désinscription

Les liens de suivi et de désinscription sont construits à partir de `PUBLIC_BASE_URL`. En local (`http://localhost:4000`), ils ne sont pas atteignables par les destinataires réels : ils ne fonctionnent qu'une fois l'application déployée sur un nom de domaine public.

En production, le proxy inverse doit transmettre au backend (port 4000) **`/api/`, `/t/` et `/socket.io/`** — sinon le pixel d'ouverture tombe sur la page 404 du frontend. Une configuration Nginx prête à l'emploi est fournie dans [`deploy/nginx-reverse-proxy.conf`](deploy/nginx-reverse-proxy.conf).

Test rapide : `https://votre-domaine/t/o/test.png` doit renvoyer une image (vide), pas une page HTML.

## Délivrabilité (DNS)

À vérifier sur le domaine d'expédition (zone DNS chez l'hébergeur) :

- **SPF** : doit autoriser *chaque* serveur SMTP utilisé pour envoyer avec ce domaine. Ex. pour Hostinger : `v=spf1 include:_spf.mail.hostinger.com ~all`. Si vous envoyez aussi via Gmail/Outlook avec une adresse du domaine, ajoutez leur `include:`.
- **DKIM** : clé publiée par l'hébergeur mail (ex. `hostingermail1._domainkey`).
- **DMARC** : commencer par `v=DMARC1; p=none; rua=mailto:dmarc@votre-domaine` pour recevoir les rapports, puis passer à `p=quarantine` une fois SPF/DKIM confirmés.

## Sauvegardes

Le service `db-backup` réalise un dump compressé de la base chaque jour dans `./backups/` (14 jours conservés, réglable via `BACKUP_RETENTION_DAYS`). Copiez régulièrement ce dossier hors du serveur.

Restauration :

```bash
gunzip -c backups/mailing_AAAA-MM-JJ_HH-MM.sql.gz | docker compose exec -T mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" mailing
```

## Tests et intégration continue

```bash
npm test --workspace backend      # tests unitaires (Vitest)
npm run build --workspace frontend
```

Le workflow GitHub Actions (`.github/workflows/ci.yml`) exécute la vérification des types, les tests et le build à chaque push. Il peut aussi déployer automatiquement : définir les secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PATH` (et optionnellement `DEPLOY_PORT`) dans *Settings → Secrets and variables → Actions*.

## Déploiement

Sur le serveur, depuis le dossier du projet (clone git) :

```bash
./scripts/deploy.sh
```

Le script sauvegarde la base, récupère `main`, reconstruit les conteneurs (les migrations sont appliquées au démarrage du backend) et vérifie que l'API répond.

## Variables d'environnement

Voir `.env.example` (racine) pour la liste complète et commentée : base de données, secrets JWT/chiffrement, CORS, URL publique, identifiants du compte administrateur initial, variables Vite du frontend.

## Sécurité

- Mots de passe SMTP chiffrés au repos (AES-256-GCM)
- Mots de passe utilisateurs hachés (Argon2)
- Validation stricte des entrées (Zod) sur chaque endpoint
- Assainissement HTML (anti-XSS) des modèles d'email, à la sauvegarde et après fusion des variables
- Filtres de segments compilés depuis une liste blanche de champs/opérateurs (jamais de SQL brut)
- Limitation de débit sur l'API et renforcée sur la connexion

## Structure du dépôt

```
mailing/
├── backend/     API Express + Prisma + moteur d'envoi
├── frontend/    Interface React + Tailwind
├── docker-compose.yml
└── .env.example
```
