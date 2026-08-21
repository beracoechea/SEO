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
