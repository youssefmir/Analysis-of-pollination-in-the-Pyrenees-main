import numpy as np
import pandas as pd
import pytest

from bumblebees import climate, community, data, shifts


def test_rarefaction_bounds_and_endpoint():
    abundances = [10, 5, 3, 1, 1]
    curve = community.rarefaction(abundances)
    assert curve["expected"].iloc[0] == pytest.approx(1.0)
    assert curve["expected"].iloc[-1] == pytest.approx(5.0)  # tout l'échantillon : S observé
    assert curve["sd"].iloc[-1] == pytest.approx(0.0, abs=1e-9)
    assert curve["expected"].is_monotonic_increasing


def test_rarefaction_matches_brute_force():
    rng = np.random.default_rng(0)
    pool = np.repeat(np.arange(4), [6, 3, 2, 1])
    draws = [len(set(rng.choice(pool, 5, replace=False))) for _ in range(20000)]
    expected = community.rarefaction([6, 3, 2, 1], [5])["expected"].iloc[0]
    assert np.mean(draws) == pytest.approx(expected, abs=0.02)


def test_linear_trend_recovers_known_slope():
    years = np.arange(1901, 2001)
    yearly = pd.DataFrame({"year": years, "t_mean": 3 + 0.02 * (years - 1901)})
    trend = climate.linear_trend(yearly, 1901, 2000)
    assert trend.slope_per_decade == pytest.approx(0.2)


def test_isotherm_shift():
    assert climate.isotherm_shift(2.0, -0.5) == pytest.approx(400.0)


def test_land_use_shares_sum_to_one():
    shares = climate.land_use_shares(data.load_land_use())
    totals = shares.groupby(["zone", "decade"])["share"].sum()
    assert np.allclose(totals, 1.0)


def test_jaccard():
    assert shifts.jaccard({"a", "b"}, {"b", "c"}) == pytest.approx(1 / 3)


def test_resampled_shifts_are_deterministic_and_balanced():
    bees = data.load_bumblebees()
    first = shifts.resampled_shifts(bees, n_resamples=50)
    second = shifts.resampled_shifts(bees, n_resamples=50)
    pd.testing.assert_frame_equal(first, second)
    assert len(first) == 12


def test_resampling_removes_pure_effort_artefact():
    # Même distribution d'altitude dans chaque tranche, mais effort très différent entre périodes :
    # le déplacement corrigé doit être nul.
    rows = []
    for band, elevation in (("1000-1200", 1100), ("1400-1600", 1500)):
        for period, n in (
            ("1889", 5 if band == "1000-1200" else 1),
            ("2005-06", 1 if band == "1000-1200" else 5),
        ):
            rows += [
                {"species": "Bombus x", "period": period, "band": band, "elevation": elevation}
            ] * n
    toy = pd.DataFrame(rows)
    raw = toy.groupby("period")["elevation"].mean()
    assert raw["2005-06"] - raw["1889"] > 0  # artefact d'effort sur les moyennes brutes
    corrected = shifts.resampled_shifts(toy, n_resamples=20)
    assert corrected["shift"].iloc[0] == pytest.approx(0.0)


def test_temperature_profiles_shift_isotherms_upward():
    climate_table = data.load_climate()
    a_old, b_old = climate.temperature_profile(climate_table, 1901, 1910)
    a_new, b_new = climate.temperature_profile(climate_table, 2000, 2009)
    assert b_old < 0 and b_new < 0  # il fait plus froid en montant
    # la même température (4 °C) se trouve plus haut en 2000-2009 qu'en 1901-1910
    assert (4 - a_new) / b_new - (4 - a_old) / b_old > 400
