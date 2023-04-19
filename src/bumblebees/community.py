"""Effort d'échantillonnage, richesse spécifique et raréfaction."""

from __future__ import annotations

from collections.abc import Iterable

import numpy as np
import pandas as pd
from scipy.special import gammaln

from .data import PERIODS


def effort_table(bees: pd.DataFrame, by: str | list[str] = "band") -> pd.DataFrame:
    """Nombre d'individus et d'espèces par période et par ``by`` (tranche d'altitude, site…)."""
    keys = ["period", *([by] if isinstance(by, str) else by)]
    out = bees.groupby(keys).agg(
        individuals=("species", "size"),
        species=("species", "nunique"),
        elevation=("elevation", "mean"),
    )
    return out.reset_index()


def _log_comb(n: np.ndarray | int, k: np.ndarray | int) -> np.ndarray:
    """log C(n, k), −inf quand k > n (combinaison impossible)."""
    n = np.asarray(n, dtype=float)
    k = np.asarray(k, dtype=float)
    with np.errstate(invalid="ignore"):
        out = gammaln(n + 1) - gammaln(k + 1) - gammaln(n - k + 1)
    return np.where(k > n, -np.inf, out)


def rarefaction(abundances: Iterable[int], sizes: Iterable[int] | None = None) -> pd.DataFrame:
    """Raréfaction individu-centrée : richesse attendue E[S_n] et son écart-type.

    Espérance de Hurlbert (1971) et variance de Heck, van Belle & Simberloff (1975), calculées
    en log-combinaisons pour rester stables numériquement. ``abundances`` = effectif par espèce.
    """
    counts = np.asarray([a for a in abundances if a > 0], dtype=int)
    total = int(counts.sum())
    sizes = np.arange(1, total + 1) if sizes is None else np.asarray(list(sizes), dtype=int)
    if (sizes < 1).any() or (sizes > total).any():
        raise ValueError(f"Les tailles d'échantillon doivent être comprises entre 1 et {total}.")

    rows = []
    pair_i, pair_j = np.triu_indices(len(counts), k=1)
    for n in sizes:
        log_total = _log_comb(total, n)
        # q_i : probabilité que l'espèce i soit absente d'un sous-échantillon de n individus
        q = np.exp(_log_comb(total - counts, n) - log_total)
        q_pair = np.exp(_log_comb(total - counts[pair_i] - counts[pair_j], n) - log_total)
        expected = float(np.sum(1 - q))
        variance = float(np.sum(q * (1 - q)) + 2 * np.sum(q_pair - q[pair_i] * q[pair_j]))
        rows.append({"n": int(n), "expected": expected, "sd": float(np.sqrt(max(variance, 0.0)))})
    return pd.DataFrame(rows)


def rarefaction_by_period(
    bees: pd.DataFrame, step: int = 1, group: str = "species"
) -> pd.DataFrame:
    """Courbes de raréfaction (IC 95 %) pour chaque période, de 1 individu à l'effectif total."""
    frames = []
    for period in PERIODS:
        abundances = bees.loc[bees["period"] == period, group].value_counts().to_numpy()
        total = int(abundances.sum())
        sizes = sorted({*range(1, total + 1, step), total})
        curve = rarefaction(abundances, sizes)
        curve["period"] = period
        frames.append(curve)
    out = pd.concat(frames, ignore_index=True)
    # L'intervalle ne peut dépasser la richesse observée de la période ni descendre sous 1
    observed = out["period"].map(bees.groupby("period")[group].nunique())
    out["low"] = (out["expected"] - 1.96 * out["sd"]).clip(lower=1)
    out["high"] = np.minimum(out["expected"] + 1.96 * out["sd"], observed)
    return out


def compare_at_equal_size(bees: pd.DataFrame, group: str = "species") -> pd.DataFrame:
    """Richesse attendue des deux périodes ramenées au plus petit effectif (IC 95 %)."""
    abundances = {
        p: bees.loc[bees["period"] == p, group].value_counts().to_numpy() for p in PERIODS
    }
    n_min = int(min(a.sum() for a in abundances.values()))
    rows = []
    for period, ab in abundances.items():
        res = rarefaction(ab, [n_min]).iloc[0]
        observed = int((ab > 0).sum())
        rows.append(
            {
                "period": period,
                "n": n_min,
                "observed": observed,
                "total": int(ab.sum()),
                "expected": res["expected"],
                "low": max(res["expected"] - 1.96 * res["sd"], 1.0),
                "high": min(res["expected"] + 1.96 * res["sd"], observed),
            }
        )
    return pd.DataFrame(rows)


def shannon_evenness(abundances: Iterable[int]) -> tuple[float, float]:
    """Indice de Shannon H' et équitabilité de Pielou J' = H' / ln(S)."""
    counts = np.asarray([a for a in abundances if a > 0], dtype=float)
    p = counts / counts.sum()
    h = float(-(p * np.log(p)).sum())
    return h, float(h / np.log(len(counts))) if len(counts) > 1 else float("nan")
