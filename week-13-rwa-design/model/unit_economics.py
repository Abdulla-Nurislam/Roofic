"""Roofic unit-economics model (Week 13).

Pure standard library. Every default below is an ILLUSTRATIVE ASSUMPTION chosen to make
the model runnable. They are not market data and must be replaced with real numbers
(local rents, taxes, vacancy) before any claim is made to investors.

Two things are modelled:
  1. annual_breakdown()  - where one year of rent goes, and what an investor earns.
  2. distribute()        - pro-rata payout in integer token units, the way the on-chain
                           program has to do it (no floats, rounding dust accounted for).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field, replace

BPS = 10_000
MAX_FEE_BPS = 2_000  # 20% hard ceiling enforced on-chain in PlatformConfig
ACC_SCALE = 1_000_000_000_000  # 1e12 fixed-point precision matching Property.acc_rent_per_share


@dataclass(frozen=True)
class Assumptions:
    price: float = 100_000.0          # USD, purchase price of the property
    gross_rent_yield: float = 0.09    # potential annual rent / price
    vacancy: float = 0.08             # share of potential rent that is not collected
    opex_ratio: float = 0.20          # of collected rent: property tax, repairs, insurance
    manager_fee: float = 0.05         # of collected rent, paid to the property manager
    platform_rent_fee_bps: int = 100  # of net operating income, taken when rent is distributed
    platform_sale_fee_bps: int = 150  # of primary-sale proceeds, charged to the property owner
    platform_fixed_cost_month: float = 3_000.0  # USD: infra, KYC provider, legal retainer

    def validate(self) -> None:
        for name in (
            "price",
            "gross_rent_yield",
            "vacancy",
            "opex_ratio",
            "manager_fee",
            "platform_rent_fee_bps",
            "platform_sale_fee_bps",
            "platform_fixed_cost_month",
        ):
            v = getattr(self, name)
            if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
                raise ValueError(f"{name} must be a finite number, got {v!r}")
        for name in ("gross_rent_yield", "vacancy", "opex_ratio", "manager_fee"):
            v = getattr(self, name)
            if not 0 <= v < 1:
                raise ValueError(f"{name} must be in [0, 1), got {v}")
        if self.price <= 0:
            raise ValueError("price must be positive")
        if self.platform_fixed_cost_month < 0:
            raise ValueError("platform_fixed_cost_month must be non-negative")
        for name in ("platform_rent_fee_bps", "platform_sale_fee_bps"):
            v = getattr(self, name)
            if not isinstance(v, int) or not 0 <= v <= MAX_FEE_BPS:
                raise ValueError(f"{name} must be an integer in [0, {MAX_FEE_BPS}], got {v}")
        if self.opex_ratio + self.manager_fee >= 1:
            raise ValueError("opex_ratio + manager_fee must be below 100% of collected rent")


def annual_breakdown(a: Assumptions) -> dict[str, float]:
    """Waterfall of one year of rent for one property. All values in USD."""
    a.validate()
    potential = a.price * a.gross_rent_yield
    vacancy_loss = potential * a.vacancy
    collected = potential - vacancy_loss
    opex = collected * a.opex_ratio
    manager = collected * a.manager_fee
    net_operating = collected - opex - manager
    platform_fee = net_operating * a.platform_rent_fee_bps / BPS
    investor_income = net_operating - platform_fee
    return {
        "potential_rent": potential,
        "vacancy_loss": vacancy_loss,
        "collected_rent": collected,
        "opex": opex,
        "manager_fee": manager,
        "net_operating_income": net_operating,
        "platform_rent_fee": platform_fee,
        "investor_income": investor_income,
        "investor_net_yield": investor_income / a.price,
        "monthly_noi": net_operating / 12.0,
        "platform_sale_fee": a.price * a.platform_sale_fee_bps / BPS,
        "year1_platform_revenue": platform_fee + (a.price * a.platform_sale_fee_bps / BPS),
    }


def break_even_properties(a: Assumptions) -> int:
    """Properties needed for recurring platform fee income to cover fixed costs (steady state)."""
    fee = annual_breakdown(a)["platform_rent_fee"]
    if fee <= 0:
        raise ValueError("platform earns no recurring fee under these assumptions")
    return math.ceil(a.platform_fixed_cost_month * 12 / fee)


def listing_break_even_properties(a: Assumptions) -> int:
    """New listings per year needed for primary sale fees alone to cover annual fixed costs."""
    sale_fee = annual_breakdown(a)["platform_sale_fee"]
    if sale_fee <= 0:
        raise ValueError("platform earns no primary sale fee under these assumptions")
    return math.ceil(a.platform_fixed_cost_month * 12 / sale_fee)


def hybrid_break_even_properties(a: Assumptions) -> int:
    """Properties needed in year 1 when both primary sale fee and annual rent fee apply."""
    b = annual_breakdown(a)
    year1_fee = b["platform_sale_fee"] + b["platform_rent_fee"]
    if year1_fee <= 0:
        raise ValueError("platform earns neither sale nor rent fee under these assumptions")
    return math.ceil(a.platform_fixed_cost_month * 12 / year1_fee)


def distribute(total_units: int, holdings: dict[str, int]) -> tuple[dict[str, int], int]:
    """Split `total_units` (e.g. USDC base units, 6 decimals) pro-rata by share count.

    Floor division per holder; the remainder ("dust") is returned separately so that
    sum(payouts) + dust == total_units always holds. Dust is always < number of holders.
    """
    if total_units < 0:
        raise ValueError("total_units must be non-negative")
    total_shares = sum(holdings.values())
    if total_shares <= 0:
        raise ValueError("no shares outstanding")
    if any(s < 0 for s in holdings.values()):
        raise ValueError("negative holding")
    payouts = {h: total_units * s // total_shares for h, s in holdings.items()}
    return payouts, total_units - sum(payouts.values())


@dataclass
class InvestorPosition:
    shares: int = 0
    reward_debt: int = 0
    unclaimed: int = 0
    total_claimed: int = 0


@dataclass
class RentAccumulatorPool:
    """Exact integer reference model of Roofic's O(1) on-chain rent accumulator."""

    total_shares: int
    rent_fee_bps: int = 100
    shares_sold: int = 0
    acc_rent_per_share: int = 0
    vault_balance: int = 0
    treasury_fees: int = 0
    positions: dict[str, InvestorPosition] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.total_shares <= 0:
            raise ValueError("total_shares must be positive")
        if not 0 <= self.rent_fee_bps <= MAX_FEE_BPS:
            raise ValueError(f"rent_fee_bps must be in [0, {MAX_FEE_BPS}]")

    def _owed(self, pos: InvestorPosition) -> int:
        accrued = (pos.shares * self.acc_rent_per_share) // ACC_SCALE
        return accrued - pos.reward_debt

    def buy_shares(self, investor: str, shares: int) -> None:
        if shares <= 0:
            raise ValueError("shares must be positive")
        if self.shares_sold + shares > self.total_shares:
            raise ValueError("not enough shares left")
        pos = self.positions.setdefault(investor, InvestorPosition())
        if pos.shares > 0:
            pos.unclaimed += self._owed(pos)
        pos.shares += shares
        self.shares_sold += shares
        pos.reward_debt = (pos.shares * self.acc_rent_per_share) // ACC_SCALE

    def deposit_rent(self, gross_units: int) -> tuple[int, int]:
        if gross_units <= 0:
            raise ValueError("gross_units must be positive")
        if self.shares_sold == 0:
            raise ValueError("no shareholders")
        fee = (gross_units * self.rent_fee_bps) // BPS
        net = gross_units - fee
        self.treasury_fees += fee
        self.vault_balance += net
        self.acc_rent_per_share += (net * ACC_SCALE) // self.shares_sold
        return fee, net

    def pending_rent(self, investor: str) -> int:
        pos = self.positions.get(investor)
        if pos is None:
            return 0
        return pos.unclaimed + self._owed(pos)

    def claim_rent(self, investor: str) -> int:
        pos = self.positions.get(investor)
        if pos is None:
            raise ValueError("unknown investor")
        total = pos.unclaimed + self._owed(pos)
        if total <= 0:
            raise ValueError("nothing to claim")
        pos.unclaimed = 0
        pos.reward_debt = (pos.shares * self.acc_rent_per_share) // ACC_SCALE
        pos.total_claimed += total
        self.vault_balance -= total
        return total


