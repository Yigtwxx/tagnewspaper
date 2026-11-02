from __future__ import annotations

from datetime import datetime, timedelta

from tagnews.cluster import ClusterItem, assign_clusters
from tagnews.decode import decode_urls


def test_decode_urls_mixed_results_respects_cap() -> None:
    urls = [f"https://news.google.com/rss/articles/{i}" for i in range(5)]

    def fake(batch: list[str]) -> list[dict[str, object]]:
        out: list[dict[str, object]] = []
        for url in batch:
            if url.endswith("1"):
                out.append({"success": False, "message": "no signature"})
            else:
                out.append(
                    {
                        "success": True,
                        "decoded_url": url.replace("news.google.com", "pub"),
                    }
                )
        return out

    outcome = decode_urls(urls, fake, max_decodes=4)
    assert len(outcome.decoded) == 3
    assert outcome.failed == {urls[1]}
    assert outcome.deferred == {urls[4]}


def test_decode_urls_rate_limited_defers_all() -> None:
    urls = [f"https://news.google.com/rss/articles/{i}" for i in range(15)]

    def limited(batch: list[str]) -> list[dict[str, object]]:
        return [
            {"success": False, "message": "HTTP 429 Too Many Requests"} for _ in batch
        ]

    outcome = decode_urls(urls, limited, max_decodes=40)
    assert not outcome.decoded
    assert outcome.deferred == set(urls)


def test_decode_urls_decoder_exception_defers_batch() -> None:
    def broken(batch: list[str]) -> list[dict[str, object]]:
        raise RuntimeError("network down")

    outcome = decode_urls(["https://news.google.com/a"], broken, max_decodes=5)
    assert outcome.deferred == {"https://news.google.com/a"}


def test_assign_clusters_same_story_within_48h_shares_cluster(now: datetime) -> None:
    existing = [
        ClusterItem(
            id="a",
            title="İstinaf mahkemesi Martı TAG davasında ilk derece kararını kaldırdı",
            published_at=now - timedelta(hours=5),
            cluster_id="ca",
        )
    ]
    new = [
        ClusterItem(
            id="b",
            title="Martı TAG davasında istinaf mahkemesi ilk derece kararını kaldırdı",
            published_at=now,
        ),
        ClusterItem(
            id="c",
            title="Taksiciler odası Martı TAG için vergi incelemesi istedi",
            published_at=now,
        ),
        ClusterItem(
            id="d",
            title="İstinaf mahkemesi Martı TAG davasında ilk derece kararını kaldırdı",
            published_at=now + timedelta(days=5),
        ),
    ]
    clusters = assign_clusters(new, existing)
    assert clusters["b"] == "ca"
    assert clusters["c"] == "cc"
    assert clusters["d"] == "cd"  # same words but outside the 48h window
