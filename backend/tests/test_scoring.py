"""Unit tests for the score engine.

The engine is a pure function, so it can be tested exhaustively without a
database, a server or a network — which is the reason it was written as a
pure function in the first place.
"""

import pytest

from app.services.scoring import (
    BANDS,
    ScoreInput,
    compute_score,
    grade_for,
    normalise,
)


def test_normalise_hits_the_endpoints():
    assert normalise(40, target=40, ceiling=300) == pytest.approx(100)
    assert normalise(300, target=40, ceiling=300) == pytest.approx(0)
    assert normalise(170, target=40, ceiling=300) == pytest.approx(50)


def test_normalise_clamps_outside_the_band():
    # Better than good practice still scores 100, not 140.
    assert normalise(10, target=40, ceiling=300) == 100
    # Worse than the ceiling floors at 0, never negative.
    assert normalise(900, target=40, ceiling=300) == 0


def test_weights_sum_to_one():
    """If this fails the composite is no longer out of 100."""
    assert sum(b.weight for b in BANDS.values()) == pytest.approx(1.0)


def test_perfect_organisation_scores_a_plus():
    result = compute_score(
        ScoreInput(
            net_kg=100, headcount=100, months=1,        # 1 kg/emp/month
            energy_kwh=1000, renewable_kwh=1000,        # 100% renewable
            waste_kg=1000, diverted_kg=1000,            # 100% diverted
            water_kl=50, paper_kg=20,                   # well inside the bands
            distance_km=1000, low_carbon_km=1000,       # 100% low carbon
        )
    )
    assert result.composite == pytest.approx(100.0)
    assert result.grade == "A+"


def test_worst_case_scores_zero_and_grades_d():
    result = compute_score(
        ScoreInput(
            net_kg=1_000_000, headcount=1, months=1,
            energy_kwh=1000, renewable_kwh=0,
            waste_kg=1000, diverted_kg=0,
            water_kl=10_000, paper_kg=10_000,
            distance_km=1000, low_carbon_km=0,
        )
    )
    assert result.composite == pytest.approx(0.0)
    assert result.grade == "D"


def test_empty_ledger_does_not_divide_by_zero():
    """A brand-new organisation has no data at all — this must not crash."""
    result = compute_score(ScoreInput(headcount=50, months=6))
    assert 0 <= result.composite <= 100
    # No emissions at all is genuinely perfect carbon intensity.
    carbon = next(s for s in result.subscores if s.key == "carbon")
    assert carbon.value == 100


def test_headcount_changes_intensity_not_totals():
    small = compute_score(ScoreInput(net_kg=120_000, headcount=100, months=1))
    large = compute_score(ScoreInput(net_kg=120_000, headcount=1000, months=1))
    small_carbon = next(s for s in small.subscores if s.key == "carbon").value
    large_carbon = next(s for s in large.subscores if s.key == "carbon").value
    assert large_carbon > small_carbon


@pytest.mark.parametrize(
    "score,expected",
    [(100, "A+"), (85, "A+"), (84.9, "A"), (75, "A"), (65, "B+"),
     (55, "B"), (45, "C+"), (35, "C"), (34.9, "D"), (0, "D")],
)
def test_grade_boundaries(score, expected):
    assert grade_for(score) == expected


def test_subscores_are_complete_and_banded():
    result = compute_score(ScoreInput(net_kg=50_000, headcount=120, months=6,
                                      energy_kwh=100_000, renewable_kwh=20_000))
    assert {s.key for s in result.subscores} == set(BANDS)
    for s in result.subscores:
        assert s.band in {"good", "warning", "critical"}
        assert 0 <= s.value <= 100
