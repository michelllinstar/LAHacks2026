import os
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path(__file__).parent.parent / '.env.local')

MONGODB_URI = os.getenv('MONGODB_URI')
if not MONGODB_URI:
    raise RuntimeError('Please define MONGODB_URI in .env.local')

client = MongoClient(MONGODB_URI)
db = client['agentverse_uml']
