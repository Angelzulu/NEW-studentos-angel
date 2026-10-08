/**
 * middleware/auth.js
 * Server-side guards for every /admin/* route.
 *
 * requireLogin  — blocks unauthenticated access, redirects to /admin/login
 * requireOwner  — blocks staff accounts from owner-only actions (403)
 */

// Never allow a browser, proxy, or back/forward cache to replay an admin page.
// Authentication is checked on every request on the server.
function noStore(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

function requireLogin(req, res, next) {
  noStore(res);

  const user = req.session && req.session.adminUser;

  // Only a complete, server-created identity counts as authenticated.
  if (
    user &&
    typeof user === "object" &&
    typeof user.id === "string" &&
    typeof user.username === "string" &&
    (user.role === "owner" || user.role === "staff")
  ) {
    res.locals.adminUser = user;
    return next();
  }

  // Remove any malformed/stale identity so it cannot be reused.
  if (req.session && req.session.adminUser) {
    req.session.adminUser = null;
  }

  if (req.session) {
    req.session.returnTo = req.originalUrl;
    return req.session.save(() => res.redirect("/admin/login"));
  }

  return res.redirect("/admin/login");
}

function requireOwner(req, res, next) {
  noStore(res);

  if (
    req.session &&
    req.session.adminUser &&
    typeof req.session.adminUser === "object" &&
    req.session.adminUser.role === "owner"
  ) {
    return next();
  }

  res.status(403).render("admin/403", {
    title:     "Access Denied",
    activeNav: "",
  });
}

module.exports = { requireLogin, requireOwner };
