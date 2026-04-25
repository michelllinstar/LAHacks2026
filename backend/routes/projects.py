from fastapi import APIRouter, HTTPException
from backend.models import ProjectPayload
from backend.database import get_connection

router = APIRouter()

DIAGRAM_COLUMNS = (
    'id, name, description, '
    'cloudinary_url AS cloudinaryUrl, '
    "created_at AS createdAt"
)


@router.get('/')
def get_projects():
    conn = get_connection()
    try:
        project = conn.execute(
            'SELECT id FROM projects WHERE slug = ?', ('default',)
        ).fetchone()
        if not project:
            return {'diagrams': []}
        rows = conn.execute(
            f'SELECT {DIAGRAM_COLUMNS} FROM diagrams WHERE project_id = ? ORDER BY created_at',
            (project['id'],),
        ).fetchall()
        return {'diagrams': [dict(r) for r in rows]}
    finally:
        conn.close()


@router.post('/')
def add_project(payload: ProjectPayload):
    if not payload.name:
        raise HTTPException(status_code=400, detail='Diagram name is required')

    conn = get_connection()
    try:
        conn.execute(
            '''
            INSERT INTO projects (slug, name, repo_url)
            VALUES (?, ?, ?)
            ON CONFLICT(slug) DO UPDATE SET
                name = excluded.name,
                repo_url = excluded.repo_url
            ''',
            ('default', 'Agentverse UML Project', payload.repoUrl),
        )
        project = conn.execute(
            'SELECT id, slug, name, repo_url AS repoUrl FROM projects WHERE slug = ?',
            ('default',),
        ).fetchone()
        conn.execute(
            '''
            INSERT INTO diagrams (project_id, name, description, cloudinary_url)
            VALUES (?, ?, ?, ?)
            ''',
            (project['id'], payload.name, payload.description, payload.cloudinaryUrl),
        )
        conn.commit()
        diagrams = conn.execute(
            f'SELECT {DIAGRAM_COLUMNS} FROM diagrams WHERE project_id = ? ORDER BY created_at',
            (project['id'],),
        ).fetchall()
        return {'project': {**dict(project), 'diagrams': [dict(d) for d in diagrams]}}
    finally:
        conn.close()
