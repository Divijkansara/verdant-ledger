"""Unit tests for the carbon calculation engine."""

import pytest

from app.models import EmissionFactor, ResourceKind
from app.services.calculator import price_activity, resource_amount, tonnes


def factor(value: float, unit: str = "kWh", scope: int = 2, per_unit: float = 1.0,
           kind: ResourceKind = ResourceKind.ENERGY_KWH) -> EmissionFactor:
    """A detached ORM object — no database needed to test the maths."""
    return EmissionFactor(
        category=None, activity_code="test", label="Test factor", unit=unit,
        factor_value=value, scope=scope, source="test", resource_kind=kind,
        resource_per_unit=per_unit,
    )


def test_prices_a_charge():
    priced = price_activity(factor(0.716), 1000)
    assert priced.co2e_kg == pytest.approx(716.0)
    assert priced.scope == 2
    assert priced.is_credit is False


def test_prices_a_credit_as_negative():
    priced = price_activity(factor(-0.90, unit="kg", scope=3), 500)
    assert priced.co2e_kg == pytest.approx(-450.0)
    assert priced.is_credit is True


def test_zero_factor_is_valid():
    """A green tariff is genuinely 0 kg/kWh — not an error."""
    assert price_activity(factor(0.0), 2500).co2e_kg == 0.0


def test_rejects_non_positive_quantity():
    with pytest.raises(ValueError):
        price_activity(factor(0.716), 0)
    with pytest.raises(ValueError):
        price_activity(factor(0.716), -10)


def test_rounds_to_three_decimals():
    assert price_activity(factor(0.0046, unit="sheets", scope=3), 7).co2e_kg == 0.032


def test_resource_conversion_handles_reams():
    kind, kg = resource_amount(factor(2.298, unit="reams", per_unit=2.5,
                                      kind=ResourceKind.PAPER_KG), 40)
    assert kind is ResourceKind.PAPER_KG
    assert kg == pytest.approx(100.0)   # 40 reams x 2.5 kg


def test_tonnes_conversion():
    assert tonnes(1500) == 1.5
