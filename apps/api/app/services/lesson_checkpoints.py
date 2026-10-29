"""One set of checkpoint rules for progress, answers, and completion."""


def first_locked(module: dict, answers: dict) -> dict | None:
    return next((q for q in module["checkpoints"] if not answers.get(q["id"], {}).get("correct")), None)


def allowed_position(module: dict, answers: dict, position_ms: int) -> int:
    locked = first_locked(module, answers)
    ceiling = locked["at_ms"] if locked else module["duration_ms"]
    return max(0, min(position_ms, ceiling))


def public_module(module: dict) -> dict:
    return {**module, "checkpoints": [
        {key: value for key, value in question.items() if key not in {"answer", "explanation"}}
        for question in module["checkpoints"]
    ]}
