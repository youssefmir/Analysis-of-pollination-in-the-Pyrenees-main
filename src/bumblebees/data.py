"""Chargement et nettoyage des données brutes (Marshall *et al.*, 2020).

Trois tables publiées avec l'article *Bumblebees moving up* (doi:10.1098/rspb.2020.2201) :

- ``Regional_Trend_Temps.csv`` : températures annuelles modélisées (ClimateEU), 1901-2009 ;
- ``Regional_LandUse.csv`` : occupation du sol reconstituée (HILDA) par décennie, 1910-2010 ;
- ``Bumblebee_data_climate_Marshall_et_al_2020.csv`` : observations de bourdons sur fleurs,
  août 1889 (MacLeod) et août 2005-2006 (équipe Biesmeijer).
"""

from __future__ import annotations

import urllib.request
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = PROJECT_ROOT / "data" / "raw"
SOURCE_URL = "https://raw.githubusercontent.com/lmar116/PyreneesBumblebees/master/Data/"
RAW_FILES = {
    "climate": "Regional_Trend_Temps.csv",
    "land_use": "Regional_LandUse.csv",
    "bumblebees": "Bumblebee_data_climate_Marshall_et_al_2020.csv",
}

PERIOD_1889 = "1889"
PERIOD_2005 = "2005-06"
PERIODS = (PERIOD_1889, PERIOD_2005)
PERIOD_BY_SOURCE = {"MacLeod": PERIOD_1889, "Biesmeijer": PERIOD_2005}

LAND_USE_LABELS = {333: "Forêt", 444: "Prairie", 555: "Autre"}
LAND_USE_ORDER = ("Forêt", "Prairie", "Autre")
ZONE_LABELS = {
    "z1": "Montagnard · 1 000–1 400 m",
    "z2": "Subalpin · 1 400–1 800 m",
    "z3": "Alpin · 1 800–2 200 m",
}

# Le fichier source contient le caractère de remplacement U+FFFD à la place des accents :
# l'encodage d'origine est perdu, on restaure les toponymes à la main.
SITE_NAME_FIXES = {
    "H�as": "Héas",
    "Saugu�": "Saugué",
    "Saugue": "Saugué",
    "weg naar de Br�che de Roland (Gavarnie)": "weg naar de Brèche de Roland (Gavarnie)",
}


def download_raw_data(raw_dir: Path = RAW_DIR, force: bool = False) -> list[Path]:
    """Télécharge les trois fichiers bruts depuis le dépôt des auteurs (s'ils manquent)."""
    raw_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for name in RAW_FILES.values():
        path = raw_dir / name
        if force or not path.exists():
            urllib.request.urlretrieve(SOURCE_URL + name, path)  # noqa: S310 - URL constante
        paths.append(path)
    return paths


def load_raw(key: str, raw_dir: Path = RAW_DIR) -> pd.DataFrame:
    """Lit un fichier brut tel quel (``key`` ∈ ``RAW_FILES``), en le téléchargeant si besoin."""
    path = raw_dir / RAW_FILES[key]
    if not path.exists():
        download_raw_data(raw_dir)
    return pd.read_csv(path)


def climate_checks(raw: pd.DataFrame) -> dict[str, float]:
    """Contrôles de cohérence de la table climatique brute (révèle ses deux anomalies)."""
    cells = raw.groupby(["Latitude", "Longitude"]).ngroups
    midpoint = (raw["Avg_min"] + raw["Avg_max"]) / 2
    return {
        "n_rows": len(raw),
        "n_grid_ids": raw["Grid-ID"].nunique(),
        "n_cells": cells,
        "n_years": raw["Year"].nunique(),
        "first_year": int(raw["Year"].min()),
        "last_year": int(raw["Year"].max()),
        "share_min_above_max": float((raw["Avg_min"] > raw["Avg_max"]).mean()),
        "max_gap_mean_vs_midpoint": float((raw["AnnualMeanTemp"] - midpoint).abs().max()),
    }


def load_climate(raw_dir: Path = RAW_DIR) -> pd.DataFrame:
    """Températures annuelles par cellule de 1 km², corrigées.

    Deux corrections par rapport au fichier source :

    - ``Grid-ID`` numérote les *lignes* (19 293 valeurs uniques) : la parcelle est identifiée par
      ses coordonnées, d'où ``cell_id`` (177 cellules × 109 années) ;
    - ``Avg_min`` et ``Avg_max`` sont inversées (le « minimum » dépasse le « maximum » sur 100 %
      des lignes) : on les renomme en ``t_max`` et ``t_min``.
    """
    raw = load_raw("climate", raw_dir)
    df = raw.rename(
        columns={
            "Year": "year",
            "Latitude": "lat",
            "Longitude": "lon",
            "Elevation": "elevation",
            "AnnualMeanTemp": "t_mean",
            "Avg_min": "t_max",
            "Avg_max": "t_min",
        }
    )
    df["cell_id"] = df.groupby(["lat", "lon"], sort=True).ngroup() + 1
    return df[["year", "cell_id", "lat", "lon", "elevation", "t_mean", "t_min", "t_max"]]


def load_land_use(raw_dir: Path = RAW_DIR) -> pd.DataFrame:
    """Occupation du sol au format long : une ligne par cellule et par décennie."""
    raw = load_raw("land_use", raw_dir)
    decade_cols = [c for c in raw.columns if c.startswith("LU")]
    long = raw.melt(
        id_vars=["Grid_ID", "Avg_Ele", "EleZone"],
        value_vars=decade_cols,
        var_name="decade",
        value_name="code",
    )
    long["decade"] = long["decade"].str.removeprefix("LU").astype(int)
    long["land_use"] = long["code"].map(LAND_USE_LABELS)
    long = long.rename(columns={"Grid_ID": "cell_id", "Avg_Ele": "elevation", "EleZone": "zone"})
    return long.sort_values(["zone", "cell_id", "decade"], ignore_index=True)


def load_bumblebees(raw_dir: Path = RAW_DIR) -> pd.DataFrame:
    """Observations de bourdons (une ligne = un individu observé sur une fleur).

    Colonnes : espèce, plante, date, site, période (``1889`` / ``2005-06``), altitude
    (milieu de ``MinEle``–``MaxEle``, identiques sur 99,9 % des lignes), tranche de 200 m et
    ``t_august`` : température moyenne d'août de la décennie au point d'observation
    (1901-1910 pour 1889, 2001-2010 pour 2005-06 ; variable ``clim`` de l'article).
    """
    raw = load_raw("bumblebees", raw_dir)
    df = pd.DataFrame(
        {
            "species": raw["Visitor"],
            "plant": raw["Plant"],
            "date": pd.to_datetime(raw["Date"], format="%d/%m/%Y"),
            "site": raw["Site"].replace(SITE_NAME_FIXES),
            "period": raw["Data"].map(PERIOD_BY_SOURCE),
            "lon": raw["Longitude"],
            "lat": raw["Latitude"],
            "ele_min": raw["MinEle"],
            "ele_max": raw["MaxEle"],
            "elevation": (raw["MinEle"] + raw["MaxEle"]) / 2,
            "band": raw["EleZone"],
            "t_august": raw["clim"],
        }
    )
    df["band_low"] = df["band"].str.split("-").str[0].astype(int)
    return df


def short_name(species: str) -> str:
    """« Bombus wurflenii » → « B. wurflenii » (abréviation usuelle du genre)."""
    genus, _, rest = species.partition(" ")
    return f"{genus[0]}. {rest}" if rest else species
