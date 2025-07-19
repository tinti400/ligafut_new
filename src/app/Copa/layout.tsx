export default function CopaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">🏆 Painel da Copa</h1>
      {children}
    </div>
  )
}
