"""Style graphique commun (aligné sur la palette du site) et figures du notebook."""

from __future__ import annotations

from pathlib import Path

import matplotlib as mpl
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.colors import LinearSegmentedColormap

from .data import LAND_USE_ORDER, PERIOD_1889, PERIOD_2005, PERIODS, PROJECT_ROOT, ZONE_LABELS
from .data import short_name as _short

FIGURES_DIR = PROJECT_ROOT / "assets" / "figures"

# Palette (validée daltonisme / contraste, identique au site en thème clair)
INK = "#14212b"
INK_2 = "#3d4d57"
MUTED = "#6a7a83"
GRID = "#dfe5e1"
AXIS = "#b6c1bb"
SURFACE = "#fbfcfa"
PERIOD_COLORS = {PERIOD_1889: "#3567ad", PERIOD_2005: "#c27800"}
PERIOD_LABELS = {PERIOD_1889: "1889 (MacLeod)", PERIOD_2005: "2005-06 (Biesmeijer)"}
LAND_USE_COLORS = {"Forêt": "#1a7a4f", "Prairie": "#84ab25", "Autre": "#a8692f"}
STRIPES_CMAP = LinearSegmentedColormap.from_list(
    "rayures", ["#1f4f8f", "#5d8fc9", "#eef0ec", "#d9775f", "#a3271f"]
)


def use_style() -> None:
    """Applique le style maison (fond clair, grille discrète, typographie lisible)."""
    mpl.rcParams.update(
        {
            "figure.dpi": 110,
            "savefig.dpi": 160,
            "figure.facecolor": SURFACE,
            "axes.facecolor": SURFACE,
            "savefig.facecolor": SURFACE,
            "axes.edgecolor": AXIS,
            "axes.labelcolor": INK_2,
            "axes.titlecolor": INK,
            "axes.titlesize": 12.5,
            "axes.titleweight": "bold",
            "axes.titlelocation": "left",
            "axes.titlepad": 10,
            "axes.labelsize": 10.5,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "axes.grid": True,
            "axes.axisbelow": True,
            "grid.color": GRID,
            "grid.linewidth": 0.8,
            "xtick.color": MUTED,
            "ytick.color": MUTED,
            "xtick.labelsize": 9.5,
            "ytick.labelsize": 9.5,
            "legend.frameon": False,
            "legend.fontsize": 9.5,
            "lines.linewidth": 2,
            "font.size": 10.5,
            "axes.formatter.use_locale": False,
        }
    )


def _fr(x: float, digits: int = 0) -> str:
    """Nombre au format français (espace fine, virgule décimale)."""
    s = f"{x:,.{digits}f}".replace(",", " ").replace(".", ",")
    return s.replace("-", "−")


def format_p(p: float) -> str:
    """p-valeur lisible : « p < 0,001 » ou « p = 0,007 »."""
    return "p < 0,001" if p < 0.001 else f"p = {_fr(p, 3)}"


def save(fig: plt.Figure, name: str, directory: Path = FIGURES_DIR) -> Path:
    """Enregistre une figure en PNG dans ``assets/figures``."""
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{name}.png"
    fig.savefig(path, bbox_inches="tight")
    return path


def warming_figure(yearly: pd.DataFrame, trend, projection_year: int = 2050) -> plt.Figure:
    """Rayures du réchauffement, série annuelle, tendance et projection 2050."""
    fig, (ax_s, ax) = plt.subplots(
        2, 1, figsize=(10, 5.6), height_ratios=(1, 4), sharex=True, gridspec_kw={"hspace": 0.08}
    )
    years = yearly["year"].to_numpy()
    temps = yearly["t_mean"].to_numpy()
    anomaly = temps - temps[(years >= 1901) & (years <= 1930)].mean()
    lim = np.abs(anomaly).max()
    ax_s.bar(years, 1, width=1.0, color=STRIPES_CMAP((anomaly + lim) / (2 * lim)), linewidth=0)
    ax_s.set_axis_off()
    ax_s.set_title("Température annuelle moyenne de la zone d'étude (177 cellules de 1 km²)")

    ax.plot(years, temps, color=INK_2, lw=1.4, label="Moyenne annuelle")
    grid = np.arange(trend.start, projection_year + 1)
    fit = trend.intercept + trend.slope_per_year * grid
    ax.plot(grid[grid <= trend.end], fit[grid <= trend.end], color=PERIOD_COLORS[PERIOD_2005])
    ax.plot(
        grid[grid >= trend.end], fit[grid >= trend.end], color=PERIOD_COLORS[PERIOD_2005], ls="--"
    )
    pred, low, high = trend.predict(projection_year)
    ax.errorbar(
        projection_year,
        pred,
        yerr=[[pred - low], [high - pred]],
        fmt="o",
        color=PERIOD_COLORS[PERIOD_2005],
        ms=6,
        capsize=4,
        lw=1.5,
    )
    ax.annotate(
        f"{projection_year} : {_fr(pred, 1)} °C\n(IP 95 % : {_fr(low, 1)}–{_fr(high, 1)} °C)",
        (projection_year, high),
        xytext=(-8, 8),
        textcoords="offset points",
        ha="right",
        va="bottom",
        fontsize=9.5,
        color=INK,
    )
    ax.text(
        0.01,
        0.97,
        f"Tendance {trend.start}–{trend.end} : +{_fr(trend.slope_per_decade, 2)} °C par décennie "
        f"(IC 95 % : {_fr(trend.ci_low, 2)}–{_fr(trend.ci_high, 2)})",
        transform=ax.transAxes,
        va="top",
        fontsize=10,
        color=INK,
    )
    ax.set_ylabel("Température moyenne annuelle (°C)")
    ax.set_xlim(1899, projection_year + 3)
    fig.text(
        0.125,
        0.0,
        "Source : ClimateEU v4.63 via Marshall et al. (2020). Tendance : MCO, "
        "erreurs-types de Newey-West.",
        fontsize=8.5,
        color=MUTED,
    )
    return fig


