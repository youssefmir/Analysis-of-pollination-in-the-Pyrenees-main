"""Déplacements en altitude, niche thermique et interactions plantes-bourdons."""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats
from statsmodels.stats.multitest import multipletests

from .data import PERIOD_1889, PERIOD_2005, PERIODS

RANDOM_STATE = 42
N_RESAMPLES = 1000


def elevation_summary(bees: pd.DataFrame, by: str = "species") -> pd.DataFrame:
    """Altitude moyenne, médiane, minimale et maximale par taxon et par période."""
    return (
        bees.groupby([by, "period"])["elevation"]
        .agg(n="size", mean="mean", median="median", min="min", max="max")
        .reset_index()
    )


def taxa_in_both(bees: pd.DataFrame, by: str = "species", min_n: int = 2) -> list[str]:
    """Taxons observés au moins ``min_n`` fois dans chacune des deux périodes."""
    counts = pd.crosstab(bees[by], bees["period"])
    keep = counts[(counts[list(PERIODS)] >= min_n).all(axis=1)]
    return sorted(keep.index)


def raw_shifts(bees: pd.DataFrame, by: str = "species", min_n: int = 2) -> pd.DataFrame:
    """Écart brut d'altitude moyenne (2005-06 − 1889) et test de Mann-Whitney par taxon."""
    rows = []
    for taxon in taxa_in_both(bees, by, min_n):
        sub = bees[bees[by] == taxon]
        old = sub.loc[sub["period"] == PERIOD_1889, "elevation"]
        new = sub.loc[sub["period"] == PERIOD_2005, "elevation"]
        test = stats.mannwhitneyu(new, old, alternative="two-sided")
        rows.append(
            {
                by: taxon,
                "n_1889": len(old),
                "n_2005": len(new),
                "mean_1889": old.mean(),
                "mean_2005": new.mean(),
                "raw_shift": new.mean() - old.mean(),
                "mw_p": float(test.pvalue),
            }
        )
    return pd.DataFrame(rows)


def resampled_shifts(
    bees: pd.DataFrame,
    by: str = "species",
    min_n: int = 2,
    n_resamples: int = N_RESAMPLES,
    seed: int = RANDOM_STATE,
) -> pd.DataFrame:
    """Déplacement d'altitude corrigé de l'effort d'échantillonnage (Chen *et al.*, 2011).

    Dans chaque tranche de 200 m, la période la plus échantillonnée est sous-échantillonnée (sans
    remise) jusqu'à l'effectif de l'autre ; on recalcule alors l'altitude moyenne de chaque taxon
    dans chaque période. Répété ``n_resamples`` fois : on garde la moyenne et l'écart-type des
    déplacements, ainsi que les altitudes moyennes rééchantillonnées.
    """
    taxa = taxa_in_both(bees, by, min_n)
    data = bees[bees[by].isin(taxa)].reset_index(drop=True)
    taxon_code = pd.Categorical(data[by], categories=taxa).codes
    is_new = (data["period"] == PERIOD_2005).to_numpy()
    elevation = data["elevation"].to_numpy(dtype=float)

    # Indices par (tranche, période) et taille cible = effectif de la période la moins dense
    plan = []
    for _, idx in data.groupby("band").groups.items():
        idx = np.asarray(idx)
        old, new = idx[~is_new[idx]], idx[is_new[idx]]
        target = min(len(old), len(new))
        if target > 0:
            plan.append((old, new, target))

    rng = np.random.default_rng(seed)
    n_taxa = len(taxa)
    shifts = np.full((n_resamples, n_taxa), np.nan)
    means_old = np.full((n_resamples, n_taxa), np.nan)
    means_new = np.full((n_resamples, n_taxa), np.nan)
    for r in range(n_resamples):
        picked = np.concatenate(
            [
                np.concatenate(
                    [
                        old if len(old) == target else rng.choice(old, target, replace=False),
                        new if len(new) == target else rng.choice(new, target, replace=False),
                    ]
                )
                for old, new, target in plan
            ]
        )
        codes, ele, new_flag = taxon_code[picked], elevation[picked], is_new[picked]
        for flag, store in ((False, means_old), (True, means_new)):
            mask = new_flag == flag
            total = np.bincount(codes[mask], weights=ele[mask], minlength=n_taxa)
            count = np.bincount(codes[mask], minlength=n_taxa)
            with np.errstate(invalid="ignore", divide="ignore"):
                store[r] = np.where(count > 0, total / count, np.nan)
        shifts[r] = means_new[r] - means_old[r]

    out = pd.DataFrame(
        {
            by: taxa,
            "mean_1889": np.nanmean(means_old, axis=0),
            "mean_2005": np.nanmean(means_new, axis=0),
            "shift": np.nanmean(shifts, axis=0),
            "shift_sd": np.nanstd(shifts, axis=0),
            "valid_resamples": np.sum(~np.isnan(shifts), axis=0),
        }
    )
    counts = pd.crosstab(data[by], data["period"]).reindex(taxa)
    out["n_1889"] = counts[PERIOD_1889].to_numpy()
    out["n_2005"] = counts[PERIOD_2005].to_numpy()
    return out


