"""MITS AI routing backend.

Takes a free-text description plus optional screenshots and turns them into a
structured ticket payload, using a local Ollama instance.

Three steps, each a separate Ollama call so every one can be constrained on its
own:

1. **Transcribe** (only when images are present) — a vision model reads the
   screenshots and returns the visible text verbatim. This is the OCR stage.
2. **Route** — a text model picks the matching form schema and drafts a short
   reply, constrained to a JSON schema whose ``suggested_category_id`` is an enum
   of the ids the caller offered. The model therefore cannot invent an id.
3. **Extract** — the same text model fills the chosen form, constrained to *that
   form's own JSON Schema*. The schema MITS renders the form from is the schema
   the model has to satisfy.

Ollama's ``format`` parameter does the constraining, so a malformed answer is a
transport error rather than something to parse defensively. MITS validates the
payload again before storing it.
"""

from __future__ import annotations

import base64
import binascii
import json
import logging
import os
import secrets
from typing import Any

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field

LOG = logging.getLogger("mits.triage")

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
TEXT_MODEL = os.environ.get("OLLAMA_TEXT_MODEL", "llama3.1")
VISION_MODEL = os.environ.get("OLLAMA_VISION_MODEL", "llava")
# Vision inference on CPU takes tens of seconds; a short timeout would look like
# a broken backend.
TIMEOUT_SECONDS = float(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "120"))
SERVICE_TOKEN = os.environ.get("MITS_SERVICE_TOKEN", "")
MAX_IMAGES = int(os.environ.get("MITS_MAX_IMAGES", "4"))
# ~8 MB of base64 per image. Larger screenshots are downscaled by the browser.
MAX_IMAGE_CHARS = int(os.environ.get("MITS_MAX_IMAGE_CHARS", str(8 * 1024 * 1024)))

app = FastAPI(
    title="MITS AI Routing",
    version="1.0.0",
    # The service is only reachable inside the compose network; the interactive
    # docs would just be an extra surface.
    docs_url=os.environ.get("MITS_DOCS_URL") or None,
    redoc_url=None,
)


# ── Auth ────────────────────────────────────────────────────────────────────


async def require_service_token(
    x_mits_service_token: str | None = Header(default=None),
) -> None:
    """Only the MITS web app may call this service.

    Fails closed: with no token configured the endpoint refuses every request
    rather than running unauthenticated. The backend publishes no port in the
    compose file either, so this is the second lock, not the only one.
    """
    if not SERVICE_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="MITS_SERVICE_TOKEN is not configured on the backend.",
        )
    if not x_mits_service_token or not secrets.compare_digest(
        x_mits_service_token, SERVICE_TOKEN
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid service token.",
        )


# ── Request and response models ─────────────────────────────────────────────


class FormSchemaOption(BaseModel):
    """One form the router may choose from."""

    id: str
    title: str
    category: str
    description: str | None = None
    #: Plain-language note about when this form applies (MITSFormSchema.aiHint).
    ai_hint: str | None = None
    #: The form's JSON Schema. Used verbatim as the extraction output format.
    json_schema: dict[str, Any] = Field(default_factory=dict)


class TriageRequest(BaseModel):
    prompt: str = ""
    #: Screenshots as base64. Data-URL prefixes are accepted and stripped.
    images: list[str] = Field(default_factory=list)
    schemas: list[FormSchemaOption] = Field(default_factory=list)


class TriageResponse(BaseModel):
    suggested_category_id: str
    confidence: float
    extracted_payload: dict[str, Any]
    auto_reply: str
    #: Text the vision model read out of the screenshots, so the user can see
    #: what the OCR stage actually understood.
    transcribed_text: str | None = None


# ── Ollama plumbing ─────────────────────────────────────────────────────────


async def ollama_chat(
    client: httpx.AsyncClient,
    model: str,
    messages: list[dict[str, Any]],
    response_format: dict[str, Any] | None = None,
) -> str:
    """One non-streaming chat completion. Returns the assistant's raw content."""
    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": False,
        # Deterministic-ish: this is extraction, not creative writing.
        "options": {"temperature": 0.1},
    }
    if response_format is not None:
        body["format"] = response_format

    try:
        response = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=body)
    except httpx.RequestError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Ollama is unreachable at {OLLAMA_BASE_URL}: {error}",
        ) from error

    if response.status_code == 404:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                f"Ollama does not have the model '{model}'. "
                f"Pull it first: ollama pull {model}"
            ),
        )
    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Ollama returned {response.status_code}: {response.text[:400]}",
        )

    payload = response.json()
    content = payload.get("message", {}).get("content", "")
    if not isinstance(content, str):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Ollama returned an unexpected response shape.",
        )
    return content


