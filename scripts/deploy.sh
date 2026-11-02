#!/bin/sh
# Production deploy: pull the latest main, rebuild and restart the stack.
# Run on the server, from the project directory (also used by the CI
# deploy job). Database migrations are applied by the backend container
# on startup (`prisma migrate deploy`), and a fresh backup is taken first.
set -eu

cd "$(dirname "$0")/.."

echo "==> Sauvegarde de la base avant déploiement"
mkdir -p backups
if docker compose ps --status running mysql >/dev/null 2>&1; then
  docker compose exec -T mysql sh -c 'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction --no-tablespaces "$MYSQL_DATABASE"' \
    | gzip > "backups/mailing_predeploy_$(date +%Y-%m-%d_%H-%M).sql.gz" \
    || echo "    (sauvegarde impossible, déploiement poursuivi)"
fi

echo "==> Récupération du code"
git pull --ff-only origin main

echo "==> Reconstruction et redémarrage"
docker compose up -d --build

echo "==> Vérification de santé"
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if docker compose exec -T backend wget -qO- http://localhost:4000/api/health >/dev/null 2>&1; then
    echo "    Backend OK"
    exit 0
  fi
  sleep 5
done
echo "    ERREUR : le backend ne répond pas — voir 'docker compose logs backend'" >&2
exit 1
