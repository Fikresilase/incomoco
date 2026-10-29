import io
import wave

import pytest
from pydantic import ValidationError

from app.schemas.animated_learning import QuestionPlan
from app.services.animated_courses import assemble_wavs, validate_animation
from app.services.lesson_checkpoints import allowed_position, first_locked, public_module


@pytest.fixture
def module():
    return {"duration_ms": 30000, "checkpoints": [
        {"id": "q-1", "at_ms": 10000, "answer": 1, "explanation": "Because cash has not arrived"},
        {"id": "q-2", "at_ms": 20000, "answer": 0, "explanation": "True"},
    ]}


def test_unanswered_or_wrong_answers_cannot_unlock_seeking(module):
    assert allowed_position(module, {}, 30000) == 10000
    assert allowed_position(module, {"q-1": {"correct": False}}, 30000) == 10000
    answers = {"q-1": {"correct": True}}
    assert first_locked(module, answers)["id"] == "q-2"
    assert allowed_position(module, answers, 30000) == 20000
    assert allowed_position(module, answers, 4000) == 4000


def test_all_answers_unlock_completion_and_replay(module):
    answers = {"q-1": {"correct": True}, "q-2": {"correct": True}}
    assert first_locked(module, answers) is None
    assert allowed_position(module, answers, 40000) == 30000
    assert allowed_position(module, answers, -1) == 0


def test_public_manifest_does_not_reveal_answers(module):
    safe = public_module(module)
    assert "answer" not in safe["checkpoints"][0]
    assert "explanation" not in safe["checkpoints"][0]
    assert module["checkpoints"][0]["answer"] == 1


@pytest.mark.parametrize("html", ["<h1>Hello</h1>", "<script>window.renderBestieFrame=()=>{};setInterval(()=>{}, 1)</script>",
    "<style>@keyframes spin{}</style><script>window.renderBestieFrame=()=>{}</script>"])
def test_rejects_html_that_cannot_pause_and_seek(html):
    with pytest.raises(ValueError):
        validate_animation({"actions": [{"create": [{"id": [1], "element": "html", "value": html}]}]})


def test_accepts_player_controlled_animation():
    actions = [{"create": [{"id": [1], "element": "html", "value": "<script>window.renderBestieFrame=(p)=>{document.body.style.opacity=p}</script>"}]}]
    assert validate_animation({"actions": actions}) == actions


def test_question_rejects_out_of_bounds_and_invalid_true_false():
    base = {"type": "true_false", "question": "Cash and profit are identical.", "explanation": "Credit sales have not been paid yet."}
    with pytest.raises(ValidationError):
        QuestionPlan(**base, options=["True", "False"], answer=2)
    with pytest.raises(ValidationError):
        QuestionPlan(**base, options=["True", "False", "Maybe"], answer=0)


def wav(seconds):
    out = io.BytesIO()
    with wave.open(out, "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(24000)
        writer.writeframes(b"\0\0" * int(seconds * 24000))
    return out.getvalue()


def test_narration_assembly_has_exact_checkpoint_timestamps():
    audio, ranges = assemble_wavs([wav(1), wav(0.5), wav(2)])
    assert ranges == [(0, 1000), (1000, 1500), (1500, 3500)]
    with wave.open(io.BytesIO(audio)) as reader:
        assert reader.getnframes() == 84000
