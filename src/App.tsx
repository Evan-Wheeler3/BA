import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout, MorePage } from './ui/Layout'
import Dashboard from './pages/Dashboard'
import SessionPage from './pages/Session'
import QuizPage from './pages/Quiz'
import PracticePage, { DiagnosticPage, MockPage } from './pages/Practice'

// Less-used screens are split out to keep the first load small.
const MistakesPage = lazy(() => import('./pages/Mistakes'))
const TopicsPage = lazy(() => import('./pages/Topics'))
const TopicDetailPage = lazy(() => import('./pages/Topics').then((m) => ({ default: m.TopicDetailPage })))
const ResourcesPage = lazy(() => import('./pages/Topics').then((m) => ({ default: m.ResourcesPage })))
const ProgressPage = lazy(() => import('./pages/Progress'))
const CalendarPage = lazy(() => import('./pages/Calendar'))
const SettingsPage = lazy(() => import('./pages/Settings'))

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Loading…</div>}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="session" element={<SessionPage />} />
            <Route path="diagnostic" element={<DiagnosticPage />} />
            <Route path="practice" element={<PracticePage />} />
            <Route path="mock" element={<MockPage />} />
            <Route path="quiz/:id" element={<QuizPage />} />
            <Route path="mistakes" element={<MistakesPage />} />
            <Route path="topics" element={<TopicsPage />} />
            <Route path="topics/:id" element={<TopicDetailPage />} />
            <Route path="resources" element={<ResourcesPage />} />
            <Route path="progress" element={<ProgressPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="more" element={<MorePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
