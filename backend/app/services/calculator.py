"""The carbon calculation engine.

One rule, applied everywhere:

    co2e_kg = quantity x factor_value

A factor may be negative (recycling, on-site renewables), in which case the
entry is a CREDIT and reduces the organisation's net position.

Keeping this in one pure, importable function — rather than inline in a
route handler — is what makes it unit-testable and what stops two parts of
the app disagreeing about the same number.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.models import EmissionFactor, ResourceKind

# Results are rounded to milligram precision. Storing full binary floats
# would make totals differ in the last digit between two equal queries.
PRECISION = 3


@dataclass(frozen=True)
class Priced:
    co2e_kg: float
    factor_value: float
    unit: str
    scope: int
    is_credit: bool


def price_activity(factor: EmissionFactor, quantity: float) -> Priced:
    """Price one activity quantity against one emission factor."""
    if quantity <= 0:
        raise ValueError("quantity must be greater than zero")
    co2e = round(quantity * factor.factor_value, PRECISION)
    return Priced(
        co2e_kg=co2e,
        factor_value=factor.factor_value,
        unit=factor.unit,
        scope=factor.scope,
        is_credit=factor.factor_value < 0,
    )


def resource_amount(factor: EmissionFactor, quantity: float) -> tuple[ResourceKind, float]:
    """Convert an activity quantity into its physical resource amount.

    Paper is the case that needs this: a factor may be priced per sheet or
    per ream, but the score is computed on kilograms of paper, so each
    factor carries resource_per_unit (0.005 kg/sheet, 2.5 kg/ream).
    """
    return factor.resource_kind, round(quantity * (factor.resource_per_unit or 1.0), PRECISION)


def tonnes(kg: float) -> float:
    return round(kg / 1000.0, 4)
