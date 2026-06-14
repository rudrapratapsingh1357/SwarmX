import math

def predict_return_time(agent_pos: tuple, base_pos: tuple, speed_kmh: float) -> float:
    """
    Calculates time in seconds needed for agent to return to base.
    Uses Euclidean distance / speed.
    """
    x1, y1 = agent_pos
    x2, y2 = base_pos
    distance_km = math.hypot(x2 - x1, y2 - y1)
    speed_kms = speed_kmh / 3600.0
    if speed_kms <= 0:
        return 999999.0
    return distance_km / speed_kms

def predict_battery_at_return(
    current_battery: float,
    agent_pos: tuple,
    base_pos: tuple,
    speed_kmh: float,
    drain_rate_per_tick: float
) -> float:
    """
    Predicts battery level when agent reaches base.
    Note: tick interval is 0.5s, so drain_rate_per_second = drain_rate_per_tick * 2.
    """
    return_time_seconds = predict_return_time(agent_pos, base_pos, speed_kmh)
    drain_rate_per_second = drain_rate_per_tick * 2.0
    battery_used = return_time_seconds * drain_rate_per_second
    return max(0.0, current_battery - battery_used)

def calculate_battery_reserve(agent_pos: tuple, base_pos: tuple, speed_kmh: float, drain_rate_per_tick: float) -> float:
    """
    Minimum battery % needed to safely return to base from current position.
    Adds 5% safety buffer.
    """
    return_time_seconds = predict_return_time(agent_pos, base_pos, speed_kmh)
    drain_rate_per_second = drain_rate_per_tick * 2.0
    required_battery = return_time_seconds * drain_rate_per_second
    return required_battery + 5.0

def should_return(agent: dict, base_pos: tuple) -> bool:
    """
    Returns True if agent should start returning now.
    
    Logic:
    - If battery <= 20%: mandatory return regardless of distance
    - If predicted_battery_at_return < 10%: mandatory return NOW
    - If battery <= 30%: begin return planning
    """
    battery = agent.get("battery", 100.0)
    if battery <= 20.0:
        return True
        
    pos = (agent.get("pos_x", 0.0), agent.get("pos_y", 0.0))
    speed = agent.get("speed_kmh", 30.0)
    drain_rate = agent.get("drain_rate", 0.05) # per tick
    
    predicted = predict_battery_at_return(battery, pos, base_pos, speed, drain_rate)
    if predicted < 10.0:
        return True
        
    if battery <= 30.0:
        return True
        
    return False

def find_swap_candidate(
    low_battery_agent: dict,
    all_agents: list,
    min_donor_battery: float = 70.0,
    max_distance_km: float = 1.5
) -> dict | None:
    """
    Finds the best nearby agent to perform a mid-flight battery swap.
    
    Rules:
    - Donor must have battery >= min_donor_battery (default 70%)
    - Donor must be within max_distance_km of the low battery agent
    - Donor must have status == 'active'
    - Donor must not be currently swapping
    - Returns the closest eligible donor, or None if no candidate found
    """
    import math
    
    low_x = low_battery_agent['pos_x']
    low_y = low_battery_agent['pos_y']
    
    candidates = []
    for agent in all_agents:
        if agent['id'] == low_battery_agent['id']:
            continue
        if agent['status'] != 'active':
            continue
        if agent.get('is_swapping', False):
            continue
        if agent['battery'] < min_donor_battery:
            continue
        
        # Check if donor has enough battery to return safely after giving away 35%
        predicted_after_swap = agent['battery'] - 35.0
        required_to_return = calculate_battery_reserve(
            (agent['pos_x'], agent['pos_y']),
            (0.0, 0.0),
            agent.get('speed_kmh', 30.0),
            agent.get('battery_drain_rate', 0.05)
        )
        if predicted_after_swap < required_to_return:
            continue
        
        dist = math.sqrt(
            (agent['pos_x'] - low_x) ** 2 +
            (agent['pos_y'] - low_y) ** 2
        )
        
        if dist <= max_distance_km:
            candidates.append((dist, agent))
    
    if not candidates:
        return None
    
    # Return closest candidate
    candidates.sort(key=lambda x: x[0])
    return candidates[0][1]


def execute_battery_swap(
    receiver: dict,
    donor: dict,
    transfer_amount: float = 35.0
) -> tuple[dict, dict]:
    """
    Executes the battery transfer.
    Receiver gains transfer_amount %.
    Donor loses transfer_amount %.
    Both agents are paused for 8 simulation ticks during swap.
    Returns updated (receiver, donor) dicts.
    """
    receiver['battery'] = min(100.0, receiver['battery'] + transfer_amount)
    donor['battery'] = max(0.0, donor['battery'] - transfer_amount)
    
    receiver['swap_cooldown'] = 8   # ticks to wait before moving again
    donor['swap_cooldown'] = 8
    receiver['is_swapping'] = True
    donor['is_swapping'] = True
    
    return receiver, donor
