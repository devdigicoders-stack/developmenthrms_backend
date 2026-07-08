/** Permissions reserved for super_admin — never exposed in role UI or assignable to other roles */
export const SUPER_ADMIN_ONLY_PERMISSIONS = [
    "Create_COMPANY",
    "UPDATE_COMPANY",
    "DELETE_COMPANY",
    "VIEW_COMPANY",
    "VIEW_ALL_COMPANIES",
];

export const stripSuperAdminOnlyPermissions = (permissions = []) =>
    permissions.filter((p) => !SUPER_ADMIN_ONLY_PERMISSIONS.includes(p));
