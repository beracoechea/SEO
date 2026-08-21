import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { AdminGuard } from "./pages/AdminGuard";
import { AdminOrgDetailPage } from "./pages/AdminOrgDetailPage";
import { AdminOrgsPage } from "./pages/AdminOrgsPage";
import { AdminShell } from "./pages/AdminShell";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { Gate, RootRedirect } from "./pages/Gate";
import { NewSitePage } from "./pages/NewSitePage";
import { OnboardingPage, OrgsPage } from "./pages/OnboardingPage";
import { OrgHomePage } from "./pages/OrgHomePage";
import { Shell } from "./pages/Shell";
import { SitePlaceholderPage } from "./pages/SitePlaceholderPage";
import { TeamPage } from "./pages/TeamPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Gate>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/orgs" element={<OrgsPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route
              path="/admin"
              element={
                <AdminGuard>
                  <AdminShell />
                </AdminGuard>
              }
            >
              <Route index element={<AdminOrgsPage />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="o/:orgId" element={<AdminOrgDetailPage />} />
            </Route>
            <Route path="/o/:orgId" element={<Shell />}>
              <Route index element={<OrgHomePage />} />
              <Route path="sites/new" element={<NewSitePage />} />
              <Route path="team" element={<TeamPage />} />
              <Route path="settings" element={<Navigate to=".." replace />} />
              <Route path="s/:siteId" element={<SitePlaceholderPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/orgs" replace />} />
          </Routes>
        </Gate>
      </BrowserRouter>
    </AuthProvider>
  );
}