@dataclass(frozen=True)
class PropertyPreset:
    property_id: int
    name: str
    city: str
    total_shares: int
    price_per_share_usd: float
    assumptions: Assumptions

    def validate(self) -> None:
        if self.total_shares <= 0 or self.price_per_share_usd <= 0:
            raise ValueError("total_shares and price_per_share_usd must be positive")
        if not math.isclose(self.total_shares * self.price_per_share_usd, self.assumptions.price, rel_tol=1e-9):
            raise ValueError("total_shares * price_per_share_usd must equal assumptions.price")
        self.assumptions.validate()


PROPERTY_PRESETS: tuple[PropertyPreset, ...] = (
    PropertyPreset(
        property_id=1,
        name="Almaty Loft #1",
        city="Almaty",
        total_shares=1_000,
        price_per_share_usd=100.0,
        assumptions=Assumptions(
            price=100_000.0,
            gross_rent_yield=0.095,
            vacancy=0.07,
            opex_ratio=0.18,
            manager_fee=0.05,
        ),
    ),
    PropertyPreset(
        property_id=2,
        name="Astana Business Center",
        city="Astana",
        total_shares=2_500,
        price_per_share_usd=100.0,
        assumptions=Assumptions(
            price=250_000.0,
            gross_rent_yield=0.11,
            vacancy=0.06,
            opex_ratio=0.16,
            manager_fee=0.05,
        ),
    ),
    PropertyPreset(
        property_id=3,
        name="Shymkent Family House",
        city="Shymkent",
        total_shares=800,
        price_per_share_usd=100.0,
        assumptions=Assumptions(
            price=80_000.0,
            gross_rent_yield=0.088,
            vacancy=0.09,
            opex_ratio=0.20,
            manager_fee=0.05,
        ),
    ),
)


