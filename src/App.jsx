import React, { useState } from 'react';
import MainPage from './components/MainPage';
import SearchPage from './components/SearchPage';
import UploadPage from './components/UploadPage';
import ManagePage from './components/ManagePage';
import SpecsPage from './components/SpecsPage';
import QuestionnaireArchivePage from './components/QuestionnaireArchPage';
// Import or create stubs for your other pages:
const SystemSpecsPage     = () => <h2 style={{ padding:'2rem' }}>System Specs (TBD)</h2>;
const ServerSpecsPage     = () => <h2 style={{ padding:'2rem' }}>Server Specs (TBD)</h2>;
const SiteDBsPage         = () => <h2 style={{ padding:'2rem' }}>Site DB's (TBD)</h2>;
const DocumentationPage   = () => <h2 style={{ padding:'2rem' }}>Documentation (TBD)</h2>;

export default function App() {
  const [view, setView] = useState('main');

  return (
    <>
      {view === 'main' && (
        <MainPage onNavigate={setView} />
      )}

      {view === 'search' && (
        <SearchPage onBack={() => setView('main')} />
      )}
      {view === 'upload' && (
        <UploadPage onBack={() => setView('main')} />
      )}
      {view === 'manage' && (
        <ManagePage onBack={() => setView('main')} />
      )}
      {view === 'systemSpecs' && (
        <SpecsPage onBack={() => setView('main')} />
      )}

      {view === 'siteDBs' && (
        <QuestionnaireArchivePage onBack={() => setView('main')} />
      )}
      {view === 'documentation' && <DocumentationPage />}
    </>
  );
}
