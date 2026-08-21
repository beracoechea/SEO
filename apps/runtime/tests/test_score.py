from app.score import classify_issues, score_url


def test_single_hop_is_redirect_warning():
    score, issues = score_url(200, "Home page title", "Home", "desc", hops=1)
    assert "redirect" in issues
    assert "redirects" not in issues
    assert classify_issues(issues) == "warn"
    assert score < 100


def test_chain_keeps_redirects_issue():
    _score, issues = score_url(200, "Home page title", "Home", "desc", hops=3)
    assert "redirect" in issues
    assert "redirects" in issues


def test_nofollow_is_warning():
    _score, issues = score_url(200, "Home page title", "Home", "desc", nofollow=True)
    assert "nofollow" in issues
    assert classify_issues(issues) == "warn"


def test_timeout_is_not_server_500():
    score, issues = score_url(0, "Home page title", "Home", "desc")
    assert "unreachable" in issues
    assert "http5xx" not in issues
    assert classify_issues(issues) == "warn"
    assert score > 50
    _score, hard = score_url(503, "Home page title", "Home", "desc")
    assert "http5xx" in hard
    assert classify_issues(hard) == "critical"
