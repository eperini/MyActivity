#!/usr/bin/env python3
"""
One-time script to get a Google Drive OAuth2 refresh token.

Usage:
    python scripts/get_drive_token.py CLIENT_ID CLIENT_SECRET

It will open a browser for Google login. After authorization,
it prints the refresh token to add to your .env file.
"""
import sys
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/drive.file"]


def main():
    if len(sys.argv) != 3:
        print("Usage: python scripts/get_drive_token.py CLIENT_ID CLIENT_SECRET")
        sys.exit(1)

    client_id = sys.argv[1]
    client_secret = sys.argv[2]

    client_config = {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://localhost:8080"],
        }
    }

    flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
    creds = flow.run_local_server(port=8080, prompt="consent", access_type="offline")

    print("\n" + "=" * 60)
    print("Add this to your .env file:")
    print(f"GOOGLE_DRIVE_REFRESH_TOKEN={creds.refresh_token}")
    print("=" * 60)


if __name__ == "__main__":
    main()
