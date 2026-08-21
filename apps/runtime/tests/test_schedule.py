from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.db import connect, init_db
from app.main import app
from app.schedule import add_interval, enqueue, enqueue_due, normalize_interval, pop_next, replace_sites, snapshot


def test_interval_math():
    start = datetime(2026, 8, 21, tzinfo=timezone.utc)
    assert add_interval(start, "day") == start + timedelta(days=1)
    assert add_interval(start, "3days") == start + timedelta(days=3)
    assert add_interval(start, "week") == start + timedelta(days=7)
    assert add_interval(start, "month") == start + timedelta(days=30)
    assert add_interval(start, "off") is None
    assert normalize_interval("nope") == "off"


def test_queue_and_schedule_due(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ALLOW_ANON", "1")
    monkeypatch.setenv("CRAWL_NO_DELAY", "1")
    init_db()
    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    replace_sites(
        [
            {
                "id": "a",
                "origin": "https://www.example.com",
                "scanEvery": "day",
                "maxPages": 10,
            }
        ]
    )
    con = connect()
    con.execute("UPDATE site_jobs SET next_run_at=? WHERE site_id='a'", (past,))
    con.commit()
    con.close()
    due = enqueue_due()
    assert due == ["a"]
    assert enqueue("a", "manual") is False
    snap = snapshot()
    assert len(snap["queue"]) == 1
    job = pop_next()
    assert job is not None
    assert job["site_id"] == "a"
    assert job["origin"] == "https://www.example.com"
    assert pop_next() is None


def test_queue_reorder_cancel_and_preempt(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ALLOW_ANON", "1")
    monkeypatch.setenv("CRAWL_NO_DELAY", "1")
    init_db()
    replace_sites(
        [
            {"id": "a", "origin": "https://www.example.com", "scanEvery": "off"},
            {"id": "b", "origin": "https://www.example.org", "scanEvery": "off"},
            {"id": "c", "origin": "https://www.example.net", "scanEvery": "off"},
        ]
    )
    from app.schedule import dequeue, enqueue, preempt, queued_ids, reorder

    assert enqueue("a") and enqueue("b") and enqueue("c")
    assert queued_ids() == ["a", "b", "c"]
    assert reorder(["c", "a", "b"]) == ["c", "a", "b"]
    assert queued_ids() == ["c", "a", "b"]
    assert dequeue("a") is True
    assert queued_ids() == ["c", "b"]
    assert preempt("b", "running") is True
    assert queued_ids() == ["b", "running", "c"]


def test_queue_api(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ALLOW_ANON", "1")
    monkeypatch.setenv("CRAWL_NO_DELAY", "1")
    init_db()
    with TestClient(app) as client:
        client.put(
            "/api/schedule",
            json={
                "sites": [
                    {"id": "a", "origin": "https://www.example.com", "scanEvery": "off"},
                    {"id": "b", "origin": "https://www.example.org", "scanEvery": "off"},
                ]
            },
        )
        from app.schedule import enqueue

        enqueue("a")
        enqueue("b")
        moved = client.post("/api/queue/reorder", json={"siteIds": ["b", "a"]})
        assert moved.status_code == 200, moved.text
        assert [q["site_id"] for q in moved.json()["queue"]] == ["b", "a"]
        gone = client.delete("/api/queue/b")
        assert gone.status_code == 200
        assert [q["site_id"] for q in gone.json()["queue"]] == ["a"]


def test_schedule_put_and_queue_via_api(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ALLOW_ANON", "1")
    monkeypatch.setenv("CRAWL_NO_DELAY", "1")
    init_db()
    with TestClient(app) as client:
        res = client.put(
            "/api/schedule",
            json={
                "sites": [
                    {
                        "id": "shop",
                        "origin": "https://www.example.com",
                        "scanEvery": "week",
                        "maxPages": 5,
                    }
                ]
            },
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["schedules"]["shop"]["interval"] == "week"
        overview = client.get("/api/sites").json()
        assert "queue" in overview
        assert "schedules" in overview
