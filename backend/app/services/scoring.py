"""The sustainability score engine.

The score answers a question a raw tonnage cannot: *is this organisation
doing well?* A 500-person company emitting 200 t is doing better than a
50-person company emitting 150 t, so every sub-score is an intensity or a
ratio, never an absolute total.

Method
------
Each sub-score normalises one indicator between a good-practice TARGET
(scores 100) and a poor-practice CEILING (scores 0), clamped to [0, 100]:

    score(x) = 100 * clamp01( (x - ceiling) / (target - ceiling) )

The five sub-scores are then combined with fixed weights. Weights are
stated here, in one place, so the methodology can be defended and tuned
without hunting through the codebase.

    carbon intensity      30%   kg CO2e per employee per month
    renewable electricity 20%   % of kWh from renewable sources
    waste diversion       20%   % of waste kept out of landfill
    resource efficiency   15%   water + paper per employee per month
    low-carbon mobility   15%   % of business/commute km that is low carbon

Bands: >= 67 good, 40-66 warning, < 40 critical.
Grades: A+ >= 85, A >= 75, B+ >= 65, B >= 55, C+ >= 45, C >= 35, else D.
"""

from __future__ import annotations

from dataclasses import dataclass, field


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def normalise(value: float, target: float, ceiling: float) -> float:
    """0-100, where `target` is good practice and `ceiling` is poor practice."""
    if target == ceiling:
        return 0.0
    return 100.0 * clamp01((value - ceiling) / (target - ceiling))


@dataclass(frozen=True)
class Band:
    key: str
    label: str
    unit: str
    target: float     # value that scores 100
    ceiling: float    # value that scores 0
    weight: float


# The published methodology. Change a number here and the whole app follows.
BANDS: dict[str, Band] = {
    "carbon": Band("carbon", "Carbon intensity", "kg CO2e / employee / month",
                   target=40.0, ceiling=300.0, weight=0.30),
    "renewable": Band("renewable", "Renewable electricity", "% of kWh",
                      target=60.0, ceiling=0.0, weight=0.20),
    "diversion": Band("diversion", "Waste diversion", "% diverted from landfill",
                      target=75.0, ceiling=0.0, weight=0.20),
    "resource": Band("resource", "Resource efficiency", "water + paper index",
                     target=100.0, ceiling=0.0, weight=0.15),
    "mobility": Band("mobility", "Low-carbon mobility", "% of km",
                     target=55.0, ceiling=0.0, weight=0.15),
}

# Sub-bands inside "resource efficiency"
WATER_BAND = Band("water", "Water", "kL / employee / month", target=0.9, ceiling=4.0, weight=0.5)
PAPER_BAND = Band("paper", "Paper", "kg / employee / month", target=0.5, ceiling=3.0, weight=0.5)

GRADES = [(85, "A+"), (75, "A"), (65, "B+"), (55, "B"), (45, "C+"), (35, "C")]


def grade_for(score: float) -> str:
    for threshold, letter in GRADES:
        if score >= threshold:
            return letter
    return "D"


def band_for(score: float) -> str:
    return "good" if score >= 67 else "warning" if score >= 40 else "critical"


@dataclass
class ScoreInput:
    """Everything the score needs, already aggregated over the period."""

    net_kg: float = 0.0
    headcount: int = 1
    months: int = 1
    energy_kwh: float = 0.0
    renewable_kwh: float = 0.0
    waste_kg: float = 0.0
    diverted_kg: float = 0.0
    water_kl: float = 0.0
    paper_kg: float = 0.0
    distance_km: float = 0.0
    low_carbon_km: float = 0.0


@dataclass
class SubScoreResult:
    key: str
    label: str
    value: float
    weight: float
    observed: float
    unit: str
    target: float
    ceiling: float
    band: str


@dataclass
class ScoreResult:
    composite: float
    grade: str
    subscores: list[SubScoreResult] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "composite": self.composite,
            "grade": self.grade,
            "subscores": {s.key: s.value for s in self.subscores},
        }


def _pct(numerator: float, denominator: float) -> float:
    return round(100.0 * numerator / denominator, 2) if denominator else 0.0


def compute_score(data: ScoreInput) -> ScoreResult:
    """Pure function: same input, same score. No database, no clock."""
    emp = max(1, data.headcount)
    months = max(1, data.months)

    carbon_intensity = data.net_kg / emp / months
    renewable_share = _pct(data.renewable_kwh, data.energy_kwh)
    diversion_rate = _pct(data.diverted_kg, data.waste_kg)
    low_carbon_share = _pct(data.low_carbon_km, data.distance_km)
    water_pem = data.water_kl / emp / months
    paper_pem = data.paper_kg / emp / months

    water_score = normalise(water_pem, WATER_BAND.target, WATER_BAND.ceiling)
    paper_score = normalise(paper_pem, PAPER_BAND.target, PAPER_BAND.ceiling)
    resource_index = (water_score + paper_score) / 2.0

    observed = {
        "carbon": carbon_intensity,
        "renewable": renewable_share,
        "diversion": diversion_rate,
        "resource": resource_index,
        "mobility": low_carbon_share,
    }

    subscores: list[SubScoreResult] = []
    composite = 0.0
    for key, band in BANDS.items():
        raw = observed[key]
        value = round(normalise(raw, band.target, band.ceiling), 2)
        composite += value * band.weight
        subscores.append(
            SubScoreResult(
                key=key,
                label=band.label,
                value=value,
                weight=band.weight,
                observed=round(raw, 3),
                unit=band.unit,
                target=band.target,
                ceiling=band.ceiling,
                band=band_for(value),
            )
        )

    composite = round(composite, 2)
    return ScoreResult(composite=composite, grade=grade_for(composite), subscores=subscores)
