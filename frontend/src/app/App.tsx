import { Route, Routes } from 'react-router'
import { Layout } from '../components/layout/Layout.tsx'
import { RequireAuth } from '../auth/RequireAuth.tsx'
import { LoginPage } from '../auth/LoginPage.tsx'
import { RegisterPage } from '../auth/RegisterPage.tsx'
import { FrontPage } from '../front-page/FrontPage.tsx'
import { Feature1Page } from '../feature-1/Feature1Page.tsx'
import { Feature2Page } from '../feature-2/Feature2Page.tsx'
import { AiFeaturePage } from '../ai-feature/AiFeaturePage.tsx'
import { ProfilePage } from '../profile/ProfilePage.tsx'
import { NotFoundPage } from '../not-found/NotFoundPage.tsx'
import { PrivacyPage } from '../legal/PrivacyPage.tsx'
import { TermsPage } from '../legal/TermsPage.tsx'

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<FrontPage />} />
        <Route path="feature-1" element={<Feature1Page />} />
        <Route path="feature-2" element={<Feature2Page />} />
        <Route path="ai" element={<AiFeaturePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route
          path="profile"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />
        <Route path="terms" element={<TermsPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
