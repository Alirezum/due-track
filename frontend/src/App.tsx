import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell.tsx'
import { DashboardPage } from '@/pages/DashboardPage.tsx'
import { HistoryPage } from '@/pages/HistoryPage.tsx'
import { TimelinePage } from '@/pages/TimelinePage.tsx'

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/history" element={<HistoryPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
