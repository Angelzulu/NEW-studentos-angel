/**
 * adminUsers.js
 * Server-side admin account definitions.
 * Passwords are bcrypt hashes — plain-text passwords are never stored here.
 *
 * Roles:
 *   owner — full access to every route and action
 *   staff — read-only dashboard + content views; cannot delete or change settings
 *
 * To add more accounts later, generate a hash with:
 *   node -e "require('bcryptjs').hash('YOUR_PASSWORD',12).then(h=>console.log(h))"
 * and set ADMIN_PASSWORD_HASH in your environment variables (never commit it).
 */

if (!process.env.ADMIN_PASSWORD_HASH) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_PASSWORD_HASH environment variable is required in production.");
  } else {
    console.warn(
      "[adminUsers] WARNING: ADMIN_PASSWORD_HASH is not set. " +
      "Admin login will not work until you set this env var.\n" +
      "Generate one with: node -e \"require('bcryptjs').hash('YOUR_PASSWORD',12).then(h=>console.log(h))\""
    );
  }
}

const ADMIN_USERS = [
  {
    id:           "1",
    username:     "angelzm",
    passwordHash: process.env.ADMIN_PASSWORD_HASH || "",
    role:         "owner",   // owner | staff
    displayName:  "Angel",
  },
];

module.exports = ADMIN_USERS;