def mean_shift_test(shift_values: pd.Series) -> dict[str, float]:
    """Test t à un échantillon (H0 : déplacement moyen nul) sur les déplacements par taxon."""
    values = pd.Series(shift_values).dropna().to_numpy(dtype=float)
    res = stats.ttest_1samp(values, 0.0)
    low, high = res.confidence_interval(0.95)
    return {
        "mean": float(values.mean()),
        "ci_low": float(low),
        "ci_high": float(high),
        "t": float(res.statistic),
        "df": int(len(values) - 1),
        "p_value": float(res.pvalue),
        "n_up": int((values > 0).sum()),
        "n": int(len(values)),
    }


def thermal_niche(bees: pd.DataFrame, min_n: int = 2) -> pd.DataFrame:
    """Température d'août au point d'observation, 1889 vs 2005-06, par espèce.

    Test de Kruskal-Wallis (non paramétrique) par espèce puis correction de Holm pour les
    comparaisons multiples.
    """
    rows = []
    for species in taxa_in_both(bees, "species", min_n):
        sub = bees[bees["species"] == species]
        old = sub.loc[sub["period"] == PERIOD_1889, "t_august"]
        new = sub.loc[sub["period"] == PERIOD_2005, "t_august"]
        test = stats.kruskal(old, new)
        rows.append(
            {
                "species": species,
                "n_1889": len(old),
                "n_2005": len(new),
                "median_1889": old.median(),
                "median_2005": new.median(),
                "mean_1889": old.mean(),
                "mean_2005": new.mean(),
                "delta_mean": new.mean() - old.mean(),
                "H": float(test.statistic),
                "p_value": float(test.pvalue),
            }
        )
    out = pd.DataFrame(rows)
    out["p_holm"] = multipletests(out["p_value"], method="holm")[1]
    out["significant"] = out["p_holm"] < 0.05
    return out


def august_climate_shift(bees: pd.DataFrame) -> dict[str, float]:
    """Réchauffement d'août à altitude égale et gradient thermique, d'après ``t_august``.

    Modèle linéaire ``t_august ~ altitude + période`` sur toutes les observations : le
    coefficient de période est le réchauffement à altitude fixée, celui d'altitude le gradient.
    """
    x = np.column_stack(
        [
            np.ones(len(bees)),
            bees["elevation"].to_numpy(dtype=float) / 100,
            (bees["period"] == PERIOD_2005).to_numpy(dtype=float),
        ]
    )
    coef, *_ = np.linalg.lstsq(x, bees["t_august"].to_numpy(dtype=float), rcond=None)
    lapse, warming = float(coef[1]), float(coef[2])
    return {"lapse_per_100m": lapse, "warming": warming, "isotherm_shift": -warming / lapse * 100}


def top_plants(bees: pd.DataFrame, k: int = 3) -> list[str]:
    """Les ``k`` plantes les plus visitées parmi celles présentes dans les deux périodes."""
    counts = pd.crosstab(bees["plant"], bees["period"])
    both = counts[(counts[list(PERIODS)] > 0).all(axis=1)]
    return both.sum(axis=1).sort_values(ascending=False).head(k).index.tolist()


def visitation_profile(bees: pd.DataFrame, plant: str) -> pd.DataFrame:
    """Part des visites d'une plante par tranche d'altitude de 200 m, pour chaque période."""
    sub = bees[bees["plant"] == plant]
    bands = sorted(bees["band_low"].unique())
    table = pd.crosstab(sub["band_low"], sub["period"]).reindex(
        index=bands, columns=list(PERIODS), fill_value=0
    )
    share = table / table.sum()
    out = table.stack().rename("visits").to_frame().join(share.stack().rename("share"))
    return out.reset_index().rename(columns={"band_low": "band_low"})


def visit_elevations(bees: pd.DataFrame, plants: list[str]) -> pd.DataFrame:
    """Altitude moyenne et maximale des visites (bourdons) de chaque plante, par période."""
    sub = bees[bees["plant"].isin(plants)]
    out = sub.groupby(["plant", "period"])["elevation"].agg(
        visits="size", mean="mean", p90=lambda e: e.quantile(0.9), max="max"
    )
    return out.reindex(
        pd.MultiIndex.from_product([plants, list(PERIODS)], names=["plant", "period"])
    )


def jaccard(a: set[str], b: set[str]) -> float:
    """Indice de Jaccard |A ∩ B| / |A ∪ B| (1 = mêmes espèces, 0 = aucune en commun)."""
    union = a | b
    return len(a & b) / len(union) if union else float("nan")


def visitor_composition(bees: pd.DataFrame, plant: str) -> dict[str, object]:
    """Visiteurs d'une plante : effectifs par espèce et période, espèces communes, Jaccard."""
    sub = bees[bees["plant"] == plant]
    counts = pd.crosstab(sub["species"], sub["period"]).reindex(columns=list(PERIODS), fill_value=0)
    old = set(counts.index[counts[PERIOD_1889] > 0])
    new = set(counts.index[counts[PERIOD_2005] > 0])
    return {
        "counts": counts,
        "shared": sorted(old & new),
        "only_1889": sorted(old - new),
        "only_2005": sorted(new - old),
        "jaccard": jaccard(old, new),
    }


def mean_elevation_by_period(bees: pd.DataFrame) -> dict[str, float]:
    """Altitude moyenne de toutes les observations, par période (non corrigée de l'effort)."""
    return bees.groupby("period")["elevation"].mean().to_dict()
