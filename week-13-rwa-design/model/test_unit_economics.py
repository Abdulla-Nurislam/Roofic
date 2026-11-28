import math
import unittest
from dataclasses import replace

from unit_economics import (
    MAX_FEE_BPS,
    PROPERTY_PRESETS,
    SCENARIOS,
    Assumptions,
    PropertyPreset,
    RentAccumulatorPool,
    annual_breakdown,
    break_even_properties,
    distribute,
    hybrid_break_even_properties,
    listing_break_even_properties,
    portfolio_summary,
)


class WaterfallTests(unittest.TestCase):
    def test_every_dollar_of_potential_rent_is_accounted_for(self):
        for override in SCENARIOS.values():
            b = annual_breakdown(replace(Assumptions(), **override))
            parts = (
                b["vacancy_loss"] + b["opex"] + b["manager_fee"] + b["platform_rent_fee"] + b["investor_income"]
            )
            self.assertAlmostEqual(parts, b["potential_rent"], places=6)

    def test_base_case_known_values(self):
        # 100k * 9% = 9000 potential; -8% vacancy = 8280 collected;
        # -20% opex -5% manager = 6210 NOI; -1% platform = 6147.90 to investors
        b = annual_breakdown(Assumptions())
        self.assertAlmostEqual(b["collected_rent"], 8280.0)
        self.assertAlmostEqual(b["net_operating_income"], 6210.0)
        self.assertAlmostEqual(b["platform_rent_fee"], 62.10)
        self.assertAlmostEqual(b["investor_income"], 6147.90)
        self.assertAlmostEqual(b["investor_net_yield"], 0.061479)

    def test_scenarios_are_ordered(self):
        y = {n: annual_breakdown(replace(Assumptions(), **o))["investor_net_yield"] for n, o in SCENARIOS.items()}
        self.assertLess(y["bear"], y["base"])
        self.assertLess(y["base"], y["bull"])

    def test_higher_platform_fee_lowers_investor_income_one_for_one(self):
        lo = annual_breakdown(replace(Assumptions(), platform_rent_fee_bps=100))
        hi = annual_breakdown(replace(Assumptions(), platform_rent_fee_bps=300))
        self.assertAlmostEqual(
            lo["investor_income"] - hi["investor_income"], hi["platform_rent_fee"] - lo["platform_rent_fee"]
        )

    def test_break_even_actually_covers_fixed_costs(self):
        a = Assumptions()
        n = break_even_properties(a)
        fee = annual_breakdown(a)["platform_rent_fee"]
        self.assertGreaterEqual(n * fee, a.platform_fixed_cost_month * 12)
        self.assertLess((n - 1) * fee, a.platform_fixed_cost_month * 12, "n must be the minimum")

    def test_invalid_assumptions_are_rejected(self):
        for bad in (
            dict(vacancy=1.0),
            dict(price=0),
            dict(platform_rent_fee_bps=10_001),
            dict(opex_ratio=0.6, manager_fee=0.4),
        ):
            with self.assertRaises(ValueError, msg=str(bad)):
                annual_breakdown(replace(Assumptions(), **bad))

    def test_zero_platform_fee_has_no_break_even(self):
        with self.assertRaises(ValueError):
            break_even_properties(replace(Assumptions(), platform_rent_fee_bps=0))

    def test_listing_and_hybrid_break_even_properties(self):
        a = Assumptions()
        annual_fixed = a.platform_fixed_cost_month * 12  # 36,000 USD
        b = annual_breakdown(a)
        self.assertAlmostEqual(b["monthly_noi"], 517.50)
        self.assertAlmostEqual(b["year1_platform_revenue"], 1562.10)

        n_list = listing_break_even_properties(a)
        self.assertEqual(n_list, 24)
        self.assertGreaterEqual(n_list * b["platform_sale_fee"], annual_fixed)
        self.assertLess((n_list - 1) * b["platform_sale_fee"], annual_fixed)

        n_hyb = hybrid_break_even_properties(a)
        self.assertEqual(n_hyb, 24)
        self.assertGreaterEqual(n_hyb * b["year1_platform_revenue"], annual_fixed)
        self.assertLess((n_hyb - 1) * b["year1_platform_revenue"], annual_fixed)
        self.assertLessEqual(n_hyb, n_list)
        self.assertLessEqual(n_list, break_even_properties(a))

        with self.assertRaises(ValueError):
            listing_break_even_properties(replace(a, platform_sale_fee_bps=0))
        with self.assertRaises(ValueError):
            hybrid_break_even_properties(replace(a, platform_rent_fee_bps=0, platform_sale_fee_bps=0))

    def test_protocol_fee_cap_and_non_finite_assumptions_rejected(self):
        # Boundary: 2000 bps (20%) is allowed on-chain; 2001 bps must fail
        ok = annual_breakdown(
            replace(Assumptions(), platform_rent_fee_bps=MAX_FEE_BPS, platform_sale_fee_bps=MAX_FEE_BPS)
        )
        self.assertGreater(ok["platform_rent_fee"], 0)

        for bad in (
            dict(platform_rent_fee_bps=MAX_FEE_BPS + 1),
            dict(platform_sale_fee_bps=MAX_FEE_BPS + 1),
            dict(platform_rent_fee_bps=-1),
            dict(platform_sale_fee_bps=-50),
            dict(platform_fixed_cost_month=-1.0),
            dict(price=float("nan")),
            dict(gross_rent_yield=float("inf")),
            dict(platform_fixed_cost_month=float("nan")),
            dict(price=True),
        ):
            with self.assertRaises(ValueError, msg=str(bad)):
                annual_breakdown(replace(Assumptions(), **bad))


