from app.indexation import diff_rows, robots_directives, url_key


def test_robots_header_and_meta():
    noindex, nofollow = robots_directives("noindex, nofollow", "")
    assert noindex and nofollow
    noindex, nofollow = robots_directives("", "googlebot: noindex")
    assert noindex and not nofollow


def test_url_key_strips_slash():
    assert url_key("https://Ex.com/a/") == url_key("https://ex.com/a")


def test_diff_new_404_and_title():
    prev = [{"url": "https://ex.com/a", "status": 200, "title": "Old", "issues": "", "fetched": 1}]
    cur = [{"url": "https://ex.com/a", "status": 404, "title": "Old", "issues": "http4xx", "fetched": 1}]
    out = diff_rows(cur, prev)
    assert out["counts"]["new_404"] == 1
    assert out["counts"]["title_changed"] == 0

    cur2 = [{"url": "https://ex.com/a", "status": 200, "title": "New", "issues": "", "fetched": 1}]
    prev2 = [{"url": "https://ex.com/a", "status": 200, "title": "Old", "issues": "", "fetched": 1}]
    out2 = diff_rows(cur2, prev2)
    assert out2["counts"]["title_changed"] == 1