def parse_json_object(raw: str, stage: str) -> dict[str, Any]:
    """Parse a constrained model answer.

    With ``format`` set, Ollama guarantees valid JSON, so a failure here means the
    model or the server behaved differently than documented — worth surfacing
    rather than silently returning an empty payload.
    """
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as error:
        LOG.warning("stage=%s produced non-JSON output: %s", stage, raw[:400])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"The model returned no valid JSON in the {stage} stage.",
        ) from error

    if not isinstance(parsed, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"The {stage} stage returned {type(parsed).__name__}, expected an object.",
        )
    return parsed


def normalise_image(raw: str) -> str:
    """Strip a data-URL prefix and reject anything that is not valid base64.

    Ollama wants bare base64. Validating here keeps a malformed upload from
    turning into an opaque 500 further down.
    """
    payload = raw.strip()
    if payload.startswith("data:"):
        _, _, payload = payload.partition(",")
    payload = "".join(payload.split())

    if not payload:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty image payload.")
    if len(payload) > MAX_IMAGE_CHARS:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Image exceeds {MAX_IMAGE_CHARS} base64 characters.",
        )
    try:
        base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as error:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Image is not valid base64."
        ) from error
    return payload


# ── Prompts ─────────────────────────────────────────────────────────────────

TRANSCRIBE_SYSTEM = (
    "Du liest Screenshots aus einem IT-Support-Kontext. Gib den sichtbaren Text "
    "wortgetreu wieder, besonders Fehlermeldungen, Fehlercodes, Dialogtitel, "
    "Gerätenamen und Versionsnummern. Beschreibe zusätzlich in einem Satz, was "
    "auf dem Bild zu sehen ist. Erfinde nichts und rate keine unlesbaren Stellen."
)

ROUTE_SYSTEM = (
    "Du bist die Triage eines IT-Ticketsystems. Wähle aus den angebotenen "
    "Formularen das eine, das zur Meldung passt. Wähle die Kategorie 'quick-ticket' "
    "nur, wenn keine andere passt. Setze 'confidence' auf einen Wert zwischen 0 und "
    "1, der deine Sicherheit widerspiegelt — sei bei dünner Faktenlage niedrig. "
    "'auto_reply' ist eine kurze, sachliche Antwort an die meldende Person auf "
    "Deutsch, maximal zwei Sätze, ohne Lösungsversprechen."
)

EXTRACT_SYSTEM = (
    "Du füllst ein IT-Ticketformular aus. Nutze ausschließlich Informationen aus "
    "der Meldung. Lasse ein Feld leer, wenn die Meldung dazu nichts sagt — erfinde "
    "keine Kostenstellen, Namen, Daten oder Mengen. Antworte auf Deutsch."
)


def route_format(options: list[FormSchemaOption]) -> dict[str, Any]:
    """JSON schema for the routing step, with the ids as a closed enum."""
    return {
        "type": "object",
        "properties": {
            "suggested_category_id": {
                "type": "string",
                "enum": [option.id for option in options],
            },
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "auto_reply": {"type": "string"},
        },
        "required": ["suggested_category_id", "confidence", "auto_reply"],
    }


def describe_options(options: list[FormSchemaOption]) -> str:
    lines = []
    for option in options:
        detail = option.ai_hint or option.description or ""
        lines.append(f"- {option.id} — {option.title} [{option.category}]: {detail}")
    return "\n".join(lines)


def extraction_format(option: FormSchemaOption) -> dict[str, Any]:
    """Use the form's own JSON Schema as the output format.

    ``required`` is dropped: the model must be allowed to leave fields empty
    rather than invent values to satisfy a constraint. MITS enforces the real
    required-fields rule when the user submits the pre-filled form.
    """
    schema = dict(option.json_schema) if option.json_schema else {"type": "object"}
    schema.pop("required", None)
    schema.setdefault("type", "object")
    return schema


