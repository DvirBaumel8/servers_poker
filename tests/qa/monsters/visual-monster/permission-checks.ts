/**
 * Permission Checks
 *
 * Defines what UI elements should be visible/hidden for different user roles.
 * Used by Visual Monster to catch permission bugs in the UI.
 */

export interface PermissionCheck {
  name: string;
  page: string;
  asRole: "guest" | "user" | "admin";
  shouldNotFind?: string[];
  shouldFind?: string[];
  expectRedirect?: boolean;
  redirectTo?: string;
}

export const PERMISSION_CHECKS: PermissionCheck[] = [
  // ============================================================================
  // GUEST CHECKS - Unauthenticated users
  // ============================================================================
  {
    name: "Guest cannot see Create Bot button",
    page: "/bots",
    asRole: "guest",
    shouldNotFind: ["Create bot", "Create Bot", "Add bot", "Add Bot"],
    shouldFind: ["Bot Directory", "Bot", "Bots"],
  },
  {
    name: "Guest redirected from Bot Builder",
    page: "/bots/build",
    asRole: "guest",
    expectRedirect: true,
    redirectTo: "/login",
  },
  {
    name: "Guest cannot see Create Tournament button",
    page: "/tournaments",
    asRole: "guest",
    shouldNotFind: ["Create tournament", "Create Tournament"],
    shouldFind: ["Tournament", "Tournaments"],
  },
  {
    name: "Guest cannot see Create Table button",
    page: "/tables",
    asRole: "guest",
    shouldNotFind: ["Create table", "Create Table"],
  },
  {
    name: "Guest redirected from Profile",
    page: "/profile",
    asRole: "guest",
    expectRedirect: true,
    redirectTo: "/login",
  },
  {
    name: "Guest redirected from Admin Tournaments",
    page: "/admin/tournaments",
    asRole: "guest",
    expectRedirect: true,
  },

  // ============================================================================
  // USER CHECKS - Regular authenticated users
  // ============================================================================
  {
    name: "User can see Create Bot button",
    page: "/bots",
    asRole: "user",
    shouldFind: ["Create bot"],
    shouldNotFind: [],
  },
  {
    name: "User can access Bot Builder",
    page: "/bots/build",
    asRole: "user",
    shouldFind: [],
    expectRedirect: false,
  },
  {
    name: "User cannot see Create Tournament button",
    page: "/tournaments",
    asRole: "user",
    shouldNotFind: ["Create tournament", "Create Tournament"],
    shouldFind: ["Tournament", "Tournaments"],
  },
  {
    name: "User cannot see Create Table button",
    page: "/tables",
    asRole: "user",
    shouldNotFind: ["Create table", "Create Table"],
  },
  {
    name: "User redirected from Admin Tournaments",
    page: "/admin/tournaments",
    asRole: "user",
    expectRedirect: true,
  },
  {
    name: "User redirected from Admin Analytics",
    page: "/admin/analytics",
    asRole: "user",
    expectRedirect: true,
  },
  {
    name: "User can access Profile",
    page: "/profile",
    asRole: "user",
    shouldFind: ["Profile"],
    expectRedirect: false,
  },

  // ============================================================================
  // ADMIN CHECKS - Admin users
  // ============================================================================
  {
    name: "Admin can see Create Tournament button",
    page: "/tournaments",
    asRole: "admin",
    shouldFind: ["Create tournament"],
  },
  {
    name: "Admin can see Create Table button",
    page: "/tables",
    asRole: "admin",
    shouldFind: ["Create table"],
  },
  {
    name: "Admin can access Admin Tournaments",
    page: "/admin/tournaments",
    asRole: "admin",
    expectRedirect: false,
    shouldFind: ["Tournament", "Admin"],
  },
  {
    name: "Admin can access Admin Analytics",
    page: "/admin/analytics",
    asRole: "admin",
    expectRedirect: false,
    shouldFind: ["Analytics", "Admin"],
  },
];

/**
 * Get checks for a specific role
 */
export function getChecksForRole(
  role: "guest" | "user" | "admin",
): PermissionCheck[] {
  return PERMISSION_CHECKS.filter((check) => check.asRole === role);
}

/**
 * Get all pages that need to be tested
 */
export function getPagesToTest(): string[] {
  return [...new Set(PERMISSION_CHECKS.map((check) => check.page))];
}
