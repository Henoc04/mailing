import { Link, Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./context/AuthContext";
import { AppLayout } from "./components/layout/AppLayout";
import { Spinner } from "./components/ui/Spinner";

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

function FullScreenLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="h-8 w-8 text-brand-500" />
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold text-brand-600 dark:text-brand-400">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">Page introuvable</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        La page que vous cherchez n'existe pas ou a été déplacée.
      </p>
      <Link to="/" className="btn mt-6 h-10 bg-brand-600 px-4 text-sm text-white hover:bg-brand-500">
        Retour au tableau de bord
      </Link>
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <FullScreenLoader />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <FullScreenLoader />;
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

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
