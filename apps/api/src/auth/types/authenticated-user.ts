export interface AuthenticatedUser {
  userId: string;
  email: string;
  name: string;
  companyId: string;
  roles: string[];
  permissions: string[];
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  name: string;
  companyId: string;
  roles: string[];
  permissions: string[];
}
