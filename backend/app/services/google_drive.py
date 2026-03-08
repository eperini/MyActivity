"""Google Drive backup service using OAuth2 refresh token."""
import os
import threading

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from googleapiclient.errors import HttpError

from app.core.config import settings

_service = None
_lock = threading.Lock()


def _get_service():
    global _service
    if _service is None:
        with _lock:
            if _service is None:
                if not settings.GOOGLE_DRIVE_CLIENT_ID or not settings.GOOGLE_DRIVE_REFRESH_TOKEN:
                    raise RuntimeError("Google Drive OAuth2 credentials not configured")

                creds = Credentials(
                    token=None,
                    refresh_token=settings.GOOGLE_DRIVE_REFRESH_TOKEN,
                    token_uri="https://oauth2.googleapis.com/token",
                    client_id=settings.GOOGLE_DRIVE_CLIENT_ID,
                    client_secret=settings.GOOGLE_DRIVE_CLIENT_SECRET,
                )
                _service = build("drive", "v3", credentials=creds, cache_discovery=False)
    return _service


def upload_backup(file_path: str, folder_id: str | None = None) -> str:
    """Upload a backup file to Google Drive. Returns the file ID."""
    folder = folder_id or settings.GOOGLE_DRIVE_FOLDER_ID
    if not folder:
        raise RuntimeError("GOOGLE_DRIVE_FOLDER_ID not configured")

    service = _get_service()
    filename = os.path.basename(file_path)

    file_metadata = {
        "name": filename,
        "parents": [folder],
    }
    media = MediaFileUpload(file_path, mimetype="application/gzip", resumable=True)

    result = service.files().create(
        body=file_metadata,
        media_body=media,
        fields="id, name, size",
    ).execute()

    return result["id"]


def list_backups(folder_id: str | None = None) -> list[dict]:
    """List backup files in the Drive folder, sorted by creation time."""
    folder = folder_id or settings.GOOGLE_DRIVE_FOLDER_ID
    if not folder:
        return []

    service = _get_service()
    results = service.files().list(
        q=f"'{folder}' in parents and trashed = false",
        fields="files(id, name, size, createdTime)",
        orderBy="createdTime desc",
        pageSize=100,
    ).execute()

    return results.get("files", [])


def delete_file(file_id: str):
    """Delete a file from Google Drive."""
    service = _get_service()
    try:
        service.files().delete(fileId=file_id).execute()
    except HttpError as e:
        if e.resp.status != 404:
            raise


def rotate_backups(keep: int | None = None, folder_id: str | None = None) -> int:
    """Delete old backups, keeping only the N most recent. Returns count deleted."""
    max_keep = keep or settings.BACKUP_KEEP_COUNT
    files = list_backups(folder_id)

    if len(files) <= max_keep:
        return 0

    to_delete = files[max_keep:]
    deleted = 0
    for f in to_delete:
        try:
            delete_file(f["id"])
            deleted += 1
        except Exception as e:
            print(f"Error deleting backup {f['name']}: {e}")

    return deleted
