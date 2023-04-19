"""Tendance climatique, gradient altitudinal et occupation du sol."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy import stats

from .data import LAND_USE_ORDER

HAC_LAGS = 5  # erreurs-types robustes à l'autocorrélation des résidus (Newey-West)


@dataclass(frozen=True)
class Trend:
    """Tendance linéaire d'une série annuelle (pente exprimée par décennie)."""

    start: int
    end: int
    slope_per_decade: float
    ci_low: float
    ci_high: float
    p_value: float
    r2: float
    intercept: float
    slope_per_year: float
    resid_sd: float
    n: int
    _fit: object  # résultats statsmodels (OLS + covariance HAC)

    def predict(self, year: float, alpha: float = 0.05) -> tuple[float, float, float]:
        """Projection pour ``year`` : valeur et bornes de l'intervalle de prédiction à 95 %."""
        frame = self._fit.get_prediction(np.array([[1.0, year]])).summary_frame(alpha=alpha)
        row = frame.iloc[0]
        return float(row["mean"]), float(row["obs_ci_lower"]), float(row["obs_ci_upper"])


def yearly_mean(climate: pd.DataFrame) -> pd.DataFrame:
    """Moyenne annuelle sur les 177 cellules (mêmes cellules chaque année)."""
    return climate.groupby("year", as_index=False)[["t_mean", "t_min", "t_max"]].mean()


def linear_trend(
    yearly: pd.DataFrame, start: int = 1901, end: int = 2000, column: str = "t_mean"
) -> Trend:
    """Régression linéaire ``température ~ année`` sur [start, end], IC à 95 % robustes (HAC)."""
    sub = yearly[(yearly["year"] >= start) & (yearly["year"] <= end)]
    x = sm.add_constant(sub["year"].to_numpy(dtype=float))
    fit = sm.OLS(sub[column].to_numpy(dtype=float), x).fit(
        cov_type="HAC", cov_kwds={"maxlags": HAC_LAGS}
    )
    low, high = fit.conf_int(alpha=0.05)[1]
    return Trend(
        start=start,
        end=end,
        slope_per_decade=float(fit.params[1] * 10),
        ci_low=float(low * 10),
        ci_high=float(high * 10),
        p_value=float(fit.pvalues[1]),
        r2=float(fit.rsquared),
        intercept=float(fit.params[0]),
        slope_per_year=float(fit.params[1]),
        resid_sd=float(np.sqrt(fit.scale)),
        n=len(sub),
        _fit=fit,
    )


def period_mean(yearly: pd.DataFrame, start: int, end: int, column: str = "t_mean") -> float:
    """Moyenne de ``column`` sur les années [start, end]."""
    mask = yearly["year"].between(start, end)
    return float(yearly.loc[mask, column].mean())


def lapse_rate(climate: pd.DataFrame, column: str = "t_mean") -> tuple[float, float]:
    """Gradient thermique altitudinal (°C pour 100 m) et R², entre cellules (moyenne 1901-2009)."""
    cells = climate.groupby("cell_id")[["elevation", column]].mean()
    res = stats.linregress(cells["elevation"], cells[column])
    return float(res.slope * 100), float(res.rvalue**2)


def isotherm_shift(warming: float, lapse_per_100m: float) -> float:
    """Dénivelé (m) qu'il faut gravir pour retrouver la température d'avant le réchauffement."""
    return float(warming / -lapse_per_100m * 100)


def land_use_shares(land_use: pd.DataFrame) -> pd.DataFrame:
    """Part (0-1) de chaque occupation du sol par zone d'altitude et par décennie."""
    counts = land_use.groupby(["zone", "decade", "land_use"]).size().rename("n").reset_index()
    full = pd.MultiIndex.from_product(
        [sorted(land_use["zone"].unique()), sorted(land_use["decade"].unique()), LAND_USE_ORDER],
        names=["zone", "decade", "land_use"],
    )
    counts = counts.set_index(["zone", "decade", "land_use"]).reindex(full, fill_value=0)
    counts["share"] = counts["n"] / counts.groupby(level=["zone", "decade"])["n"].transform("sum")
    return counts.reset_index()


def land_use_change_test(
    land_use: pd.DataFrame, start: int = 1910, end: int = 2010
) -> pd.DataFrame:
    """Test du χ² d'indépendance (occupation × décennie) entre ``start`` et ``end``, par zone.

    Les effectifs sont faibles en zone montagnarde (18 cellules) : la p-valeur y est indicative.
    """
    rows = []
    for zone, sub in land_use[land_use["decade"].isin([start, end])].groupby("zone"):
        table = pd.crosstab(sub["decade"], sub["land_use"])
        table = table.loc[:, table.sum() > 0]
        chi2, p, dof, expected = stats.chi2_contingency(table)
        rows.append(
            {
                "zone": zone,
                "n_cells": int(table.iloc[0].sum()),
                "chi2": float(chi2),
                "dof": int(dof),
                "p_value": float(p),
                "min_expected": float(expected.min()),
            }
        )
    return pd.DataFrame(rows)
