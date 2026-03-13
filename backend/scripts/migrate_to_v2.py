#!/usr/bin/env python3
"""
Migrazione dati da struttura v1 (lists) a v2 (areas + projects).

NON elimina le liste originali. Crea aree e progetti, poi associa
i task esistenti ai progetti tramite project_id.

Eseguire una volta sola dopo aver applicato tutte le migration Alembic:
    docker compose exec -w /app backend python scripts/migrate_to_v2.py
"""

import asyncio
import sys
import os

# Ensure app is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, update
from app.core.database import async_session
from app.models.area import Area
from app.models.project import Project, ProjectType, ProjectStatus
from app.models.task import Task


# ── Configuration ──────────────────────────────────────────

# Main user (Emanuele)
MAIN_USER_ID = 2

# Areas to create
AREAS = [
    {"name": "Family",      "color": "#10B981", "icon": "home"},
    {"name": "Vision-e",    "color": "#3B82F6", "icon": "briefcase"},
    {"name": "AIthink",     "color": "#8B5CF6", "icon": "brain"},
    {"name": "La Voce",     "color": "#F59E0B", "icon": "megaphone"},
    {"name": "Croce Rossa", "color": "#EC4899", "icon": "heart"},
    {"name": "Manu",        "color": "#EF4444", "icon": "user"},
]

# Mapping: list_id → (area_name, project_name, project_type)
# Each list becomes a project under the specified area
LIST_TO_PROJECT = {
    3: ("Family",      "Family",         ProjectType.PERSONAL),
    4: ("Vision-e",    "Vision-e",       ProjectType.TECHNICAL),
    5: ("AIthink",     "AIthink",        ProjectType.TECHNICAL),
    6: ("La Voce",     "La Voce",        ProjectType.ADMINISTRATIVE),
    7: ("Croce Rossa", "Croce Rossa",    ProjectType.ADMINISTRATIVE),
    9: ("Manu",        "Personale Manu", ProjectType.PERSONAL),
    # Test user lists
    1: ("Family",      "Casa (test)",    ProjectType.PERSONAL),
    2: ("Vision-e",    "Vision-e (test)", ProjectType.TECHNICAL),
}


async def migrate():
    async with async_session() as db:
        # 1. Check if migration already ran
        existing = await db.execute(select(Area).where(Area.owner_id == MAIN_USER_ID))
        if existing.scalars().first():
            print("⚠️  Aree già esistenti per l'utente principale. Migrazione già eseguita?")
            confirm = input("Continuare comunque? (s/N): ").strip().lower()
            if confirm != "s":
                print("Annullato.")
                return

        # 2. Create areas
        area_map: dict[str, Area] = {}
        for i, area_data in enumerate(AREAS):
            area = Area(
                name=area_data["name"],
                color=area_data["color"],
                icon=area_data["icon"],
                owner_id=MAIN_USER_ID,
                position=i + 1,
            )
            db.add(area)
            area_map[area_data["name"]] = area

        await db.flush()  # Get IDs
        print(f"✅ Create {len(area_map)} aree:")
        for name, area in area_map.items():
            print(f"   {name} (id={area.id})")

        # 3. Create projects from lists
        project_map: dict[int, Project] = {}  # list_id → Project
        for list_id, (area_name, project_name, project_type) in LIST_TO_PROJECT.items():
            area = area_map.get(area_name)
            if not area:
                print(f"⚠️  Area '{area_name}' non trovata, skip lista {list_id}")
                continue

            # Determine owner: test lists (owner_id=1) stay with user 1
            owner_id = 1 if list_id in (1, 2) else MAIN_USER_ID

            project = Project(
                name=project_name,
                area_id=area.id,
                project_type=project_type,
                status=ProjectStatus.ACTIVE,
                color=area.color,
                owner_id=owner_id,
            )
            db.add(project)
            project_map[list_id] = project

        await db.flush()
        print(f"\n✅ Creati {len(project_map)} progetti:")
        for list_id, project in project_map.items():
            print(f"   Lista {list_id} → Progetto '{project.name}' (id={project.id}, area_id={project.area_id})")

        # 4. Associate tasks with projects
        total_updated = 0
        for list_id, project in project_map.items():
            result = await db.execute(
                update(Task)
                .where(Task.list_id == list_id, Task.project_id.is_(None))
                .values(project_id=project.id)
            )
            count = result.rowcount
            total_updated += count
            if count > 0:
                print(f"   📋 Lista {list_id} → {count} task associati a progetto '{project.name}'")

        print(f"\n✅ Totale: {total_updated} task associati a progetti")

        # 5. Commit
        await db.commit()
        print("\n🎉 Migrazione completata con successo!")
        print("   Le liste originali sono intatte.")
        print("   I task hanno ora sia list_id che project_id.")


if __name__ == "__main__":
    print("=" * 60)
    print("  Zeno v2 — Migrazione dati")
    print("=" * 60)
    print()
    print("Questa operazione:")
    print("  1. Crea 6 aree (Family, Vision-e, AIthink, La Voce, Croce Rossa, Manu)")
    print("  2. Crea un progetto per ogni lista esistente")
    print("  3. Associa i task ai progetti (senza toccare list_id)")
    print()
    confirm = input("Procedere? (s/N): ").strip().lower()
    if confirm != "s":
        print("Annullato.")
        sys.exit(0)

    asyncio.run(migrate())
