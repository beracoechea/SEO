from app.parse import (
    assert_public_http_url,
    canonical_matches,
    count_sitemap_locs,
    extract_locs,
    is_sitemap_index,
    parse_html,
    parse_robots_disallow,
    parse_robots_sitemaps,
    robots_blocks,
)
from app.score import score_url, site_score


def test_parse_html_core_tags():
    html = """
    <html><head>
      <title> Home </title>
      <meta name="description" content="Logicbus shop">
      <link rel="canonical" href="https://www.logicbus.com.mx/">
    </head><body>
      <h1>Bienvenido</h1>
      <a href="/blog">Blog</a>
      <a href="https://www.logicbus.com.mx/tienda">Tienda</a>
      <img src="a.png"><img alt="ok" src="b.png">
    </body></html>
    """
    p = parse_html(html)
    assert p["title"] == "Home"
    assert p["h1"] == "Bienvenido"
    assert p["meta"] == "Logicbus shop"
    assert p["canonical"] == "https://www.logicbus.com.mx/"
    assert p["imgs"] == 2
    assert p["imgs_no_alt"] == 1
    assert "/blog" in p["links"]
    assert "https://www.logicbus.com.mx/tienda" in p["links"]


def test_robots_and_sitemap_count():
    maps = parse_robots_sitemaps("https://ex.com", "User-agent: *\nSitemap: /sitemap.xml\n")
    assert maps == ["https://ex.com/sitemap.xml"]
    xml = "<urlset><loc>https://ex.com/a</loc><loc>https://ex.com/b</loc></urlset>"
    assert count_sitemap_locs(xml) == 2
    assert extract_locs(xml) == ["https://ex.com/a", "https://ex.com/b"]
    assert is_sitemap_index("<sitemapindex><sitemap><loc>x</loc></sitemap></sitemapindex>")


def test_robots_disallow():
    body = "User-agent: *\nDisallow: /admin\nDisallow: /cart\n"
    rules = parse_robots_disallow(body)
    assert robots_blocks("/admin/users", rules)
    assert not robots_blocks("/blog", rules)


def test_canonical_match():
    assert canonical_matches("https://ex.com/a", "https://ex.com/a")
    assert not canonical_matches("https://ex.com/a", "https://ex.com/b")


def test_private_origin_blocked():
    for bad in ("http://127.0.0.1/", "http://192.168.1.10/", "http://localhost/"):
        try:
            assert_public_http_url(bad)
            raise AssertionError(bad)
        except ValueError:
            pass


def test_score_http_and_onpage():
    sc, issues = score_url(200, "t", "h", "m")
    assert sc == 100
    assert issues == []
    sc, issues = score_url(404, "", "", "", onpage=True)
    assert "http4xx" in issues
    assert sc < 50
    robots, _ = score_url(200, "", "", "", onpage=False)
    assert robots == 100
    _, extra = score_url(200, "t", "h", "m", canonical_ok=False, has_canonical=True, ms=2500)
    assert "canonical" in extra
    assert "slow" in extra


def test_site_score_weights_home():
    assert site_score([(100, 0), (0, 8)]) > 50
