#!/bin/sh
# Daily MySQL dump loop, run by the `db-backup` service in docker-compose.yml.
# Writes gzipped dumps to /backups (bind-mounted to ./backups on the host)
# and deletes dumps older than BACKUP_RETENTION_DAYS.
set -eu

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"

backup_once() {
  stamp="$(date +%Y-%m-%d_%H-%M)"
  file="/backups/mailing_${stamp}.sql.gz"
  tmp="${file}.partial"

  # --single-transaction: consistent snapshot without locking InnoDB tables.
  if mysqldump -h mysql -u root -p"${MYSQL_ROOT_PASSWORD}" \
      --single-transaction --routines --no-tablespaces "${MYSQL_DATABASE}" | gzip > "${tmp}"; then
    mv "${tmp}" "${file}"
    echo "[backup] OK ${file}"
  else
    rm -f "${tmp}"
    echo "[backup] ECHEC $(date)" >&2
  fi

  find /backups -name 'mailing_*.sql.gz' -mtime +"${RETENTION_DAYS}" -delete
}

while true; do
  backup_once
  sleep "${INTERVAL_SECONDS}"
done
