"""
Script per rigenerare il refresh token di Google Drive OAuth2.

Eseguire dal Mac (non da Docker):
    python3 backend/scripts/refresh_google_token.py

1. Apre il browser per autenticarti con Google
2. Stampa il nuovo GOOGLE_DRIVE_REFRESH_TOKEN
3. Aggiorna il file .env automaticamente
"""

import http.server
import json
import os
import sys
import urllib.parse
import urllib.request
import webbrowser

def _load_env():
    """Load CLIENT_ID and CLIENT_SECRET from .env file."""
    env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
    env_path = os.path.normpath(env_path)
    vals = {}
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    vals[k.strip()] = v.strip()
    return vals

_env = _load_env()
CLIENT_ID = _env.get("GOOGLE_DRIVE_CLIENT_ID", "")
CLIENT_SECRET = _env.get("GOOGLE_DRIVE_CLIENT_SECRET", "")
if not CLIENT_ID or not CLIENT_SECRET:
    print("Errore: GOOGLE_DRIVE_CLIENT_ID e GOOGLE_DRIVE_CLIENT_SECRET devono essere configurati nel .env")
    sys.exit(1)

REDIRECT_URI = "http://localhost:8090"
SCOPE = "https://www.googleapis.com/auth/drive.file"

auth_code = None


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        global auth_code
        query = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(query)
        auth_code = params.get("code", [None])[0]

        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(b"<h2>OK! Puoi chiudere questa finestra.</h2>")

    def log_message(self, format, *args):
        pass  # Suppress logs


def main():
    # Build auth URL
    auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        + urllib.parse.urlencode({
            "client_id": CLIENT_ID,
            "redirect_uri": REDIRECT_URI,
            "response_type": "code",
            "scope": SCOPE,
            "access_type": "offline",
            "prompt": "consent",
        })
    )

    print("Apro il browser per l'autenticazione Google...")
    print(f"Se non si apre, vai qui: {auth_url}\n")
    webbrowser.open(auth_url)

    # Start local server to catch the redirect
    server = http.server.HTTPServer(("localhost", 8090), Handler)
    server.handle_request()

    if not auth_code:
        print("Errore: nessun codice ricevuto")
        sys.exit(1)

    # Exchange auth code for tokens
    data = urllib.parse.urlencode({
        "code": auth_code,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code",
    }).encode()

    req = urllib.request.Request("https://oauth2.googleapis.com/token", data=data)
    try:
        with urllib.request.urlopen(req) as resp:
            tokens = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"Errore: {e.read().decode()}")
        sys.exit(1)

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        print("Errore: nessun refresh_token nella risposta")
        print(json.dumps(tokens, indent=2))
        sys.exit(1)

    print(f"\nNuovo GOOGLE_DRIVE_REFRESH_TOKEN:\n{refresh_token}\n")

    # Update .env file
    env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
    env_path = os.path.normpath(env_path)

    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            lines = f.readlines()

        updated = False
        for i, line in enumerate(lines):
            if line.startswith("GOOGLE_DRIVE_REFRESH_TOKEN="):
                lines[i] = f"GOOGLE_DRIVE_REFRESH_TOKEN={refresh_token}\n"
                updated = True
                break

        if not updated:
            lines.append(f"GOOGLE_DRIVE_REFRESH_TOKEN={refresh_token}\n")

        with open(env_path, "w") as f:
            f.writelines(lines)

        print(f"File .env aggiornato: {env_path}")
        print("Ora riavvia i container: docker compose restart backend celery-worker celery-beat")
    else:
        print(f"File .env non trovato in {env_path}")
        print("Aggiorna manualmente GOOGLE_DRIVE_REFRESH_TOKEN nel tuo .env")


if __name__ == "__main__":
    main()
