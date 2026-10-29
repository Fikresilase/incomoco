"""Generate a portable Amharic demo; no database or object storage is used.

python -m app.workers.bundle_demo --output-dir /tmp/bundled-amharic-demo
"""
import argparse
import asyncio
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

from app.adapters.openrouter.client import OpenRouterClient
from app.adapters.openrouter.llm import OpenRouterLLM
from app.adapters.openrouter.speech import OpenRouterTTS
from app.core.config import get_settings
from app.schemas.animated_learning import CoursePlan
from app.services.animated_courses import (
    PLAN_PROMPT,
    TIMING_RULES,
    assemble_wavs,
    parse_json,
    validate_animation,
)
from app.services.bestie_prompt import ANIMATOR_PROMPT


async def generate(output: Path):
    settings = get_settings()
    if not settings.openrouter_api_key:
        raise RuntimeError("Real AI credentials are required to generate the bundled demo")
    if (output / "module.json").exists():
        raise RuntimeError("Output already contains a demo; choose a new directory to regenerate")
    client = OpenRouterClient(settings)
    llm = OpenRouterLLM(client, settings.learning_animation_model)
    tts = OpenRouterTTS(client, settings.learning_tts_model, settings.tts_voice, ["am"])
    try:
        source = await asyncio.to_thread(lambda: (Path(__file__).resolve().parents[2] / "demo" / "cash-flow.md").read_text(encoding="utf-8"))
        prompt = """LANGUAGE: Amharic (am). Prepare exactly ONE short demo lesson with exactly THREE scenes.
Use clear, natural Amharic in Ethiopic script for ALL narration, titles, questions, options,
explanations, and on-screen labels. Use birr and a familiar Ethiopian small-shop example.
Scene 1 must end with a multiple_choice checkpoint (3 short options). Scene 2 must end with
a true_false checkpoint. Scene 3 concludes with practical advice and no checkpoint.
Keep each question under 140 characters, each option under 70 characters, explanations under
180 characters. Narrate 2-3 short sentences per scene. skill_key: cash_flow.
source_excerpt must be copied verbatim from the English source, not translated.
"""
        for attempt in range(3):
            try:
                raw = await llm.complete([{"role": "system", "content": PLAN_PROMPT},
                    {"role": "user", "content": prompt + "\nSOURCE:\n" + source}], max_tokens=10000,
                    extra={"response_format": {"type": "json_object"}})
                plan = CoursePlan.model_validate(parse_json(raw))
                assert len(plan.lessons) == 1 and len(plan.lessons[0].scenes) == 3, "Need one lesson with three scenes"
                planned = plan.lessons[0].scenes
                assert planned[0].checkpoint.type == "multiple_choice" and planned[1].checkpoint.type == "true_false" and planned[2].checkpoint is None
                for scene in planned:
                    assert " ".join(scene.source_excerpt.split()) in " ".join(source.split()), "Source excerpt must be verbatim"
                    assert sum("\u1200" <= ch <= "\u137f" for ch in scene.story) > 20, "Narration must be Amharic"
                break
            except (ValueError, AssertionError, AttributeError) as exc:
                prompt += f"\nCorrect your previous output: {exc}"
                if attempt == 2:
                    raise
        lesson = plan.lessons[0]
        scenes, clips = [], []
        print(f"Generating 3 Amharic scenes using {llm.model} and {tts.model}", flush=True)
        for index, scene in enumerate(lesson.scenes):
            repair = ""
            for attempt in range(3):
                try:
                    raw = await llm.complete([
                        {"role": "system", "content": ANIMATOR_PROMPT + TIMING_RULES + "\nAll on-screen labels MUST be Amharic in Ethiopic script. Use font-family: 'Noto Sans Ethiopic', sans-serif. No external fonts or links."},
                        {"role": "user", "content": json.dumps({"visual_bible": plan.visual_bible,
                            "scene": scene.model_dump(exclude={"checkpoint"}), "repair": repair}, ensure_ascii=False)},
                    ], temperature=0.35, max_tokens=16000, extra={"response_format": {"type": "json_object"}})
                    actions = validate_animation(parse_json(raw))
                    break
                except (ValueError, KeyError, TypeError) as exc:
                    repair = f"Correct your output: {exc}"
                    if attempt == 2:
                        raise
            clips.append(await tts.synthesize(scene.story, "am"))
            scenes.append({"scene_id": index + 1, "scene_title": scene.scene_title, "story": scene.story,
                "scene_description": scene.scene_description, "source_excerpt": scene.source_excerpt,
                "aspect_ratio": "16:9", "mode": "learn", "animation": actions})
            print(f"Scene {index + 1}/3 prepared", flush=True)
        audio, ranges = assemble_wavs(clips)
        await asyncio.to_thread(output.mkdir, parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory() as directory:
            wav = Path(directory) / "narration.wav"
            await asyncio.to_thread(wav.write_bytes, audio)
            await asyncio.to_thread(subprocess.run, ["ffmpeg", "-nostdin", "-y", "-hide_banner", "-loglevel", "error",
                "-i", str(wav), "-c:a", "libmp3lame", "-b:a", "96k", "-ar", "24000", str(output / "narration.mp3")],
                check=True, capture_output=True, timeout=60)
        questions = []
        for index, (scene, (start, end)) in enumerate(zip(scenes, ranges, strict=True)):
            scene.update(start_ms=start, end_ms=end, audio={"duration_ms": end - start})
            question = lesson.scenes[index].checkpoint
            if question:
                questions.append({**question.model_dump(), "id": f"q-{index + 1}", "at_ms": end})
        version = "am-" + hashlib.sha256(audio).hexdigest()[:12]
        module = {"schema_version": "inkomoko-animation-v1", "status": "ready", "title": lesson.title,
            "course_title": plan.title, "language": "am", "version": version, "aspect_ratio": "16:9", "mode": "learn",
            "duration_ms": ranges[-1][1], "audio_url": "/learning-demo/amharic/narration.mp3",
            "animation_model": llm.model, "tts_model": tts.model, "visual_bible": plan.visual_bible,
            "scenes": scenes, "checkpoints": questions}
        await asyncio.to_thread((output / "module.json").write_text,
            json.dumps({"id": "bundled-amharic-cash-flow", "module": module}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Bundled demo ready: {round(module['duration_ms'] / 1000)} seconds, version {version}", flush=True)
    finally:
        await client.aclose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    asyncio.run(generate(parser.parse_args().output_dir))
