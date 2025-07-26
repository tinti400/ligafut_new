export default function Loading() {
  return (
    <div className="w-full text-center py-10">
      <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
      <p className="mt-2 text-sm text-gray-600">Carregando...</p>
    </div>
  )
}
