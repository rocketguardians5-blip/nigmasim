import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactElement } from 'react'
import { useAuth } from './lib/auth'
import { AdminLayout } from './layouts/AdminLayout'
import { LoginPage } from './pages/Login'
import { DashboardPage } from './pages/Dashboard'
import { ApplicationsPage } from './pages/Applications'
import { ApplicationDetailPage } from './pages/ApplicationDetail'
import { UsersPage } from './pages/Users'
import { PlaceholderPage } from './pages/Placeholder'
import { CaptureStudioPage } from './pages/CaptureStudio'
import { ScreenRepositoryPage } from './pages/ScreenRepository'
import { UIReconstructionPage } from './pages/UIReconstruction'
import { SimulationBuilderPage } from './pages/SimulationBuilder'
import { SimulationPlayerPage } from './pages/SimulationPlayer'
import { WorkflowBuilderPage } from './pages/WorkflowBuilder'
import { TutorialBuilderPage } from './pages/TutorialBuilder'
import { DocumentationGeneratorPage } from './pages/DocumentationGenerator'
import { usePageVisit } from './hooks/usePageVisit'
import { Spinner } from './components/ui'

function RequireAuth({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner className="h-7 w-7 text-slate-300" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return children
}

function PlaceholderRoute() {
  const location = useLocation()
  return <PlaceholderPage path={location.pathname} />
}

export function App() {
  const { user, loading } = useAuth()
  usePageVisit()

  return (
    <Routes>
      <Route
        path="/login"
        element={
          loading ? (
            <div className="grid h-full place-items-center">
              <Spinner className="h-7 w-7 text-slate-300" />
            </div>
          ) : user ? (
            <Navigate to="/" replace />
          ) : (
            <LoginPage />
          )
        }
      />

      <Route
        path="/simulation/play/:projectId"
        element={
          <RequireAuth>
            <SimulationPlayerPage />
          </RequireAuth>
        }
      />

      <Route
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/applications" element={<ApplicationsPage />} />
        <Route path="/applications/:id" element={<ApplicationDetailPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/capture" element={<CaptureStudioPage />} />
        <Route path="/screens" element={<ScreenRepositoryPage />} />
        <Route path="/reconstruction" element={<UIReconstructionPage />} />
        <Route path="/simulation" element={<SimulationBuilderPage />} />`n        <Route path="/simulation/play/:projectId" element={<SimulationPlayerPage />} />
        <Route path="/workflow" element={<WorkflowBuilderPage />} />
        <Route path="/tutorial" element={<TutorialBuilderPage />} />
        <Route path="/documentation" element={<DocumentationGeneratorPage />} />
        <Route path="/demos" element={<PlaceholderRoute />} />
        <Route path="/analytics" element={<PlaceholderRoute />} />
        <Route path="/settings" element={<PlaceholderRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
