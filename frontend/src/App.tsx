import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthSync } from './auth-sync.tsx'
import { RequireAuth } from './components/require-auth.tsx'
import { SignIn } from './views/sign-in.tsx'

function CampaignsPlaceholder() {
  return (
    <div className="flex min-h-full items-center justify-center bg-neutral-950 text-neutral-100">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Campaigns</h1>
        <p className="text-sm text-neutral-400">List + create lands in step 10.</p>
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthSync />
      <Routes>
        <Route path="/sign-in" element={<SignIn />} />
        <Route
          path="/campaigns"
          element={
            <RequireAuth>
              <CampaignsPlaceholder />
            </RequireAuth>
          }
        />
        <Route path="/" element={<Navigate to="/campaigns" replace />} />
        <Route path="*" element={<Navigate to="/campaigns" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
