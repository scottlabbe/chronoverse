# app/services/micro_directives.py
# Purpose: pick ONE tiny, positive micro-directive per poem to keep output fresh.
# Keep the core prompt stable; inject exactly one directive sentence selected here.
# No external deps; safe to import anywhere.

from __future__ import annotations
import hashlib
import random
from collections import deque
from dataclasses import dataclass
from typing import Callable, Iterable, Optional, Tuple

__all__ = [
    "Directive",
    "pick",
    "BUCKET_ORDER",
    "DIRECTIVES",
]

# ---------------------------
# Data banks (grow over time)
# ---------------------------
# Tip: when this gets large, move to YAML and hydrate here.
PLACES = [
    "beach dune",
    "bus-stop bench",
    "rooftop edge",
    "diner booth",
    "ferry deck",
    "library",
    "alley loading dock",
    "parking lot median",
    "laundromat aisle",
    "under a tree",
    "train platform",
    "underpass",
    "porch steps",
    "fire escape",
    "office break room",
    "waiting room",
    "hospital corridor",
    "airport gate",
    "bodega aisle",
    "bridge",
    "drive-thru lane",
    "vacant lot",
    "motel balcony",
    "bus shelter",
    "subway car",
    "skate-park edge",
    "school bleachers",
    "cemetery path",
    "farmers-market",
    "river levee",
    "diner counter",
    "porch swing",
    "front stoop",
]

COLORS = [
    "indigo",
    "ochre",
    "rust",
    "lilac",
    "cobalt",
    "sage",
    "marigold",
    "teal" "ivory",
    "amber",
    "coral",
    "mint",
    "mauve",
    "navy",
    "slate",
    "rose",
    "burgundy",
    "forest",
    "mustard",
]

MOTION_VERBS = [
    "drift",
    "swerve",
    "scuff",
    "shuffle",
    "jolt",
    "shiver",
    "sidle",
    "veer",
    "tilt",
    "stall",
    "skid",
    "skim",
    "glide",
    "creep",
    "amble",
    "lurch",
    "tremble",
    "quiver",
    "teeter",
    "wobble",
    "pivot",
    "dart",
    "slip",
    "bob",
]

MATERIALS = [
    "tin",
    "denim",
    "plywood",
    "basalt",
    "vinyl",
    "rebar",
    "terracotta",
    "cork",
    "graphite",
]

VOICES = [
    "second person ('you')",
    "first plural ('we')",
    "overheard dialogue",
    "note-to-self",
]

FORMS = [
    "monostich (1 line)",
    "two lines with a colon in L1",
    "three-item list",
    "one-sentence poem (≤120 chars)",
    "one long line (≤180 chars)",
    "two sentences; second begins 'but'",
    "question-only (≤80 chars)",
    "abecedarian fragment (A,B)",
]

LIGHT_WEATHER = [
    "sodium light",
    "neon wash",
    "dawn-blue",
    "rain mist",
    "heat shimmer",
    "fog halo",
    "flickering fluorescent",
    "overcast glare",
    "TV blue",
    "siren flash",
    "snow glow",
    "smoke haze",
]


# ---------------------------------
# Directive template & registrations
# ---------------------------------
@dataclass(frozen=True)
class Directive:
    id: str
    render: Callable[[], str]
    allow_tones: Optional[set[str]] = None  # if provided, only active for these tones


# Helper: choose one item (you can seed RNG externally for test determinism)
def choose(seq):
    return random.choice(seq)


DIRECTIVES: list[Directive] = [
    Directive("place", lambda: f"For this poem only: set it at a {choose(PLACES)}."),
    Directive(
        "color",
        lambda: f"For this poem only: include exactly one color word: {choose(COLORS)}.",
    ),
    Directive(
        "material",
        lambda: f"For this poem only: include the word '{choose(MATERIALS)}' once.",
    ),
    Directive(
        "motionverb",
        lambda: f"For this poem only: use one present-tense motion verb: {choose(MOTION_VERBS)}.",
    ),
    Directive(
        "light",
        lambda: f"For this poem only: mention the light/weather once ({choose(LIGHT_WEATHER)}).",
    ),
    Directive("voice", lambda: f"For this poem only: write in {choose(VOICES)}."),
    Directive(
        "form", lambda: f"For this poem only: form = {choose(FORMS)}.", allow_tones=None
    ),
]

# -------------------------------------------------
# Rotation buckets (minute→bucket; bucket→directive)
# -------------------------------------------------
# You can add more bucket names now and map them later as banks grow.
BUCKET_ORDER = [
    "place",
    "sensory",
    "object",
    "motionverb",
    "light",
    "voice",
    "form",
    "material",
    "color",
    "geography",
    "figurative",
    "lens",
    "microbeat",
    "sound",
    "digit",
]

# Map bucket→available directive IDs. Start minimal; expand anytime.
BUCKET_MAP: dict[str, list[str]] = {
    "place": ["place"],
    "motionverb": ["motionverb"],
    "light": ["light"],
    "voice": ["voice"],
    "form": ["form"],
    "material": ["material"],
    "color": ["color"],
    # other buckets fall back to any directive until populated
}

# -------------------
# Repeat-avoid memory
# -------------------
_recent_ids: deque[str] = deque(maxlen=64)

# -----------------
# Picking utilities
# -----------------


def _hash_choice(seq: Iterable, salt: str) -> object:
    """Deterministically pick an element from a sequence using a salt.
    Useful to keep multi-process instances aligned for the same minute.
    """
    seq_list = list(seq)
    if not seq_list:
        raise ValueError("_hash_choice received an empty sequence")
    h = int(hashlib.sha256(salt.encode("utf-8")).hexdigest(), 16)
    return seq_list[h % len(seq_list)]


def pick(minute_of_day: int, tone: str, salt: Optional[str] = None) -> Tuple[str, str]:
    """
    Select and render a single micro-directive.

    Args:
        minute_of_day: 0..1439 (local minute index)
        tone: current tone label (used for gating; pass through if unused)
        salt: if provided, selection inside the bucket is deterministic per salt

    Returns:
        (directive_text, directive_id)
    """
    # 1) Choose a bucket by minute
    bucket = BUCKET_ORDER[minute_of_day % len(BUCKET_ORDER)]

    # 2) Gather candidates for this bucket and tone
    candidates = [
        d
        for d in DIRECTIVES
        if d.id in BUCKET_MAP.get(bucket, [])
        and (d.allow_tones is None or tone in d.allow_tones)
    ]

    # 3) Fallback if bucket not populated yet
    if not candidates:
        candidates = [
            d
            for d in DIRECTIVES
            if (d.allow_tones is None or tone in (d.allow_tones or set()))
        ]

    # 4) Avoid immediate repeats by id (light touch)
    def _pick_one() -> Directive:
        if salt is None:
            return random.choice(candidates)
        return _hash_choice(candidates, salt)  # type: ignore[return-value]

    tries = 0
    while tries < 5:
        d: Directive = _pick_one()
        if d.id not in _recent_ids:
            _recent_ids.append(d.id)
            return (d.render(), d.id)
        tries += 1

    # 5) If all were recent, accept one anyway
    d = random.choice(candidates)
    _recent_ids.append(d.id)
    return (d.render(), d.id)


# -----------------------
# Testing/maintenance aids
# -----------------------


def _reset_recent() -> None:
    """Clear recent-memory (useful for tests)."""
    _recent_ids.clear()