def land_use_figure(shares: pd.DataFrame) -> plt.Figure:
    """Parts de forêt, prairie et autre (roche, neige) par décennie, une vignette par zone."""
    zones = sorted(shares["zone"].unique())
    fig, axes = plt.subplots(1, len(zones), figsize=(11, 4.2), sharey=True, layout="constrained")
    for ax, zone in zip(axes, zones, strict=True):
        sub = shares[shares["zone"] == zone].pivot(
            index="decade", columns="land_use", values="share"
        )
        sub = sub[list(LAND_USE_ORDER)] * 100
        ax.stackplot(
            sub.index,
            *(sub[c] for c in LAND_USE_ORDER),
            colors=[LAND_USE_COLORS[c] for c in LAND_USE_ORDER],
            edgecolor=SURFACE,
            linewidth=1.5,
            labels=LAND_USE_ORDER,
        )
        ax.set_title(ZONE_LABELS[zone], fontsize=11)
        ax.set_xlim(1910, 2036)
        ax.set_xticks([1910, 1960, 2010])
        ax.set_ylim(0, 100)
        ax.grid(False)
        ax.spines["bottom"].set_bounds(1910, 2010)
        # Étiquettes directes : 1910 dans les aires, 2010 dans la marge de droite
        for decade, x, align, color in ((1910, 1913, "left", "white"), (2010, 2013, "left", INK_2)):
            top = sub.loc[decade].cumsum()
            for c in LAND_USE_ORDER:
                value = sub.loc[decade, c]
                if value >= 6:
                    ax.text(
                        x,
                        top[c] - value / 2,
                        f"{_fr(value)} %",
                        ha=align,
                        va="center",
                        fontsize=8.5,
                        color=color,
                    )
    axes[0].set_ylabel("Part des cellules (%)")
    fig.legend(*axes[0].get_legend_handles_labels(), loc="outside lower left", ncol=3)
    fig.suptitle(
        "Occupation du sol par zone d'altitude, 1910 → 2010",
        x=0.01,
        ha="left",
        fontsize=12.5,
        fontweight="bold",
        color=INK,
    )
    return fig


def richness_figure(effort: pd.DataFrame) -> plt.Figure:
    """Individus et espèces par tranche d'altitude et période."""
    fig, (ax_n, ax_s) = plt.subplots(1, 2, figsize=(11, 4.2), layout="constrained")
    bands = sorted(effort["band"].unique())
    y = np.arange(len(bands))
    height = 0.38
    for i, period in enumerate(PERIODS):
        sub = effort[effort["period"] == period].set_index("band").reindex(bands)
        offset = (i - 0.5) * height
        for ax, col in ((ax_n, "individuals"), (ax_s, "species")):
            ax.barh(
                y + offset,
                sub[col],
                height=height * 0.9,
                color=PERIOD_COLORS[period],
                label=PERIOD_LABELS[period],
            )
            for yy, v in zip(y + offset, sub[col], strict=True):
                ax.text(
                    v + 1 if col == "individuals" else v + 0.15,
                    yy,
                    f"{v:.0f}",
                    va="center",
                    fontsize=8.5,
                    color=INK_2,
                )
    for ax, title in ((ax_n, "Individus observés"), (ax_s, "Espèces observées")):
        ax.set_yticks(y, [f"{b.replace('-', '–')} m" for b in bands])
        ax.set_title(title)
        ax.grid(axis="y", visible=False)
    ax_s.set_xlim(0, 13)
    ax_n.set_xlim(0, effort["individuals"].max() * 1.12)
    fig.legend(*ax_n.get_legend_handles_labels(), loc="outside lower left", ncol=2)
    return fig


