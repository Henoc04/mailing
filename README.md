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
- Suivi des ouvertures et des clics (pixel de suivi + redirection de liens)
- Tableau de bord (statistiques, historique des campagnes) et progression en temps réel (Socket.IO, avec repli sur interrogation périodique)
- Brouillons, journal d'envoi

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

## Suivi des ouvertures et des clics

Les liens de suivi sont construits à partir de `PUBLIC_BASE_URL`. En local (`http://localhost:4000`), les pixels/redirections ne seront pas atteignables par les destinataires réels : ce n'est utile qu'une fois l'application déployée sur un nom de domaine public accessible depuis Internet.

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