class DistributeTests(unittest.TestCase):
    def test_exact_split(self):
        payouts, dust = distribute(1_000_000, {"a": 1, "b": 3})
        self.assertEqual(payouts, {"a": 250_000, "b": 750_000})
        self.assertEqual(dust, 0)

    def test_dust_is_tracked_and_small(self):
        holdings = {"a": 1, "b": 1, "c": 1}
        payouts, dust = distribute(100, holdings)
        self.assertEqual(payouts, {"a": 33, "b": 33, "c": 33})
        self.assertEqual(dust, 1)
        self.assertEqual(sum(payouts.values()) + dust, 100)

    def test_distribute_100_usdc_across_3_and_7_investors(self):
        total = 100_000_000  # 100 USDC (6 decimals)
        for holdings in (
            {"inv1": 1, "inv2": 1, "inv3": 1},
            {f"inv{i}": 1 for i in range(7)},
            {"a": 3, "b": 7, "c": 11, "d": 13, "e": 17, "f": 19, "g": 23},
        ):
            with self.subTest(holders=len(holdings)):
                payouts, dust = distribute(total, holdings)
                self.assertEqual(sum(payouts.values()) + dust, total)
                self.assertTrue(0 <= dust < len(holdings))

    def test_conservation_and_dust_bound_over_many_cases(self):
        # deterministic pseudo-random sweep, no external deps
        x = 12345
        for _ in range(500):
            x = (x * 1103515245 + 12345) % 2**31
            holders = 1 + x % 12
            holdings = {f"h{i}": 1 + (x >> i) % 500 for i in range(holders)}
            total = (x >> 3) % 10**9
            payouts, dust = distribute(total, holdings)
            self.assertEqual(sum(payouts.values()) + dust, total)
            self.assertTrue(0 <= dust < holders)
            self.assertTrue(all(p >= 0 for p in payouts.values()))

    def test_no_holder_is_paid_more_than_their_exact_share(self):
        holdings = {"a": 7, "b": 13, "c": 80}
        payouts, _ = distribute(999_999, holdings)
        for h, s in holdings.items():
            self.assertLessEqual(payouts[h], 999_999 * s / 100)

    def test_bad_inputs(self):
        with self.assertRaises(ValueError):
            distribute(100, {})
        with self.assertRaises(ValueError):
            distribute(-1, {"a": 1})
        with self.assertRaises(ValueError):
            distribute(100, {"a": -1, "b": 2})


