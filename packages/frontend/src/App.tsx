import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { CharacterListPage } from './pages/CharacterListPage';
import { CharacterEditorPage } from './pages/CharacterEditorPage';
import { LoadingSpinner } from './components/LoadingSpinner';

function App() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="loading-container">
        <LoadingSpinner />
        <p>Loading Hero Workshop...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          isAuthenticated ? (
            <Layout />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      >
        <Route index element={<Navigate to="/characters" replace />} />
        <Route path="characters" element={<CharacterListPage />} />
        <Route path="characters/:fileId" element={<CharacterEditorPage />} />
      </Route>
    </Routes>
  );
}

export default App;
