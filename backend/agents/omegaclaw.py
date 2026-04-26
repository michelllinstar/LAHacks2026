# import asyncio
# from typing import Dict, Any

# # 1. Directly import the Coordinator's brain and the shared protocols
# from backend.agents.coordinator import handle_user_query
# from backend.agents.protocols import UserQuery

# def run_cartographer_skill(repo_hash: str, question: str) -> Dict[str, Any]:
#     """
#     OmegaClaw Skill: Executes the Codebase Cartographer logic locally,
#     bypassing the cloud mailbox return-trip routing issues.
#     """
#     print(f"🧠 OmegaClaw invoking Cartographer logic for repo: {repo_hash}...")
    
#     # Format the request using the Agentverse protocol
#     request = UserQuery(
#         repo_hash=repo_hash,
#         question=question
#     )

#     try:
#         # Call the synchronous agent logic directly
#         response = handle_user_query(request)
        
#         # Return the bundle back to OmegaClaw
#         if hasattr(response, 'bundle'):
#             return response.bundle
#         else:
#             return {"error": "Unexpected response format", "raw": str(response)}

#     except Exception as e:
#         return {"error": f"Failed to execute Cartographer logic: {str(e)}"}


# # --- Quick Local Test ---
# if __name__ == "__main__":
#     print("🚀 Starting OmegaClaw bridge test (Direct Integration)...")
    
#     test_repo = "demo_repo_hash" # Ensure this hash exists in your local DB
#     test_question = "What is the architecture of the auth cluster?"
    
#     print(f"Sending question: '{test_question}'")
#     result = run_cartographer_skill(test_repo, test_question)
    
#     print("\n--- 📦 Result from Cartographer Agentverse ---")
#     print(result)

import asyncio
from typing import Dict, Any

from backend.agents.coordinator import handle_user_query
from backend.agents.protocols import UserQuery

def run_cartographer_skill(repo_hash: str, question: str) -> Dict[str, Any]:
    """
    OmegaClaw Skill: Executes the Codebase Cartographer logic locally,
    bypassing the cloud mailbox return-trip routing issues.
    """
    print(f"🧠 OmegaClaw invoking Cartographer logic for repo: {repo_hash}...")
    
    request = UserQuery(
        repo_hash=repo_hash,
        question=question
    )

    try:
        response = handle_user_query(request)
        
        if hasattr(response, 'bundle'):
            return response.bundle
        else:
            return {"error": "Unexpected response format", "raw": str(response)}

    except Exception as e:
        return {"error": f"Failed to execute Cartographer logic: {str(e)}"}

if __name__ == "__main__":
    print("🚀 Starting OmegaClaw bridge test (Direct Integration)...")
    test_repo = "demo_repo_hash" 
    test_question = "What is the architecture of the auth cluster?"
    result = run_cartographer_skill(test_repo, test_question)
    print("\n--- 📦 Result from Cartographer Agentverse ---")
    print(result)