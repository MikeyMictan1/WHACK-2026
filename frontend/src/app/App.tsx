import { Navigate, Route, Routes } from 'react-router'
import { Layout } from '../components/layout/Layout.tsx'
import { RequireAuth } from '../auth/RequireAuth.tsx'
import { LoginPage } from '../auth/LoginPage.tsx'
import { RegisterPage } from '../auth/RegisterPage.tsx'
import { FrontPage } from '../front-page/FrontPage.tsx'
import { AiFeaturePage } from '../ai-feature/AiFeaturePage.tsx'
import { ProfilePage } from '../profile/ProfilePage.tsx'
import { DashboardPage } from '../dashboard/DashboardPage.tsx'
import { ShopPage } from '../shop/ShopPage.tsx'
import { EarnPage } from '../earn/EarnPage.tsx'
import { ManageShopPage } from '../manage/ManageShopPage.tsx'
import { LedHomePage } from '../led/LedHomePage.tsx'
import { MonthlyReviewPage } from '../monthly/MonthlyReviewPage.tsx'
import { NegotiationPage } from '../negotiation/NegotiationPage.tsx'
import { PlansPage } from '../plans/PlansPage.tsx'
import { NotFoundPage } from '../not-found/NotFoundPage.tsx'
import { PrivacyPage } from '../legal/PrivacyPage.tsx'
import { TermsPage } from '../legal/TermsPage.tsx'

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<FrontPage />} />
        {/* old template paths */}
        <Route path="feature-1" element={<Navigate to="/shop" replace />} />
        <Route path="feature-2" element={<Navigate to="/led" replace />} />
        <Route
          path="led"
          element={
            <RequireAuth>
              <LedHomePage />
            </RequireAuth>
          }
        />
        <Route path="ai" element={<AiFeaturePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route
          path="dashboard"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="shop"
          element={
            <RequireAuth>
              <ShopPage />
            </RequireAuth>
          }
        />
        <Route
          path="earn"
          element={
            <RequireAuth>
              <EarnPage />
            </RequireAuth>
          }
        />
        <Route
          path="manage"
          element={
            <RequireAuth>
              <ManageShopPage />
            </RequireAuth>
          }
        />
        <Route
          path="review"
          element={
            <RequireAuth>
              <MonthlyReviewPage />
            </RequireAuth>
          }
        />
        <Route
          path="plans"
          element={
            <RequireAuth>
              <PlansPage />
            </RequireAuth>
          }
        />
        <Route
          path="plans/:cardId/negotiate"
          element={
            <RequireAuth>
              <NegotiationPage />
            </RequireAuth>
          }
        />
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