def rarefaction_figure(curves: pd.DataFrame, comparison: pd.DataFrame) -> plt.Figure:
    """Courbes de raréfaction (richesse attendue ± IC 95 %) pour les deux périodes."""
    fig, ax = plt.subplots(figsize=(8.5, 4.4))
    for period in PERIODS:
        sub = curves[curves["period"] == period]
        color = PERIOD_COLORS[period]
        ax.fill_between(sub["n"], sub["low"], sub["high"], color=color, alpha=0.12, lw=0)
        ax.plot(sub["n"], sub["expected"], color=color, label=PERIOD_LABELS[period])
        ax.plot(
            sub["n"].iloc[-1],
            sub["expected"].iloc[-1],
            "o",
            color=color,
            ms=6,
            mec=SURFACE,
            mew=1.5,
        )
    n_min = int(comparison["n"].iloc[0])
    ax.axvline(n_min, color=AXIS, lw=1)
    ax.text(
        n_min + 6,
        3,
        f"Comparaison à effectif égal\n(n = {n_min} individus)",
        fontsize=9,
        color=INK_2,
    )
    ax.set_xlabel("Nombre d'individus échantillonnés")
    ax.set_ylabel("Nombre d'espèces attendu")
    ax.set_ylim(0, 13)
    ax.legend(loc="lower right")
    ax.set_title("Courbes de raréfaction (Hurlbert 1971, IC 95 % de Heck et al. 1975)")
    return fig


def thermal_niche_figure(bees: pd.DataFrame, niche: pd.DataFrame) -> plt.Figure:
    """Température d'août aux points d'observation, par espèce et période (+ p de Holm)."""
    order = niche.sort_values("delta_mean")["species"].tolist()
    fig, ax = plt.subplots(figsize=(9.5, 6.2))
    rng = np.random.default_rng(0)
    for i, species in enumerate(order):
        for j, period in enumerate(PERIODS):
            vals = bees.loc[(bees["species"] == species) & (bees["period"] == period), "t_august"]
            y = i + (j - 0.5) * 0.36
            ax.scatter(
                vals,
                y + rng.uniform(-0.09, 0.09, len(vals)),
                s=9,
                alpha=0.35,
                color=PERIOD_COLORS[period],
                lw=0,
            )
            ax.plot(
                [vals.quantile(0.25), vals.quantile(0.75)],
                [y, y],
                color=PERIOD_COLORS[period],
                lw=3,
                solid_capstyle="round",
            )
            ax.plot(vals.median(), y, "o", color=PERIOD_COLORS[period], ms=6, mec=SURFACE, mew=1.5)
        row = niche.set_index("species").loc[species]
        label = "n.s." if row["p_holm"] >= 0.05 else format_p(row["p_holm"])
        ax.text(
            17.9,
            i,
            f"{_fr(row['delta_mean'], 1)} °C  ·  {label}",
            va="center",
            fontsize=8.5,
            color=INK if row["significant"] else MUTED,
        )
    ax.set_yticks(range(len(order)), [_short(s) for s in order], style="italic")
    ax.set_xlim(9.5, 20.3)
    ax.set_xlabel("Température moyenne d'août au point d'observation (°C)")
    ax.grid(axis="y", visible=False)
    handles = [
        mpl.lines.Line2D([], [], color=PERIOD_COLORS[p], marker="o", lw=3, label=PERIOD_LABELS[p])
        for p in PERIODS
    ]
    ax.legend(handles=handles, loc="lower left", bbox_to_anchor=(0, 1.0), ncol=2)
    ax.set_title(
        "Niche thermique : médiane, intervalle interquartile et observations\n"
        "(Δ moyenne, Kruskal-Wallis corrigé de Holm)",
        pad=28,
    )
    return fig


