"""Create MongoDB indexes and print the Atlas user setup.

Usage: uv run python scripts/init_db.py  (same as `python -m tagnews init-db`)
"""

import sys

from tagnews.cli import main

if __name__ == "__main__":
    sys.exit(main(["init-db"]))
