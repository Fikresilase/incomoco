"""Turn router: answer small talk directly, or search the documents (live talk and text chat).

Voice: for searches it also writes a short spoken acknowledgement, from instructions (no stock
phrases), so it fits what the user just said, like a person would before looking something up.
Text: only small talk gets a reply; searches go straight to the grounded answer.
"""

import json
import logging
import re
from dataclasses import dataclass
from typing import Literal

from app.domain.models import ChatTurn, Lang
from app.domain.ports import LLMPort
from app.rag.hyde import format_history

logger = logging.getLogger(__name__)

Mode = Literal["voice", "text"]

_LANGUAGE = {"am": "Amharic (in Ge'ez script)", "en": "English"}

_ROLE = {
    "voice": "You are the voice of the Inkomoko Assistant in a live, spoken conversation.",
    "text": "You are the Inkomoko Assistant in a text chat.",
}

_ROUTING = """Inkomoko supports entrepreneurs and small businesses with business training, consulting, and access to finance.

Decide how to handle the user's latest message.

Routing:
- "direct": ONLY when the message is purely social or about you as an assistant: greetings, thanks, goodbyes, how-are-you, small talk, or how to use this assistant. Nothing in it may need facts about Inkomoko or the world.
- "search": anything that needs information: Inkomoko's services, programs, loans, training, eligibility, fees, locations, contacts, processes, numbers, or any other factual question. If the message mixes small talk with a request for information, choose "search". When unsure, choose "search"."""

_SAY = {
    "voice": """What to say out loud right now ("say"):
- Speak in {language}, the way a warm, attentive human assistant talks on a call. Plain spoken words: no lists, no Markdown, no emoji.
- For "direct": give your complete reply in 1-2 short sentences (about 25 words at most).
- For "search": say ONE short, natural sentence (at most about 10 words) that shows you understood what they are asking about and that you are looking into it now. If they also said something social, acknowledge that part in a few words first. Do NOT give any facts, numbers, or the answer itself, and do not promise what you will find. Phrase it freshly to fit this specific message and conversation instead of using a fixed formula.
- Keep it brief: every extra word adds speaking delay. Do not greet again if the conversation is already under way.""",
    "text": """Reply ("say"):
- For "direct": write your complete reply for a chat window in {language}: 1-3 short, warm, natural sentences. Plain text, no lists. Where it fits, invite them to ask about Inkomoko's services. Do not greet again if the conversation is already under way.
- For "search": leave "say" empty; the answer will be written from the documents.""",
}

_FORMAT = 'Return only JSON: {{"route": "direct" or "search", "say": "..."}}'


def _system_prompt(mode: Mode, lang: Lang) -> str:
    parts = [_ROLE[mode] + " " + _ROUTING, _SAY[mode], _FORMAT]
    return "\n\n".join(parts).format(language=_LANGUAGE[lang])


@dataclass(slots=True)
class RouteDecision:
    route: Literal["direct", "search"]
    say: str


def _parse(raw: str) -> RouteDecision | None:
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    route = data.get("route")
    say = " ".join(str(data.get("say") or "").split())
    if route not in ("direct", "search"):
        return None
    if route == "direct" and not say:
        return None  # a direct route must come with a reply
    return RouteDecision(route=route, say=say)


class TurnRouter:
    def __init__(self, llm: LLMPort):
        self._llm = llm

    async def decide(
        self, message: str, history: list[ChatTurn], lang: Lang, mode: Mode = "voice"
    ) -> RouteDecision:
        prompt = message
        if history:
            prompt = f"Conversation so far:\n{format_history(history)}\n\nLatest message: {message}"
        try:
            raw = await self._llm.complete(
                [
                    {"role": "system", "content": _system_prompt(mode, lang)},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.5,  # some variety in phrasing, stable routing
                max_tokens=200,
                extra={"response_format": {"type": "json_object"}},
            )
        except Exception:
            logger.exception("Turn routing failed; defaulting to search")
            return RouteDecision(route="search", say="")
        decision = _parse(raw)
        if decision is None:
            logger.warning("Unparseable routing output; defaulting to search")
            return RouteDecision(route="search", say="")
        return decision
