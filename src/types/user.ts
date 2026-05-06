/** GET /account-service/admin/users 목록용 (UserListResDto) */
export interface UserListItem {
  id: string;           // UUID
  name: string;
  loginId: string;
  email: string | null;
  roleId: string | null;
  roleCode: string | null;
  roleName: string | null;
}

/** GET /account-service/user/myinfo 또는 /admin/users/{id} 상세 (UserDetailResDto)
 *  developer 계정의 경우 roleId/roleCode/roleName이 null로 내려옴 (별도 isDeveloper 플래그 사용) */
export interface User {
  id: string;           // UUID
  name: string;
  loginId: string;
  email: string | null;
  phone: string | null;
  active: boolean;      // Lombok @Data boolean isActive → JSON "active"
  roleId: string | null;
  roleCode: string | null;
  roleName: string | null;
  /** 프론트에서 JWT 디코딩으로 주입 — 응답에는 포함되지 않음 */
  isDeveloper?: boolean;
  /** /user/myinfo 응답의 permissions (예: ["INBOUND:CREATE", "MASTER:READ"]) */
  permissions?: string[];
}

export interface LoginRequest {
  loginId: string;
  password: string;
}

/** 로그인 응답 (UserLoginResDto) */
export interface LoginTokenResponse {
  accessToken: string;
  refreshToken: string;
}

/** 로그인 후 /user/myinfo로 조회한 사용자 정보 */
export type LoginUser = User;

/** POST /account-service/admin/users 요청 (UserCreateReqDto) */
export interface CreateUserRequest {
  name: string;
  loginId: string;
  email?: string;
  phone?: string;
  password: string;
  roleId: string;       // UUID (required)
}

/** PATCH /account-service/admin/users/{id} 요청 (UserUpdateReqDto) */
export interface UpdateUserRequest {
  name?: string;
  email?: string;
  phone?: string;
  roleId?: string;      // UUID
}

/** PATCH /account-service/user/myinfo 요청 (MyInfoUpdateReqDto) */
export interface UpdateMyInfoRequest {
  email?: string;
  phone?: string;
}

/** PATCH /account-service/user/password 요청 (PasswordChangeReqDto) */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
