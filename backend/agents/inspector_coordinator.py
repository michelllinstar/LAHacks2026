import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../../.env.local"))

from backend.agents.coordinator import build_agent

agent = build_agent()

if __name__ == "__main__":
    print(f"Coordinator address: {agent.address}")
    print("Open http://localhost:8001 in your browser, paste your AGENTVERSE_API_KEY, and click Connect.")
    agent.run()
