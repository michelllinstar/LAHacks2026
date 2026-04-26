# # from uagents import Agent

# # # Use the exact seed from your coordinator.py
# # coordinator = Agent(name="cartographer_coordinator", seed="cartographer-coordinator-seed")
# # print(f"Coordinator Address: {coordinator.address}")


from uagents import Agent

# We create a standalone agent using the EXACT SAME SEED
# so it generates the exact same address.
temp_coordinator = Agent(
    name="carto_temp_coordinator",
    seed="cartographer-coordinator-seed",
    port=8000,
    endpoint=["http://127.0.0.1:8000/submit"]
)

if __name__ == "__main__":
    temp_coordinator.run()