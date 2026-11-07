import { api } from '../lib/api.ts'
import type { User } from '../auth/types.ts'

export const CHILD_MIN_AGE = 10
export const CHILD_MAX_AGE = 18

export type ChildInput = {
  username: string
  password: string
  display_name: string
  age: number
}

/** Only the fields sent are changed. `password` resets the child's password. */
export type ChildUpdate = Partial<Pick<ChildInput, 'display_name' | 'age' | 'password'>>

/** A parent's child accounts. All of these return 403 for a child session. */
export const childrenApi = {
  list: () => api<User[]>('/children'),
  create: (input: ChildInput) => api<User>('/children', { method: 'POST', json: input }),
  update: (id: number, input: ChildUpdate) => api<User>(`/children/${id}`, { method: 'PATCH', json: input }),
  remove: (id: number) => api<void>(`/children/${id}`, { method: 'DELETE' }),
}
