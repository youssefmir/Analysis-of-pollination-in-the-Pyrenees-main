"""Régénère ``docs/data.js`` à partir des données brutes et du package ``bumblebees``.

Usage : python scripts/build_site_data.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from bumblebees.site import write_site_data  # noqa: E402

if __name__ == "__main__":
    path = write_site_data()
    print(f"Données du site écrites dans {path}")
