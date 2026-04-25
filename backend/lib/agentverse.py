import os
import requests

AGENTVERSE_BASE_URL = 'https://agentverse.ai/v1/agents'
PLACEHOLDER_VALUES = {None, '', 'your-agentverse-api-key', 'your-agent-id'}


def query_agentverse(question: str, project_context: dict | None = None) -> dict:
    api_key = os.getenv('AGENTVERSE_API_KEY')
    agent_id = os.getenv('AGENTVERSE_AGENT_ID')

    if api_key in PLACEHOLDER_VALUES or agent_id in PLACEHOLDER_VALUES:
        return {
            'mode': 'stub',
            'message': 'Agentverse credentials not configured; returning placeholder response.',
            'echo': {'question': question, 'projectContext': project_context},
        }

    response = requests.post(
        f'{AGENTVERSE_BASE_URL}/{agent_id}/messages',
        headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
        json={'question': question, 'context': project_context or {}},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()