# ── Endpoints ───────────────────────────────────────────────────────────────


@app.get("/api/v1/health")
async def health() -> dict[str, Any]:
    """Liveness plus a reachability probe for Ollama and the configured models."""
    result: dict[str, Any] = {
        "status": "ok",
        "ollama_base_url": OLLAMA_BASE_URL,
        "text_model": TEXT_MODEL,
        "vision_model": VISION_MODEL,
        "service_token_configured": bool(SERVICE_TOKEN),
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
        response.raise_for_status()
        installed = {
            model.get("name", "") for model in response.json().get("models", [])
        }
        result["ollama_reachable"] = True
        # Ollama reports "llama3.1:latest" for a "llama3.1" pull.
        result["text_model_present"] = any(
            name == TEXT_MODEL or name.startswith(f"{TEXT_MODEL}:")
            for name in installed
        )
        result["vision_model_present"] = any(
            name == VISION_MODEL or name.startswith(f"{VISION_MODEL}:")
            for name in installed
        )
    except (httpx.HTTPError, ValueError) as error:
        result["status"] = "degraded"
        result["ollama_reachable"] = False
        result["error"] = str(error)
    return result


@app.post(
    "/api/v1/triage",
    response_model=TriageResponse,
    dependencies=[Depends(require_service_token)],
)
async def triage(request: TriageRequest) -> TriageResponse:
    if not request.schemas:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "No form schemas were offered to route to."
        )
    if not request.prompt.strip() and not request.images:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Provide a description, an image, or both."
        )
    if len(request.images) > MAX_IMAGES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"At most {MAX_IMAGES} images per request.",
        )

    images = [normalise_image(image) for image in request.images]
    options = {option.id: option for option in request.schemas}

    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        # ── 1. OCR / transcription ──────────────────────────────────────────
        transcribed: str | None = None
        if images:
            transcribed = (
                await ollama_chat(
                    client,
                    VISION_MODEL,
                    [
                        {"role": "system", "content": TRANSCRIBE_SYSTEM},
                        {
                            "role": "user",
                            "content": (
                                "Lies den Text aus diesen Screenshots. "
                                "Kontext der Meldung: "
                                f"{request.prompt.strip() or '(keine Beschreibung)'}"
                            ),
                            "images": images,
                        },
                    ],
                )
            ).strip() or None

        combined = "\n\n".join(
            part
            for part in (
                request.prompt.strip(),
                f"Aus dem Screenshot gelesen:\n{transcribed}" if transcribed else "",
            )
            if part
        )

        # ── 2. Routing ──────────────────────────────────────────────────────
        routed = parse_json_object(
            await ollama_chat(
                client,
                TEXT_MODEL,
                [
                    {"role": "system", "content": ROUTE_SYSTEM},
                    {
                        "role": "user",
                        "content": (
                            f"Meldung:\n{combined}\n\n"
                            f"Verfügbare Formulare:\n{describe_options(request.schemas)}"
                        ),
                    },
                ],
                route_format(request.schemas),
            ),
            "routing",
        )

        schema_id = str(routed.get("suggested_category_id", ""))
        chosen = options.get(schema_id)
        if chosen is None:
            # The enum should make this impossible; if it happens, say so instead
            # of silently substituting a schema the user did not get told about.
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                f"The model chose an unknown form id: {schema_id!r}",
            )

        # ── 3. Extraction ───────────────────────────────────────────────────
        extracted = parse_json_object(
            await ollama_chat(
                client,
                TEXT_MODEL,
                [
                    {"role": "system", "content": EXTRACT_SYSTEM},
                    {
                        "role": "user",
                        "content": (
                            f"Formular: {chosen.title}\n"
                            f"Meldung:\n{combined}"
                        ),
                    },
                ],
                extraction_format(chosen),
            ),
            "extraction",
        )

    confidence = routed.get("confidence", 0.0)
    try:
        confidence = min(1.0, max(0.0, float(confidence)))
    except (TypeError, ValueError):
        confidence = 0.0

    return TriageResponse(
        suggested_category_id=chosen.id,
        confidence=confidence,
        extracted_payload=extracted,
        auto_reply=str(routed.get("auto_reply", "")).strip(),
        transcribed_text=transcribed,
    )
