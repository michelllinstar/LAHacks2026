import os
import requests

AGENTVERSE_API_KEY = os.getenv('AGENTVERSE_API_KEY')
AGENTVERSE_AGENT_ID = os.getenv('AGENTVERSE_AGENT_ID')

if not AGENTVERSE_API_KEY or not AGENTVERSE_AGENT_ID:
    print('Warning: Agentverse credentials are missing. Add AGENTVERSE_API_KEY and AGENTVERSE_AGENT_ID to .env.local.')


def query_agentverse(question: str, context: dict | None = None):
    if not AGENTVERSE_API_KEY or not AGENTVERSE_AGENT_ID:
        raise RuntimeError('Missing Agentverse credentials')

    payload = {
        'agentId': AGENTVERSE_AGENT_ID,
        'inputs': {
            'prompt': question,
            'context': context or {}
        }
    }

    response = requests.post(
        'https://api.agentverse.ai/chat',
        json=payload,
        headers={
            'Authorization': f'Bearer {AGENTVERSE_API_KEY}',
            'Content-Type': 'application/json'
        }
    )
    response.raise_for_status()
    return response.json()
