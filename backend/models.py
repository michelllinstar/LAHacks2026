from pydantic import BaseModel
from typing import Optional

class LoginPayload(BaseModel):
    email: str
    password: str

class ProjectPayload(BaseModel):
    name: str
    description: Optional[str] = None
    cloudinaryUrl: Optional[str] = None
    repoUrl: Optional[str] = None

class AgentverseQueryPayload(BaseModel):
    question: str
    projectContext: Optional[dict] = None
