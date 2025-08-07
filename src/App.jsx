// src/App.jsx
import React, { useState } from 'react';
import LoginPage from './components/LoginPage';
import MainPage  from './components/MainPage';
import SearchPage from './components/SearchPage';
import UploadPage from './components/UploadPage';
import ManagePage  from './components/ManagePage';
import SpecsPage   from './components/SpecsPage';
import QuestionnaireArchivePage from './components/QuestionnaireArchPage';
const DocumentationPage = () => <h2 style={{ padding:'2rem' }}>Documentation (TBD)</h2>;

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('main');

  // Just take the user object from LoginPage and set it
  const handleLogin = (loggedInUser) => {
    setUser(loggedInUser);
  };

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <>
      {view === 'main' && (
        <MainPage onNavigate={setView} currentUser={user} />
      )}
      {view === 'search' && (
        <SearchPage onBack={() => setView('main')} />
      )}
      {view === 'upload' && (
        <UploadPage onBack={() => setView('main')} />
      )}
      {view === 'manage' && user.role === 'admin' && (
        <ManagePage onBack={() => setView('main')} />
      )}
      {view === 'systemSpecs' && (
        <SpecsPage onBack={() => setView('main')} />
      )}
      {view === 'siteDBs' && (
        <QuestionnaireArchivePage onBack={() => setView('main')} />
      )}
      {view === 'documentation' && (
        <DocumentationPage onBack={() => setView('main')} />
      )}
    </>
  );
}
