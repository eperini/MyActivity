import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import settings
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/trigger")
async def trigger_backup(user: User = Depends(get_current_user)):
    """Trigger a manual database backup to Google Drive. Admin only."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Solo gli admin possono eseguire backup")
    if not settings.GOOGLE_DRIVE_FOLDER_ID:
        raise HTTPException(status_code=400, detail="GOOGLE_DRIVE_FOLDER_ID non configurato")

    from app.workers.tasks import backup_database_to_drive
    task = backup_database_to_drive.delay()
    return {"detail": "Backup avviato", "task_id": task.id}


@router.get("/list")
async def list_backups(user: User = Depends(get_current_user)):
    """List backups stored on Google Drive. Admin only."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Solo gli admin possono vedere i backup")
    if not settings.GOOGLE_DRIVE_FOLDER_ID:
        return {"backups": [], "configured": False}

    try:
        from app.services.google_drive import list_backups as drive_list
        backups = drive_list()
        return {
            "backups": [
                {
                    "name": f["name"],
                    "size": int(f.get("size", 0)),
                    "created": f.get("createdTime"),
                }
                for f in backups
            ],
            "configured": True,
        }
    except Exception as e:
        logger.exception("Error listing backups")
        raise HTTPException(status_code=500, detail="Errore durante il recupero dei backup")
