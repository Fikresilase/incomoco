from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.api.v1.voice import SpeakTextIn
from app.services.dashboard import select_lesson_pair


def lesson(skill, *, language="am", approved="approved", active=True):
    return SimpleNamespace(
        id=uuid4(),
        skill_id=skill,
        language=language,
        approval_status=approved,
        is_active=active,
        created_at=datetime.now(UTC),
    )


def progress(resource, status):
    return SimpleNamespace(resource_id=resource.id, status=status, last_activity_at=datetime.now(UTC))


def test_lesson_selection_prioritizes_started_gap_and_excludes_completed():
    cash, pricing, draft, inactive = (uuid4() for _ in range(4))
    cash_lesson = lesson(cash)
    pricing_lesson = lesson(pricing)
    completed = lesson(cash)
    draft_lesson = lesson(pricing, approved="draft")
    inactive_lesson = lesson(pricing, active=False)
    current, next_lesson = select_lesson_pair(
        [cash_lesson, pricing_lesson, completed, draft_lesson, inactive_lesson],
        {cash_lesson.id: progress(cash_lesson, "started"), completed.id: progress(completed, "completed")},
        {cash},
    )
    assert current is cash_lesson
    assert next_lesson is pricing_lesson
    assert next_lesson is not current


def test_lesson_selection_prioritizes_active_goal_and_language_filtered_input():
    pricing = uuid4()
    am = lesson(pricing, language="am")
    en = lesson(pricing, language="en")
    current, next_lesson = select_lesson_pair([am], {}, {pricing})
    assert current is am
    assert next_lesson is None
    assert en not in (current, next_lesson)


@pytest.mark.parametrize("language", ["am", "en"])
def test_dashboard_tts_accepts_configured_languages(language):
    request = SpeakTextIn(text="Short approved text", language=language)
    assert request.language == language
    assert request.context == "dashboard"


@pytest.mark.parametrize(
    "payload",
    [
        {"text": "", "language": "am"},
        {"text": "x", "language": "xx"},
        {"text": "x" * 801, "language": "am"},
    ],
)
def test_dashboard_tts_rejects_invalid_requests(payload):
    with pytest.raises(ValidationError):
        SpeakTextIn(**payload)
