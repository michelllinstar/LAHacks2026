import os
import time
import jwt
from fastapi import APIRouter, HTTPException, Response
from backend.lib.auth_guard import _secret
from backend.models import LoginPayload

router = APIRouter()

USERS = [
    {
        'id': 'u1',
        'email': 'admin@agentverse.app',
        'password': 'password123',
        'name': 'Agentverse Admin'
    }
]

@router.post('/login')
def login(payload: LoginPayload, response: Response):
    user = next((u for u in USERS if u['email'] == payload.email and u['password'] == payload.password), None)
    if not user:
        raise HTTPException(status_code=401, detail='Invalid credentials')

    # ``exp`` matches the cookie max_age below so the JWT and the HTTP
    # cookie expire together. PyJWT defaults to no expiry, which would
    # leave the JWT valid after the cookie is purged — a quiet mismatch.
    token = jwt.encode(
        {
            'sub': user['id'],
            'email': user['email'],
            'name': user['name'],
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
