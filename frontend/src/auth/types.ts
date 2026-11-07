export type User = {
  id: number
  username: string
  created_at: string
}

export type LoginInput = { username: string; password: string }
export type RegisterInput = LoginInput
