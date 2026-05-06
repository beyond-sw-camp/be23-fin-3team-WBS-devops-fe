export type AppRole = 'DEVELOPER' | 'ADMIN' | 'MANAGER' | 'OPERATOR';

export type PermissionAction = 'read' | 'create' | 'update' | 'delete';

export type PermissionDomain =
  | 'USER_MGMT'
  | 'ITEM_MASTER'
  | 'INBOUND'
  | 'OUTBOUND'
  | 'PICKING_LIST'
  | 'STOCK_VIEW'
  | 'STOCK_AUDIT'
  | 'STOCK_ADJUST';

export type PermissionMatrix = Record<PermissionDomain, Record<PermissionAction, boolean>>;
