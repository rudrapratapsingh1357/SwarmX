import random

TARGET_TYPES = ["survivor", "object", "hazard"]
TARGET_WEIGHTS = [0.30, 0.50, 0.20]

SURVIVOR_DESCRIPTIONS = [
    "Adult human, lying down",
    "Child detected, moving slowly",
    "Adult human, waving",
    "Person trapped under debris",
    "Elderly individual, stationary"
]

OBJECT_DESCRIPTIONS = [
    "Abandoned backpack",
    "Mobile phone detected",
    "Vehicle wreckage",
    "Medical supply kit",
    "Personal ID documents"
]

HAZARD_DESCRIPTIONS = [
    "Fire detected, spreading",
    "Structural collapse risk",
    "Flooding — water rising",
    "Smoke concentration high",
    "Gas leak — area unsafe"
]

BASE_DETECTION_PROBABILITY = 0.0004

ENVIRONMENT_MULTIPLIERS = {
    "urban_rubble": 1.5,
    "forest_wilderness": 1.0,
    "flood_zone": 1.2,
    "open_desert": 0.6,
    "maritime_coastal": 0.8
}

def assign_confidence(target_type: str) -> float:
    """
    Generates a confidence score.
    survivor: 0.65–0.99
    object: 0.55–0.95
    hazard: 0.70–0.99
    """
    if target_type == "survivor":
        return random.uniform(0.65, 0.99)
    elif target_type == "object":
        return random.uniform(0.55, 0.95)
    else:  # hazard
        return random.uniform(0.70, 0.99)

def simulate_detection(agent_id: str, pos_x: float, pos_y: float, environment: str = "urban_rubble", current_target_count: int = 0) -> dict | None:
    if current_target_count >= 12:
        return None
        
    multiplier = ENVIRONMENT_MULTIPLIERS.get(environment, 1.0)
    prob = BASE_DETECTION_PROBABILITY * multiplier
        
    if random.random() > prob:
        return None
        
    target_type = random.choices(TARGET_TYPES, weights=TARGET_WEIGHTS)[0]
    confidence = assign_confidence(target_type)
    
    if target_type == "survivor":
        description = random.choice(SURVIVOR_DESCRIPTIONS)
    elif target_type == "object":
        description = random.choice(OBJECT_DESCRIPTIONS)
    else:  # hazard
        description = random.choice(HAZARD_DESCRIPTIONS)
        
    return {
        "agent_id": agent_id,
        "target_type": target_type,
        "confidence": round(confidence, 2),
        "pos_x": round(pos_x, 3),
        "pos_y": round(pos_y, 3),
        "description": description
    }
