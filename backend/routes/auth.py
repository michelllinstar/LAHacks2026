import os
import jwt
from fastapi import APIRouter, HTTPException, Response
from backend.models import LoginPayload

router = APIRouter()

SECRET = os.getenv('JWT_SECRET', 'dev-secret-token')
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

    token = jwt.encode({'sub': user['id'], 'email': user['email'], 'name': user['name']}, SECRET, algorithm='HS256')
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