def dumbbell_figure(shifts: pd.DataFrame, by: str, title: str) -> plt.Figure:
    """Altitude moyenne 1889 → 2005-06 (corrigée de l'effort), triée par déplacement."""
    data = shifts.sort_values("shift").reset_index(drop=True)
    fig, ax = plt.subplots(figsize=(9.5, 0.42 * len(data) + 1.6))
    for i, row in data.iterrows():
        ax.plot([row["mean_1889"], row["mean_2005"]], [i, i], color=AXIS, lw=2, zorder=1)
        for period, col in ((PERIOD_1889, "mean_1889"), (PERIOD_2005, "mean_2005")):
            ax.plot(
                row[col], i, "o", color=PERIOD_COLORS[period], ms=8, mec=SURFACE, mew=2, zorder=2
            )
        ax.text(
            max(row["mean_1889"], row["mean_2005"]) + 25,
            i,
            f"{'+' if row['shift'] >= 0 else '−'}{_fr(abs(row['shift']))} m",
            va="center",
            fontsize=9,
            color=INK,
        )
    labels = [_short(s) if by == "species" else s for s in data[by]]
    ax.set_yticks(range(len(data)), labels, style="italic")
    ax.set_xlabel("Altitude moyenne (m)")
    ax.grid(axis="y", visible=False)
    handles = [
        mpl.lines.Line2D(
            [], [], color=PERIOD_COLORS[p], marker="o", lw=0, ms=8, label=PERIOD_LABELS[p]
        )
        for p in PERIODS
    ]
    ax.legend(handles=handles, loc="lower right")
    ax.set_title(title)
    return fig


def shift_vs_warming_figure(shifts: pd.DataFrame, niche: pd.DataFrame, august: dict) -> plt.Figure:
    """Déplacement en altitude vs variation de la température d'août subie, par espèce."""
    merged = shifts.merge(niche, on="species")
    fig, ax = plt.subplots(figsize=(8.5, 5.2))
    x = np.linspace(-300, 500, 50)
    ax.plot(x, august["warming"] + august["lapse_per_100m"] * x / 100, color=AXIS, lw=1.5)
    ax.annotate(
        f"attendu si seule l'altitude change :\n{_fr(august['warming'], 1)} °C − "
        f"{_fr(-august['lapse_per_100m'], 2)} °C par 100 m gravis",
        (-250, august["warming"] - august["lapse_per_100m"] * 2.5),
        xytext=(10, 12),
        textcoords="offset points",
        fontsize=8.5,
        color=MUTED,
    )
    ax.axhline(0, color=AXIS, lw=0.8)
    ax.scatter(
        merged["shift"],
        merged["delta_mean"],
        s=58,
        color=PERIOD_COLORS[PERIOD_2005],
        edgecolor=SURFACE,
        linewidth=1.8,
        zorder=3,
    )
    # Décalages manuels des étiquettes dans les zones denses
    offsets = {
        "Bombus terrestris complex": (-6, 5, "right"),
        "Bombus humilis": (-6, -13, "right"),
        "Bombus pascuorum": (2, -14, "left"),
        "Bombus lapidarius": (-6, -13, "right"),
    }
    for _, row in merged.iterrows():
        dx, dy, ha = offsets.get(row["species"], (6, 4, "left"))
        ax.annotate(
            _short(row["species"]),
            (row["shift"], row["delta_mean"]),
            xytext=(dx, dy),
            textcoords="offset points",
            fontsize=8.5,
            style="italic",
            color=INK_2,
            ha=ha,
        )
    ax.set_xlabel("Déplacement de l'altitude moyenne, 1889 → 2005-06 (m)")
    ax.set_ylabel("Variation de la température d'août\nau point d'observation (°C)")
    ax.set_title(
        "Monter pour rester au frais : plus une espèce est montée,\n"
        "moins elle a « subi » le réchauffement"
    )
    return fig


def plant_profiles_figure(bees: pd.DataFrame, plants: list[str], profiles: dict) -> plt.Figure:
    """Profils de visite le long de l'altitude pour les plantes les plus visitées."""
    fig, axes = plt.subplots(1, len(plants), figsize=(11, 4.6), sharey=True, layout="constrained")
    bands = sorted(bees["band_low"].unique())
    for ax, plant in zip(axes, plants, strict=True):
        prof = profiles[plant]
        for sign, period in ((-1, PERIOD_1889), (1, PERIOD_2005)):
            sub = prof[prof["period"] == period].set_index("band_low").reindex(bands)
            ax.barh(
                np.array(bands) + 100,
                sign * sub["share"] * 100,
                height=170,
                color=PERIOD_COLORS[period],
                label=PERIOD_LABELS[period],
            )
        ax.axvline(0, color=AXIS, lw=1)
        ax.set_xlim(-105, 105)
        ax.set_xticks([-100, -50, 0, 50, 100], ["100", "50", "0", "50", "100"])
        ax.set_title(plant, style="italic", fontsize=11)
        ax.set_xlabel("Part des visites (%)")
        ax.grid(axis="y", visible=False)
    axes[0].set_yticks([b + 100 for b in bands], [f"{b}–{b + 200} m" for b in bands])
    fig.legend(*axes[0].get_legend_handles_labels(), loc="outside lower left", ncol=2)
    fig.suptitle(
        "Où butinent les bourdons sur les trois plantes les plus visitées ?",
        x=0.01,
        ha="left",
        fontsize=12.5,
        fontweight="bold",
        color=INK,
    )
    return fig
