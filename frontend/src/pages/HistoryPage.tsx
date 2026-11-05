export function HistoryPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center p-6">
      <p className="text-sm text-muted-foreground">Due-track</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Completion history</h1>
      <p className="mt-3 max-w-prose text-muted-foreground">
        Completed obligations will be listed here, newest first.
      </p>
    </main>
  )
}
