export interface SessionUser {
  id: string;
  email: string;
  companyId: string;
  roles: string[];
  permissions: string[];
  name?: string;
}

export function hasPermission(user: SessionUser | null | undefined, permission: string): boolean {
  return Boolean(user?.permissions.includes(permission));
}
