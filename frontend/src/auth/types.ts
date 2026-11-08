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
export type RegisterInput = LoginInput & { display_name?: string }

/** The name to show for a user: their display name, else their username. */
export function nameOf(user: Pick<User, 'display_name' | 'username'>) {
  return user.display_name || user.username
}
