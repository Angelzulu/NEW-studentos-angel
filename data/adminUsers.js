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
 * and add an entry to the array below.
 */

const ADMIN_USERS = [
  {
    id:           "1",
    username:     "angelzm",
    // bcrypt hash of: angelzulu@2008
    passwordHash: process.env.ADMIN_PASSWORD_HASH ||
      "$2b$12$L0HVlsRMkupk5.KWz/zQP.26MELkxV.9vwuwna2W1Ge3U.VW31o4O",
    role:         "owner",          // owner | staff
    displayName:  "Angel",
  },
];

module.exports = ADMIN_USERS;
