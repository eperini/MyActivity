#!/bin/bash
# ZenoDev - avvia/gestisci l'ambiente di sviluppo
# Uso: ./dev.sh [up|down|logs|restart|migrate|frontend|status]

set -e
cd "$(dirname "$0")"
DC="docker compose -f docker-compose.dev.yml"

case "${1:-up}" in
  up)
    echo "🚀 Avvio ZenoDev (backend :8100, frontend :3100)..."
    $DC up -d --build
    echo "⏳ Attendo che il backend sia pronto..."
    for i in $(seq 1 60); do
      if curl -s http://localhost:8100/api/health &>/dev/null; then
        echo "✅ Backend pronto!"
        break
      fi
      sleep 1
    done
    echo ""
    echo "Per avviare il frontend dev:"
    echo "  cd frontend && NEXT_PUBLIC_API_URL=http://localhost:8100/api PORT=3100 npm run dev"
    echo ""
    echo "Oppure in produzione:"
    echo "  cd frontend && npm run build && NEXT_PUBLIC_API_URL=http://localhost:8100/api PORT=3100 npm run start"
    ;;
  down)
    echo "⏹️  Fermo ZenoDev..."
    $DC down
    ;;
  logs)
    $DC logs -f "${@:2}"
    ;;
  restart)
    echo "🔄 Riavvio ZenoDev..."
    $DC restart "${@:2}"
    ;;
  migrate)
    echo "📦 Eseguo migrazioni su DB dev..."
    $DC exec -w /app backend-dev alembic upgrade head
    ;;
  frontend)
    echo "🌐 Avvio frontend dev su :3100..."
    cd frontend && NEXT_PUBLIC_API_URL=http://localhost:8100/api PORT=3100 npm run dev
    ;;
  status)
    $DC ps
    ;;
  *)
    echo "Uso: ./dev.sh [up|down|logs|restart|migrate|frontend|status]"
    ;;
esac
