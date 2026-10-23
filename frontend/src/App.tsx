import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navbar } from './components/Navbar';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { MonitorDetailPage } from './pages/MonitorDetailPage';
import { PublicStatusPage } from './pages/PublicStatusPage';
import { ArchitecturePage } from './pages/ArchitecturePage';
import { EvaluationPage } from './pages/EvaluationPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 10000,
    },
  },
});

const Layout: React.FC = () => {
  const location = useLocation();
  // Public tenant status pages do not display the internal admin operations navbar
  const isPublicStatusPage = location.pathname.startsWith('/status/');

  return (
    <div className="app-container">
      {!isPublicStatusPage && <Navbar />}
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/monitors/:id" element={<MonitorDetailPage />} />
        <Route path="/status/:slug" element={<PublicStatusPage />} />
        <Route path="/architecture" element={<ArchitecturePage />} />
        <Route path="/evaluation" element={<EvaluationPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
