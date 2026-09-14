// YaFormFiller — form domain-matching logic (shared: background / inpage-bar / tests)
// Classic-script-compatible: no exports, exposes globalThis.YAFDomains.
// Also used as an ES module in Node tests (assigning to globalThis works in both contexts).
(function () {
  // Pattern: "example.com"        → valid for http/https on *.example.com (subdomains including apex), any port, any path
  //          "example.com/app"    → valid for http/https on *.example.com, any port, only paths starting with /app
  //          "example.com:8443"   → port 8443 only (optional explicit port support)
  //          https:// / *.example.com accepted as input syntax
  // location: URL (standard URL object). pattern: string.
  function domainMatches(location, pattern) {
    try {
      if (location.protocol !== "http:" && location.protocol !== "https:") return false;
      let pat = pattern.trim().toLowerCase();
      if (!pat) return true; // empty pattern → valid everywhere
      pat = pat.replace(/^https?:\/\//, "");
      // split host[:port] and path prefix
      const noScheme = pat.split("/");
      const hostPort = noScheme[0];
      const pathPrefix = "/" + noScheme.slice(1).filter((s) => s !== "").join("/").replace(/\/+$/, "");
      // path required? (if the pattern was only the domain, pathPrefix = "/" → matches everything)
      const requirePath = noScheme.length > 1 && noScheme.slice(1).some((s) => s !== "");
      const pagePath = location.pathname || "/";
      if (requirePath) {
        const expected = pathPrefix === "/" ? "/" : pathPrefix;
        const under = pagePath === expected || pagePath.startsWith(expected.endsWith("/") ? expected : expected + "/");
        if (!under) return false;
      }
      // host: apex or subdomain
      let wantHost = hostPort;
      let wantPort = null;
      const m = hostPort.match(/^([^:]+)(?::(\d+))?$/);
      if (m) {
        wantHost = m[1];
        wantPort = m[2] ?? null;
      }
      wantHost = wantHost.replace(/^\*\./, ""); // "*.example.com" treated as example.com
      const pageHost = location.hostname.toLowerCase();
      if (pageHost !== wantHost && !pageHost.endsWith("." + wantHost)) return false;
      if (wantPort != null) {
        const pagePort = location.port || (location.protocol === "https:" ? "443" : "80");
        if (pagePort !== wantPort) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  // Domains within the same form are evaluated in OR: the form is valid for the page if AT LEAST ONE
  // of its domains (or all of them, given the some() logic) matches; a form without domains is valid everywhere.
  function formsForUrl(forms, url) {
    let loc = url;
    if (typeof url === "string") {
      try { loc = new URL(url); } catch { return []; }
    }
    return (forms ?? []).filter(
      (f) => !(f.domains?.length) || f.domains.some((d) => domainMatches(loc, d))
    );
  }

  function anyFormMatchesUrl(forms, url) {
    return formsForUrl(forms, url).length > 0;
  }

  globalThis.YAFDomains = { domainMatches, formsForUrl, anyFormMatchesUrl };
})();
