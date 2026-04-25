from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from backend.routes import auth, projects, agentverse

load_dotenv(Path(__file__).parent.parent / '.env.local')

app = FastAPI(title='Agentverse UML Backend')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:3000'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*']
)

app.include_router(auth.router, prefix='/api/auth')
app.include_router(projects.router, prefix='/api/projects')
app.include_router(agentverse.router, prefix='/api/agentverse')

@app.get('/health')
def health_check():
    return {'status': 'ok'}
