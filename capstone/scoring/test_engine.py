import unittest
from dataclasses import replace

from engine import PropertyInput, evaluate_property


class ScoringEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.sample = PropertyInput(
            property_id=1,
            name="Almaty Loft #1",
            city="Almaty",
            price_usd=100_000.0,
            gross_yield=0.095,
            vacancy_rate=0.07,
            opex_ratio=0.18,
            manager_fee_ratio=0.05,
            building_age_years=4,
        )

    def test_scenario_ordering_and_bounds(self) -> None:
        rep = evaluate_property(self.sample)
        self.assertLess(rep.net_yield_bear, rep.net_yield_base)
        self.assertLess(rep.net_yield_base, rep.net_yield_bull)
        self.assertTrue(0 <= rep.risk_score <= 100)
        self.assertEqual(rep.risk_score, sum(rep.factors.values()))
        self.assertEqual(len(bytes.fromhex(rep.valuation_hash_hex)), 32)

    def test_hash_is_deterministic_and_sensitive_to_inputs(self) -> None:
        r1 = evaluate_property(self.sample)
        r2 = evaluate_property(self.sample)
        r3 = evaluate_property(replace(self.sample, vacancy_rate=0.08))
        self.assertEqual(r1.valuation_hash_hex, r2.valuation_hash_hex)
        self.assertNotEqual(r1.valuation_hash_hex, r3.valuation_hash_hex)

    def test_worse_fundamentals_increase_risk_and_trigger_warnings(self) -> None:
        good = evaluate_property(self.sample)
        risky = evaluate_property(
            replace(self.sample, vacancy_rate=0.16, opex_ratio=0.28, building_age_years=25, gross_yield=0.07)
        )
        self.assertGreater(risky.risk_score, good.risk_score)
        self.assertEqual(len(good.warnings), 0)
        self.assertGreaterEqual(len(risky.warnings), 2)

    def test_scenario_ordering_holds_at_extreme_inputs(self) -> None:
        for override in (
            {"opex_ratio": 0.93, "manager_fee_ratio": 0.02},  # above the bear opex cap
            {"opex_ratio": 0.01},                             # below the bull opex floor
            {"vacancy_rate": 0.97},                           # above the bear vacancy cap
        ):
            with self.subTest(**override):
                rep = evaluate_property(replace(self.sample, **override))
                self.assertLessEqual(rep.net_yield_bear, rep.net_yield_base)
                self.assertLessEqual(rep.net_yield_base, rep.net_yield_bull)

    def test_invalid_inputs_rejected(self) -> None:
        with self.assertRaises(ValueError):
            evaluate_property(replace(self.sample, price_usd=0))
        with self.assertRaises(ValueError):
            evaluate_property(replace(self.sample, vacancy_rate=1.0))

    def test_gross_yield_bounds_rejected(self) -> None:
        for bad_yield in (0.5, 0.75, 0.0, -0.1):
            with self.subTest(gross_yield=bad_yield), self.assertRaises(ValueError):
                evaluate_property(replace(self.sample, gross_yield=bad_yield))

    def test_boundary_reference_hashes_for_typescript_parity(self) -> None:
        cases = [
            (
                PropertyInput(
                    property_id=101,
                    name="Vacancy Stress",
                    city="Almaty",
                    price_usd=150_000.0,
                    gross_yield=0.095,
                    vacancy_rate=0.16,
                    opex_ratio=0.18,
                    manager_fee_ratio=0.05,
                    building_age_years=6,
                ),
                51,
                "4a740e81bcdd7d13",
            ),
            (
                PropertyInput(
                    property_id=102,
                    name="Old Heritage",
                    city="Almaty",
                    price_usd=90_000.0,
                    gross_yield=0.09,
                    vacancy_rate=0.14,
                    opex_ratio=0.22,
                    manager_fee_ratio=0.05,
                    building_age_years=28,
                ),
                70,
                "da0e80a9c23f5a9c",
            ),
            (
                PropertyInput(
                    property_id=103,
                    name="Extreme Opex",
                    city="Astana",
                    price_usd=100_000.0,
                    gross_yield=0.08,
                    vacancy_rate=0.85,
                    opex_ratio=0.90,
                    manager_fee_ratio=0.09,
                    building_age_years=25,
                ),
                95,
                "57bec881c120efb8",
            ),
            (
                PropertyInput(
                    property_id=104,
                    name="Halfway Tie",
                    city="Shymkent",
                    price_usd=100_000.0,
                    gross_yield=0.125,
                    vacancy_rate=0.25,
                    opex_ratio=0.20,
                    manager_fee_ratio=0.05,
                    platform_rent_fee_bps=0,
                    building_age_years=10,
                ),
                58,
                "310f439d5a800946",
            ),
            (
                PropertyInput(
                    property_id=105,
                    name="Near Half Risk",
                    city="Almaty",
                    price_usd=100_000.0,
                    gross_yield=0.095,
                    vacancy_rate=0.07,
                    opex_ratio=0.16,
                    manager_fee_ratio=0.0816666666666667,
                    building_age_years=4,
                ),
                38,
                "cd7a5f5a9d12b9e8",
            ),
        ]
        for inp, expected_score, expected_prefix in cases:
            with self.subTest(name=inp.name):
                rep = evaluate_property(inp)
                self.assertEqual(rep.risk_score, expected_score)
                self.assertEqual(rep.valuation_hash_hex[:16], expected_prefix)

    def test_non_finite_and_out_of_range_inputs_rejected(self) -> None:
        for override in (
            {"price_usd": float("nan")},
            {"price_usd": float("inf")},
            {"building_age_years": float("nan")},
            {"opex_ratio": -0.1, "manager_fee_ratio": 0.2},
            {"platform_rent_fee_bps": 10_001},
            {"platform_sale_fee_bps": -1},
        ):
            with self.subTest(**override), self.assertRaises(ValueError):
                evaluate_property(replace(self.sample, **override))

    def test_cyrillic_utf8_hash_matches_typescript_engine(self) -> None:
        cyr = PropertyInput(
            property_id=2,
            name="Тест Алматы",
            city="Алматы",
            price_usd=123_456.78,
            gross_yield=0.0731,
            vacancy_rate=0.113,
            opex_ratio=0.271,
            manager_fee_ratio=0.0615,
            building_age_years=27,
        )
        rep = evaluate_property(cyr)
        self.assertEqual(rep.risk_score, 73)
        self.assertEqual(rep.valuation_hash_hex[:16], "46e7f31ddc9d8c3b")


if __name__ == "__main__":
    unittest.main()

