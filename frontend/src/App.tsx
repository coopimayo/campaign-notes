import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthSync } from './auth-sync.tsx'
import { RequireAuth } from './components/require-auth.tsx'
import { CampaignsList } from './views/campaigns-list.tsx'
import { SignIn } from './views/sign-in.tsx'

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
              <CampaignsList />
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