class AccumulatorPoolTests(unittest.TestCase):
    def test_late_buyer_gets_zero_from_prior_rent(self):
        pool = RentAccumulatorPool(total_shares=1_000, rent_fee_bps=100)
        pool.buy_shares("early", 100)
        pool.deposit_rent(10_000_000)  # 10 USDC
        pool.buy_shares("late", 100)
        self.assertEqual(pool.pending_rent("late"), 0)
        self.assertEqual(pool.claim_rent("early"), 9_900_000)

    def test_top_up_purchase_preserves_unclaimed_rent(self):
        pool = RentAccumulatorPool(total_shares=1_000, rent_fee_bps=100)
        pool.buy_shares("alice", 10)
        pool.buy_shares("bob", 30)
        pool.deposit_rent(100_000_000)  # net 99_000_000 -> alice 24.75 USDC, bob 74.25 USDC
        before = pool.pending_rent("alice")
        self.assertEqual(before, 24_750_000)

        # Alice buys 20 more shares before claiming; prior accrued rent must survive in `unclaimed`
        pool.buy_shares("alice", 20)
        self.assertEqual(pool.pending_rent("alice"), before)

        pool.deposit_rent(60_000_000)  # net 59_400_000 split 30:30 -> 29_700_000 each
        self.assertEqual(pool.claim_rent("alice"), 24_750_000 + 29_700_000)
        self.assertEqual(pool.claim_rent("bob"), 74_250_000 + 29_700_000)
        self.assertEqual(pool.vault_balance, 0)

    def test_multi_epoch_money_conservation_and_solvency(self):
        pool = RentAccumulatorPool(total_shares=1_000, rent_fee_bps=100)
        pool.buy_shares("i1", 7)
        pool.buy_shares("i2", 13)
        pool.buy_shares("i3", 23)
        gross_total = 0
        for gross in (33_333_333, 77_777_777, 12_345_678):
            gross_total += gross
            pool.deposit_rent(gross)
        pool.buy_shares("i4", 19)
        gross_total += 55_555_555
        pool.deposit_rent(55_555_555)

        claimed = sum(pool.claim_rent(inv) for inv in ("i1", "i2", "i3", "i4"))
        self.assertGreaterEqual(pool.vault_balance, 0)
        self.assertLess(pool.vault_balance, pool.shares_sold)
        self.assertEqual(claimed + pool.treasury_fees + pool.vault_balance, gross_total)

    def test_accumulator_rejects_invalid_operations(self):
        pool = RentAccumulatorPool(total_shares=10, rent_fee_bps=100)
        with self.assertRaises(ValueError):
            pool.deposit_rent(1_000)  # no shareholders yet
        pool.buy_shares("alice", 10)
        with self.assertRaises(ValueError):
            pool.buy_shares("bob", 1)  # oversell
        with self.assertRaises(ValueError):
            pool.claim_rent("alice")  # nothing accrued yet


class PresetCatalogTests(unittest.TestCase):
    def test_flagship_presets_share_capitalization_and_yields(self):
        self.assertEqual(len(PROPERTY_PRESETS), 3)
        expected_yields = [0.0673, 0.0809, 0.0595]
        for preset, expected in zip(PROPERTY_PRESETS, expected_yields):
            preset.validate()
            self.assertEqual(preset.total_shares * preset.price_per_share_usd, preset.assumptions.price)
            b = annual_breakdown(preset.assumptions)
            self.assertAlmostEqual(b["investor_net_yield"], expected, places=4)

    def test_portfolio_summary_matches_preset_waterfalls(self):
        pf = portfolio_summary(PROPERTY_PRESETS)
        self.assertAlmostEqual(pf["total_aum"], 430_000.0)
        self.assertEqual(pf["total_shares"], 4_300.0)
        self.assertAlmostEqual(pf["platform_sale_fee"], 6_450.0)
        self.assertAlmostEqual(pf["platform_rent_fee"], 320.2925)
        self.assertAlmostEqual(pf["year1_platform_revenue"], 6_770.2925)
        self.assertAlmostEqual(pf["investor_income"] + pf["platform_rent_fee"], pf["net_operating_income"])

    def test_invalid_preset_capitalization_rejected(self):
        bad = PropertyPreset(
            property_id=99,
            name="Mismatch",
            city="Almaty",
            total_shares=500,
            price_per_share_usd=100.0,
            assumptions=Assumptions(price=100_000.0),
        )
        with self.assertRaises(ValueError):
            bad.validate()
        with self.assertRaises(ValueError):
            portfolio_summary(())


if __name__ == "__main__":
    unittest.main()

