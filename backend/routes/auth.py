import os
import time
import jwt
from fastapi import APIRouter, HTTPException, Response
from backend.lib.auth_guard import _secret
from backend.models import LoginPayload

router = APIRouter()

@router.post('/login')
def login(payload: LoginPayload, response: Response):
    # Demo mode: accept any non-empty email/password pair.
    if not payload.email or not payload.password:
        raise HTTPException(status_code=401, detail='Email and password required')

    token = jwt.encode(
        {
            'sub': payload.email,
            'email': payload.email,
            'name': payload.email.split('@')[0] or payload.email,
            'exp': int(time.time()) + 8 * 60 * 60,
        },
        _secret(),
        algorithm='HS256',
    )
    response.set_cookie(
        'agentverse_session',
        token,
        httponly=True,
        secure=os.getenv('NODE_ENV') == 'production',
        samesite='lax',
        max_age=8 * 60 * 60,
        path='/'
    )
    return {'message': 'Authenticated'}
