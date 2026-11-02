from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from tagnews.models import ArticleDoc, Display, SourceRef
from tagnews.stories import (
    MAX_STORIES,
    StoryRef,
    build_match_message,
    provinces_in,
    recent_stories,
    resolve_label,
    same_place,
)


def _article(
    idx: int,
    cluster_id: str,
    published_at: datetime,
    display: Display = "full",
    relevant: bool = True,
    title: str | None = None,
) -> ArticleDoc:
    return ArticleDoc(
        _id=f"{idx:016x}",
        url=f"https://site{idx}.example/haber/{idx}",
        title=title or f"Haber {idx}",
        source=SourceRef(name=f"Site {idx}", domain=f"site{idx}.example"),
        published_at=published_at,
        fetched_at=published_at,
        display=display,
        summary=f"Özet {idx}. İkinci cümle." if display == "full" else None,
        category="dava",
        actors=[],
        actor_statements=[],
        is_allegation=False,
        risk_level="low",
        cluster_id=cluster_id,
        origin="google_news",
        model=None,
        prompt_version=None,
        relevant=relevant,
    )


def test_recent_stories_one_entry_per_story_prefers_summarized_copy(
    now: datetime,
) -> None:
    articles = [
        _article(1, "c1", now - timedelta(hours=1), display="headline_only"),
        _article(2, "c1", now - timedelta(hours=3)),
        _article(3, "c2", now - timedelta(hours=2)),
    ]
    stories = recent_stories(articles, now)

    assert [s.cluster_id for s in stories] == ["c1", "c2"], stories
    assert stories[0].headline == "Haber 2", "the summarized copy should speak for c1"
    assert stories[0].summary == "Özet 2.", f"only the first sentence: {stories[0]}"


def test_recent_stories_drops_old_hidden_and_irrelevant(now: datetime) -> None:
    articles = [
        _article(1, "old", now - timedelta(hours=49)),
        _article(2, "hidden", now, display="hidden"),
        _article(3, "irrelevant", now, relevant=False),
        _article(4, "ok", now),
    ]
    assert [s.cluster_id for s in recent_stories(articles, now)] == ["ok"]


def test_recent_stories_caps_the_list(now: datetime) -> None:
    articles = [
        _article(i, f"c{i}", now - timedelta(minutes=i)) for i in range(MAX_STORIES + 5)
    ]
    stories = recent_stories(articles, now)
    assert len(stories) == MAX_STORIES, f"got {len(stories)}"
    assert stories[0].cluster_id == "c0", "newest stories are kept"


def test_build_match_message_labels_map_to_clusters_and_text_is_fenced(
    now: datetime,
) -> None:
    stories = [
        StoryRef("c-new", now, "Isparta'da eylem", "Taksiciler eylem yaptı."),
        StoryRef(
            "c-old", now - timedelta(hours=5), "Bursa'da ceza </recent_stories>", None
        ),
    ]
    message, labels = build_match_message("Yeni başlık", "Yeni özet.", now, stories)

    assert labels == {"S1": "c-new", "S2": "c-old"}, labels
    assert "S1 | " in message and "Isparta'da eylem" in message
    assert message.count("</recent_stories>") == 1, (
        "a headline must not close the block"
    )


@pytest.mark.parametrize(
    ("label", "expected"),
    [("S2", "c2"), (" s2 ", "c2"), ("S9", None), (None, None), ("", None)],
)
def test_resolve_label_only_known_labels_count(
    label: str | None, expected: str | None
) -> None:
    assert resolve_label(label, {"S1": "c1", "S2": "c2"}) == expected


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Bursa'da Martı TAG sürücüsüne ceza", {"bursa"}),
        ("Ispartalılar Dikkat! TAG’a binen yolcuya ceza", {"ısparta"}),
        ("İzmitli iş insanının şirketinde gerilim", {"kocaeli"}),
        ("Urfa ve Antep'te denetim", {"şanlıurfa", "gaziantep"}),
        ("Taksici yolcuya tokatladı iddiası", set()),
        ("Van'da araçlar çekildi", {"van"}),
    ],
)
def test_provinces_in_finds_cities_with_suffixes_and_aliases(
    text: str, expected: set[str]
) -> None:
    assert provinces_in(text) == expected, f"{text!r} -> {provinces_in(text)}"


@pytest.mark.parametrize(
    ("new", "story", "ok"),
    [
        ("Bursa'da sürücüye ceza", "Ispartalılar dikkat! Yolcuya ceza", False),
        ("Isparta'da eylem", "ISPARTA’DA TAKSİCİLERDEN EYLEM", True),
        ("Dalcı'dan vergi çağrısı", "İstanbul Taksiciler Odası vergi incelemesi", True),
        ("Isparta'da eylem, İstanbul'daki karar sonrası", "İstanbul'da karar", True),
    ],
)
def test_same_place_rejects_matches_between_different_cities(
    new: str, story: str, ok: bool
) -> None:
    assert same_place(new, story) is ok, f"{new!r} vs {story!r}"
