from fastapi import APIRouter, HTTPException
from backend.models import AgentverseQueryPayload
from backend.lib.agentverse import query_agentverse

router = APIRouter()

@router.post('/')
def ask_agentverse(payload: AgentverseQueryPayload):
    try:
        response = query_agentverse(payload.question, payload.projectContext)
        return {'result': response}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
