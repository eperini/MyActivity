#!/bin/bash
# Zeno - Database backup script
# Run via cron: 0 3 * * * /Users/perini/myActivity/backup.sh

BACKUP_DIR="/Users/perini/myActivity/backups"
KEEP_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/zeno_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

# Dump database from Docker container
docker compose -f /Users/perini/myActivity/docker-compose.yml exec -T db \
  pg_dump -U myactivity -d myactivity --clean --if-exists \
  | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ] && [ -s "$BACKUP_FILE" ]; then
  echo "[$(date)] Backup OK: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
  # Cleanup old backups
  find "$BACKUP_DIR" -name "zeno_*.sql.gz" -mtime +${KEEP_DAYS} -delete
else
  echo "[$(date)] Backup FAILED" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi
