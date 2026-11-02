import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./context/AuthContext";
import { AppLayout } from "./components/layout/AppLayout";

import LoginPage from "./pages/auth/LoginPage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import ContactsListPage from "./pages/contacts/ContactsListPage";
import ContactImportPage from "./pages/contacts/ContactImportPage";
import ContactDetailPage from "./pages/contacts/ContactDetailPage";
import SegmentsPage from "./pages/segments/SegmentsPage";
import TemplatesListPage from "./pages/templates/TemplatesListPage";
import TemplateEditorPage from "./pages/templates/TemplateEditorPage";
import CampaignsListPage from "./pages/campaigns/CampaignsListPage";
import CampaignWizardPage from "./pages/campaigns/CampaignWizardPage";
import CampaignProgressPage from "./pages/campaigns/CampaignProgressPage";
import SendJournalPage from "./pages/journal/SendJournalPage";
import SmtpAccountsPage from "./pages/smtp/SmtpAccountsPage";
import DraftsPage from "./pages/drafts/DraftsPage";
import CompanySearchPage from "./pages/companySearch/CompanySearchPage";
import UsersPage from "./pages/settings/UsersPage";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500 dark:text-gray-400">
        Chargement...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500 dark:text-gray-400">
        Chargement...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== "ADMIN") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/contacts" element={<ContactsListPage />} />
        <Route path="/contacts/import" element={<ContactImportPage />} />
        <Route path="/contacts/:id" element={<ContactDetailPage />} />
        <Route path="/segments" element={<SegmentsPage />} />
        <Route path="/templates" element={<TemplatesListPage />} />
        <Route path="/templates/new" element={<TemplateEditorPage />} />
        <Route path="/templates/:id" element={<TemplateEditorPage />} />
        <Route path="/campaigns" element={<CampaignsListPage />} />
        <Route path="/campaigns/new" element={<CampaignWizardPage />} />
        <Route path="/campaigns/:id/edit" element={<CampaignWizardPage />} />
        <Route path="/campaigns/:id/progress" element={<CampaignProgressPage />} />
        <Route path="/journal" element={<SendJournalPage />} />
        <Route path="/smtp" element={<SmtpAccountsPage />} />
        <Route path="/drafts" element={<DraftsPage />} />
        <Route path="/company-search" element={<CompanySearchPage />} />
        <Route
          path="/settings/users"
          element={
            <AdminRoute>
              <UsersPage />
            </AdminRoute>
          }
        />
      </Route>

      <Route
        path="*"
        element={
          <div className="flex h-screen items-center justify-center text-gray-500 dark:text-gray-400">
            404 — Page introuvable
          </div>
        }
      />
    </Routes>
  );
}
