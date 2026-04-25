from datetime import datetime

from datetime import datetime

from fastapi import APIRouter, HTTPException
from pymongo import ReturnDocument
from backend.models import ProjectPayload
from backend.database import db

router = APIRouter()
collection = db['projects']

@router.get('/')
def get_projects():
    project = collection.find_one({'slug': 'default'})
    if not project:
        return {'diagrams': []}

    return {'diagrams': project.get('diagrams', [])}

@router.post('/')
def add_project(payload: ProjectPayload):
    if not payload.name:
        raise HTTPException(status_code=400, detail='Diagram name is required')

    project = collection.find_one_and_update(
        {'slug': 'default'},
        {
            '$set': {
                'slug': 'default',
                'name': 'Agentverse UML Project',
                'repoUrl': payload.repoUrl
            },
            '$push': {
                'diagrams': {
                    'name': payload.name,
                    'description': payload.description,
                    'cloudinaryUrl': payload.cloudinaryUrl,
                    'createdAt': datetime.utcnow()
                }
            }
        },
        upsert=True,
        return_document=ReturnDocument.AFTER
    )

    return {'project': project}