def portfolio_summary(presets: tuple[PropertyPreset, ...] = PROPERTY_PRESETS) -> dict[str, float]:
    """Aggregates waterfall metrics across a catalog of RWA property presets."""
    if not presets:
        raise ValueError("presets must not be empty")
    total_aum = 0.0
    total_shares = 0
    potential_rent = 0.0
    noi = 0.0
    rent_fee = 0.0
    sale_fee = 0.0
    investor_income = 0.0
    for preset in presets:
        preset.validate()
        b = annual_breakdown(preset.assumptions)
        total_aum += preset.assumptions.price
        total_shares += preset.total_shares
        potential_rent += b["potential_rent"]
        noi += b["net_operating_income"]
        rent_fee += b["platform_rent_fee"]
        sale_fee += b["platform_sale_fee"]
        investor_income += b["investor_income"]
    return {
        "total_aum": total_aum,
        "total_shares": float(total_shares),
        "potential_rent": potential_rent,
        "net_operating_income": noi,
        "platform_rent_fee": rent_fee,
        "platform_sale_fee": sale_fee,
        "year1_platform_revenue": sale_fee + rent_fee,
        "investor_income": investor_income,
        "blended_gross_yield": potential_rent / total_aum,
        "blended_net_yield": investor_income / total_aum,
    }


SCENARIOS = {
    "bear": dict(gross_rent_yield=0.07, vacancy=0.15, opex_ratio=0.25),
    "base": dict(),
    "bull": dict(gross_rent_yield=0.11, vacancy=0.04, opex_ratio=0.15),
}


def main() -> None:
    base = Assumptions()
    print("ILLUSTRATIVE ASSUMPTIONS - replace with real local data before using these numbers\n")
    print(f"{'scenario':<8} {'NOI/yr':>10} {'platform fee':>13} {'investor/yr':>12} {'net yield':>10} {'break-even':>11}")
    for name, override in SCENARIOS.items():
        a = replace(base, **override)
        b = annual_breakdown(a)
        print(
            f"{name:<8} {b['net_operating_income']:>10,.0f} {b['platform_rent_fee']:>13,.0f} "
            f"{b['investor_income']:>12,.0f} {b['investor_net_yield']:>9.2%} {break_even_properties(a):>10d}p"
        )
    b = annual_breakdown(base)
    print(f"\nBase case waterfall per ${base.price:,.0f} property, one year:")
    for k in ("potential_rent", "vacancy_loss", "opex", "manager_fee", "platform_rent_fee", "investor_income"):
        print(f"  {k:<18}{b[k]:>10,.0f}")
    print(f"  one-off sale fee  {b['platform_sale_fee']:>10,.0f}  (paid by the property owner at listing)")
    print(
        f"  break-even: {break_even_properties(base)}p (rent fee only) | "
        f"{listing_break_even_properties(base)}p/yr (sale fee only) | "
        f"{hybrid_break_even_properties(base)}p (year-1 hybrid)"
    )
    pf = portfolio_summary()
    print(
        f"\nFlagship catalog ({len(PROPERTY_PRESETS)} properties, ${pf['total_aum']:,.0f} AUM, "
        f"{int(pf['total_shares']):,d} shares): blended net yield {pf['blended_net_yield']:.2%}, "
        f"year-1 platform revenue ${pf['year1_platform_revenue']:,.2f}"
    )


if __name__ == "__main__":
    main()

