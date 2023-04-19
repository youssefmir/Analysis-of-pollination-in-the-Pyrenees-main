from bumblebees import data


def test_climate_columns_are_fixed():
    climate = data.load_climate()
    # 177 cellules × 109 années, minimum toujours inférieur au maximum après correction
    assert climate["cell_id"].nunique() == 177
    assert climate.groupby("cell_id")["year"].nunique().eq(109).all()
    assert (climate["t_min"] < climate["t_max"]).all()


def test_raw_climate_checks_reveal_both_anomalies():
    checks = data.climate_checks(data.load_raw("climate"))
    assert checks["n_grid_ids"] == checks["n_rows"]  # Grid-ID numérote les lignes
    assert checks["share_min_above_max"] == 1.0  # colonnes min/max inversées


def test_site_names_have_no_replacement_character():
    bees = data.load_bumblebees()
    assert not bees["site"].str.contains("�").any()
    assert {"Héas", "Saugué"} <= set(bees["site"])


def test_bumblebee_periods_and_elevation():
    bees = data.load_bumblebees()
    assert bees["period"].value_counts().to_dict() == {"2005-06": 568, "1889": 286}
    assert bees["elevation"].between(1000, 2215).all()


def test_short_name():
    assert data.short_name("Bombus wurflenii") == "B. wurflenii"
    assert data.short_name("Bombus terrestris complex") == "B. terrestris complex"
