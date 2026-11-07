export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </p>
  )
}
