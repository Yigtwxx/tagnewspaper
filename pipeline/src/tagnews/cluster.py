"""Group headlines about the same story across outlets."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from rapidfuzz import fuzz

from tagnews.textnorm import normalize_for_match

WINDOW = timedelta(hours=48)
THRESHOLD = 72.0
MIN_TOKENS = 4


@dataclass(frozen=True)
class ClusterItem:
    id: str
    title: str
    published_at: datetime
    cluster_id: str | None = None


def similarity(a: str, b: str) -> float:
    """Order-insensitive similarity that does not reward one title being a subset."""
    norm_a, norm_b = normalize_for_match(a), normalize_for_match(b)
    if len(norm_a.split()) < MIN_TOKENS or len(norm_b.split()) < MIN_TOKENS:
        return fuzz.ratio(norm_a, norm_b)
    return fuzz.token_sort_ratio(norm_a, norm_b)


def assign_clusters(
    new_items: list[ClusterItem], existing: list[ClusterItem]
) -> dict[str, str]:
    """Return cluster ids for `new_items`; existing items already carry theirs."""
    pool: list[ClusterItem] = [item for item in existing if item.cluster_id]
    assigned: dict[str, str] = {}
    for item in sorted(new_items, key=lambda i: i.published_at):
        best_score = 0.0
        best_cluster: str | None = None
        for other in pool:
            if abs(other.published_at - item.published_at) > WINDOW:
                continue
            score = similarity(item.title, other.title)
            if score > best_score:
                best_score, best_cluster = score, other.cluster_id
        cluster_id = (
            best_cluster if best_cluster and best_score >= THRESHOLD else f"c{item.id}"
        )
        assigned[item.id] = cluster_id
        pool.append(
            ClusterItem(
                id=item.id,
                title=item.title,
                published_at=item.published_at,
                cluster_id=cluster_id,
            )
        )
    return assigned
