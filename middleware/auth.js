/**
 * middleware/auth.js
 * Server-side guards for every /admin/* route.
 *
 * requireLogin  — blocks unauthenticated access, redirects to /admin/login
 * requireOwner  — blocks staff accounts from owner-only actions (403)
 */

function requireLogin(req, res, next) {
  if (req.session && req.session.adminUser) {
    // Attach user to res.locals so every EJS view can use it
    res.locals.adminUser = req.session.adminUser;
    return next();
  }
  // Remember where the user was trying to go
  req.session.returnTo = req.originalUrl;
  res.redirect("/admin/login");
}

function requireOwner(req, res, next) {
  if (req.session && req.session.adminUser && req.session.adminUser.role === "owner") {
    return next();
  }
  res.status(403).render("admin/403", {
    title:     "Access Denied",
    activeNav: "",
  });
}

module.exports = { requireLogin, requireOwner };
