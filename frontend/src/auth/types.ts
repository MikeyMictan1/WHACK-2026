/** 'admin' is the single built-in account the backend seeds at startup; it can't be registered. */
export type Role = 'parent' | 'child' | 'admin'

export type User = {
  id: number
  username: string
  role: Role
  /** Set on child accounts: the parent who manages them. */
  parent_id: number | null
  display_name: string | null
  /** Children only, in minor units (1/100 WC), like all money. */
  weekly_allowance: number | null
  /** Children only: "10+", "13+", "15+", or custom. */
  app_experience: string | null
  /** Children only: comma-separated enabled card types. */
  card_type: string | null
  created_at: string
}

export type LoginInput = { username: string; password: string }
/** Sign-up always creates a parent account. */
export type RegisterInput = LoginInput

/** The name to show for a user. Accounts have a username only, so that is what we show
 *  (older accounts may still carry a display_name; it is ignored). */
export function nameOf(user: Pick<User, 'username'>) {
  return user.username
}
