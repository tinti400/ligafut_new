export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center h-[80vh] text-center">
      <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full"></div>
      <p className="mt-4 text-sm text-gray-400">Carregando...</p>
    </div>
  )
}
