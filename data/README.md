# Données

Les trois fichiers de `raw/` sont ceux publiés par les auteurs de l'article
[*Bumblebees moving up: shifts in elevation ranges in the Pyrenees over 115 years*](https://doi.org/10.1098/rspb.2020.2201)
(Marshall *et al.*, Proc. R. Soc. B 287 : 20202201, 2020), dans le dépôt
[lmar116/PyreneesBumblebees](https://github.com/lmar116/PyreneesBumblebees) (dossier `Data/`).

**Licence** : le dépôt des auteurs ne précise pas de licence. Les fichiers sont conservés ici, sans
modification, pour rendre l'analyse reproductible dans un cadre pédagogique, avec citation de
l'article. Pour une autre utilisation, se référer aux auteurs. Si un fichier manque, la fonction
`bumblebees.data.download_raw_data()` le télécharge depuis la source.

Les corrections (colonnes inversées, toponymes) sont faites à la lecture par le package
`bumblebees` ; les fichiers bruts ne sont jamais modifiés.

## `raw/Regional_Trend_Temps.csv` — climat

Températures **annuelles** modélisées par le logiciel ClimateEU (v4.63, d'après CRU-TS) pour
177 cellules de 1 km² situées dans un rayon de 10 km autour des relevés, de 1901 à 2009
(19 293 lignes = 177 cellules × 109 ans). Les auteurs signalent une incertitude plus forte
avant 1950.

| Colonne | Description |
|---|---|
| `Year` | Année (1901-2009) |
| `Grid-ID` | Numéro de **ligne** (unique sur tout le fichier), et non identifiant de cellule |
| `Latitude`, `Longitude` | Centre de la cellule (WGS 84), identifiant réel de la cellule |
| `Elevation` | Altitude moyenne de la cellule (m), de 1 024 à 2 190 m |
| `AnnualMeanTemp` | Température moyenne annuelle (°C) |
| `Avg_min` | Moyenne des températures **maximales** (°C) : étiquette inversée dans la source |
| `Avg_max` | Moyenne des températures **minimales** (°C) : étiquette inversée dans la source |

## `raw/Regional_LandUse.csv` — occupation du sol

Reconstitution historique HILDA de l'occupation du sol par décennie, pour 198 cellules de 1 km².

| Colonne | Description |
|---|---|
| `Grid_ID` | Identifiant de cellule |
| `Avg_Ele` | Altitude moyenne de la cellule (m) |
| `LU1910` … `LU2010` | Occupation du sol de la décennie : 333 = forêt, 444 = prairie, 555 = autre (roche, neige, sol nu) |
| `EleZone` | Zone d'altitude : `z1` montagnard (1 000-1 400 m, 18 cellules), `z2` subalpin (1 400-1 800 m, 54), `z3` alpin (1 800-2 200 m, 126) |

## `raw/Bumblebee_data_climate_Marshall_et_al_2020.csv` — bourdons

854 observations de bourdons sur des fleurs : 286 en août 1889 (Julius MacLeod) et 568 en août
2005 et 2006 (équipe de Koos Biesmeijer). Le fichier ne contient que les **12 espèces observées
aux deux périodes**.

| Colonne | Description |
|---|---|
| `Longitude`, `Latitude` | Position du relevé (approximative pour 1889 : lieu-dit) |
| `Visitor` | Espèce de bourdon (*Bombus*) |
| `Plant` | Plante visitée (83 espèces) |
| `Date` | Date du relevé (jour/mois/année) |
| `Site` | Lieu-dit (1889) ou code de parcelle `Pxxx` (2005-06) |
| `Data` | Inventaire : `MacLeod` (1889) ou `Biesmeijer` (2005-06) |
| `MinEle`, `MaxEle` | Altitude du relevé (m) ; identiques sur 99,9 % des lignes |
| `EleZone` | Tranche d'altitude de 200 m (`1000-1200` … `2000-2200`) |
| `clim` | Température moyenne d'août (°C) au point d'observation, modélisée sur 1901-1910 pour 1889 et sur 2001-2010 pour 2005-06 |

Le fichier source contient le caractère de remplacement `�` à la place de lettres accentuées
dans trois toponymes. Ils sont restaurés à la lecture : *Héas*, *Saugué*, *Brèche de Roland*.
