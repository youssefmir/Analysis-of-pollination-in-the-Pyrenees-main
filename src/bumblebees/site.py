"""Export des résultats pour le site interactif (``docs/data.js``)."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from . import climate as clim
from . import community, shifts
from .data import (
    LAND_USE_ORDER,
    PERIOD_1889,
    PERIOD_2005,
    PERIODS,
    PROJECT_ROOT,
    ZONE_LABELS,
    load_bumblebees,
    load_climate,
    load_land_use,
    short_name,
)

SITE_DATA_PATH = PROJECT_ROOT / "docs" / "data.js"


def _round(values, digits: int) -> list:
    """Liste JSON arrondie (NaN → None)."""
    arr = np.asarray(values, dtype=float)
    return [None if np.isnan(v) else round(float(v), digits) for v in arr]


def _climate_block(climate: pd.DataFrame) -> dict:
    yearly = clim.yearly_mean(climate)
    trend = clim.linear_trend(yearly, 1901, 2009)
    trend_20 = clim.linear_trend(yearly, 1901, 2000)
    value, low, high = trend.predict(2050)
    warming = clim.period_mean(yearly, 2000, 2009) - clim.period_mean(yearly, 1901, 1910)
    lapse, lapse_r2 = clim.lapse_rate(climate)
    return {
        "years": yearly["year"].astype(int).tolist(),
        "t": _round(yearly["t_mean"], 3),
        "baseline": round(clim.period_mean(yearly, 1901, 1930), 3),
        "trend": {
            "start": trend.start,
            "end": trend.end,
            "slope_decade": round(trend.slope_per_decade, 3),
            "ci": [round(trend.ci_low, 3), round(trend.ci_high, 3)],
            "intercept": trend.intercept,
            "slope_year": trend.slope_per_year,
            "r2": round(trend.r2, 3),
        },
        "trend_20th": {
            "slope_decade": round(trend_20.slope_per_decade, 3),
            "ci": [round(trend_20.ci_low, 3), round(trend_20.ci_high, 3)],
        },
        "projection": {
            "year": 2050,
            "value": round(value, 2),
            "low": round(low, 2),
            "high": round(high, 2),
        },
        "warming": round(warming, 2),
        "lapse_per_100m": round(lapse, 3),
        "lapse_r2": round(lapse_r2, 3),
        "isotherm_shift": round(clim.isotherm_shift(warming, lapse)),
        "n_cells": int(climate["cell_id"].nunique()),
    }


def _land_use_block(land_use: pd.DataFrame) -> list[dict]:
    shares = clim.land_use_shares(land_use)
    tests = clim.land_use_change_test(land_use).set_index("zone")
    zones = []
    for zone, sub in shares.groupby("zone"):
        wide = sub.pivot(index="decade", columns="land_use", values="share")
        zones.append(
            {
                "id": zone,
                "label": ZONE_LABELS[zone],
                "n_cells": int(tests.loc[zone, "n_cells"]),
                "chi2": round(float(tests.loc[zone, "chi2"]), 2),
                "p": round(float(tests.loc[zone, "p_value"]), 4),
                "decades": wide.index.astype(int).tolist(),
                "shares": {c: _round(wide[c], 4) for c in LAND_USE_ORDER},
            }
        )
    return zones


def _species_block(bees: pd.DataFrame) -> tuple[list[dict], dict]:
    resampled = shifts.resampled_shifts(bees).set_index("species")
    raw = shifts.raw_shifts(bees).set_index("species")
    niche = shifts.thermal_niche(bees).set_index("species")
    summary = shifts.elevation_summary(bees).set_index(["species", "period"])
    species = []
    for name in resampled.index:
        r, w, t = resampled.loc[name], raw.loc[name], niche.loc[name]
        old, new = summary.loc[(name, PERIOD_1889)], summary.loc[(name, PERIOD_2005)]
        species.append(
            {
                "name": name,
                "short": short_name(name),
                "n": [int(r["n_1889"]), int(r["n_2005"])],
                "mean": [round(r["mean_1889"], 1), round(r["mean_2005"], 1)],
                "shift": round(r["shift"], 1),
                "shift_sd": round(r["shift_sd"], 1),
                "raw": [round(w["mean_1889"], 1), round(w["mean_2005"], 1)],
                "range": [[int(old["min"]), int(old["max"])], [int(new["min"]), int(new["max"])]],
                "t_mean": [round(t["mean_1889"], 2), round(t["mean_2005"], 2)],
                "t_median": [round(t["median_1889"], 2), round(t["median_2005"], 2)],
                "dT": round(t["delta_mean"], 2),
                "H": round(t["H"], 2),
                "p": float(f"{t['p_value']:.3g}"),
                "p_holm": float(f"{t['p_holm']:.3g}"),
            }
        )
    test = shifts.mean_shift_test(resampled["shift"])
    return species, {k: (round(v, 4) if isinstance(v, float) else v) for k, v in test.items()}


def _records_block(bees: pd.DataFrame, species_names: list[str]) -> dict:
    plants = sorted(bees["plant"].unique())
    sp_index = {s: i for i, s in enumerate(species_names)}
    pl_index = {p: i for i, p in enumerate(plants)}
    return {
        "plants": plants,
        "species": [sp_index[s] for s in bees["species"]],
        "period": [int(p == PERIOD_2005) for p in bees["period"]],
        "elevation": [int(round(e)) for e in bees["elevation"]],
        "t": _round(bees["t_august"], 1),
        "plant": [pl_index[p] for p in bees["plant"]],
    }


def _community_block(bees: pd.DataFrame) -> dict:
    curves = community.rarefaction_by_period(bees, step=4)
    equal = community.compare_at_equal_size(bees)
    effort = community.effort_table(bees, "band")
    bands = sorted(effort["band"].unique())
    wide = effort.pivot(index="band", columns="period").reindex(bands)
    return {
        "rarefaction": {
            period: {
                "n": sub["n"].astype(int).tolist(),
                "e": _round(sub["expected"], 3),
                "lo": _round(sub["low"], 3),
                "hi": _round(sub["high"], 3),
            }
            for period, sub in curves.groupby("period")
        },
        "equal": {
            row["period"]: {
                "n": int(row["n"]),
                "expected": round(row["expected"], 2),
                "low": round(row["low"], 2),
                "high": round(row["high"], 2),
                "observed": int(row["observed"]),
                "total": int(row["total"]),
            }
            for _, row in equal.iterrows()
        },
        "effort": [
            {
                "band": band,
                "individuals": [int(wide.loc[band, ("individuals", p)]) for p in PERIODS],
                "species": [int(wide.loc[band, ("species", p)]) for p in PERIODS],
            }
            for band in bands
        ],
        "sites_1889": int(bees.loc[bees["period"] == PERIOD_1889, "site"].nunique()),
        "plots_2005": int(bees.loc[bees["period"] == PERIOD_2005, "site"].nunique()),
    }


def _plants_block(bees: pd.DataFrame) -> dict:
    resampled = shifts.resampled_shifts(bees, by="plant")
    test = shifts.mean_shift_test(resampled["shift"])
    top = []
    for plant in shifts.top_plants(bees):
        profile = shifts.visitation_profile(bees, plant)
        comp = shifts.visitor_composition(bees, plant)
        counts = comp["counts"]
        wide = profile.pivot(index="band_low", columns="period", values="visits")
        top.append(
            {
                "name": plant,
                "bands": wide.index.astype(int).tolist(),
                "visits": [wide[p].astype(int).tolist() for p in PERIODS],
                "visitors": [
                    {"species": short_name(s), "n": [int(counts.loc[s, p]) for p in PERIODS]}
                    for s in counts.index
                ],
                "jaccard": round(comp["jaccard"], 2),
                "shared": len(comp["shared"]),
                "only": [len(comp["only_1889"]), len(comp["only_2005"])],
            }
        )
    return {
        "shifts": [
            {
                "name": row["plant"],
                "n": [int(row["n_1889"]), int(row["n_2005"])],
                "mean": [round(row["mean_1889"], 1), round(row["mean_2005"], 1)],
                "shift": round(row["shift"], 1),
            }
            for _, row in resampled.sort_values("shift", ascending=False).iterrows()
        ],
        "test": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in test.items()},
        "top": top,
    }


def build_site_data() -> dict:
    """Assemble toutes les données nécessaires au site, à partir des fonctions d'analyse."""
    climate = load_climate()
    bees = load_bumblebees()
    species, species_test = _species_block(bees)
    august = shifts.august_climate_shift(bees)
    return {
        "meta": {
            "n_obs": len(bees),
            "n": [int((bees["period"] == p).sum()) for p in PERIODS],
            "n_species": int(bees["species"].nunique()),
            "n_plants": int(bees["plant"].nunique()),
        },
        "climate": _climate_block(climate),
        "land_use": _land_use_block(load_land_use()),
        "species": species,
        "species_test": species_test,
        "august": {k: round(v, 3) for k, v in august.items()},
        "records": _records_block(bees, [s["name"] for s in species]),
        "community": _community_block(bees),
        "plants": _plants_block(bees),
    }


def write_site_data(path: Path = SITE_DATA_PATH) -> Path:
    """Écrit ``docs/data.js`` (``window.SITE_DATA = {...};``), sortie déterministe."""
    payload = json.dumps(build_site_data(), ensure_ascii=False, separators=(",", ":"))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "/* Généré par scripts/build_site_data.py — ne pas modifier à la main. */\n"
        f"window.SITE_DATA = {payload};\n",
        encoding="utf-8",
    )
    return path
