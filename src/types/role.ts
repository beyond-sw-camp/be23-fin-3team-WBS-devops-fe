/** 권한 마스터 (PermissionResDto) */
export interface Permission {
  id: string;           // UUID
  resource: string;     // e.g. "USER", "INBOUND", "OUTBOUND"
  action: string;       // e.g. "CREATE", "READ", "UPDATE", "DELETE"
  description: string;
}

/** 역할 (RoleResDto) */
export interface Role {
  id: string;           // UUID
  name: string;
  code: string;         // e.g. "ADMIN", "MANAGER"
  description: string;
  system: boolean;      // Lombok boolean isSystem → JSON "system"
  active: boolean;      // Lombok boolean isActive → JSON "active"
  permissions: Permission[];
}

/** POST /admin/roles 요청 (RoleCreateReqDto) */
export interface CreateRoleRequest {
  name: string;
  code: string;         // Pattern: ^[A-Z][A-Z0-9_]*$
  description?: string;
  permissionIds: string[];
}

/** PATCH /admin/roles/{id} 요청 (RoleUpdateReqDto) */
export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  permissionIds?: string[];
}
