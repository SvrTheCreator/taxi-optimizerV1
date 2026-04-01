import { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import WorkerPage from './pages/WorkerPage'
import AdminPage from './pages/AdminPage'
import ResultPage from './pages/ResultPage'

function AppRoutes() {
  const { user, loading } = useAuth()
  const [isLogin, setIsLogin] = useState(true)

  if (loading) return <div className="loading">Загрузка...</div>

  // Не авторизован — показываем логин/регистрацию
  if (!user) {
    return isLogin
      ? <LoginPage onSwitch={() => setIsLogin(false)} />
      : <RegisterPage onSwitch={() => setIsLogin(true)} />
  }

  // Авторизован — роутинг по роли
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={user.role === 'admin' ? <AdminPage /> : <WorkerPage />} />
        <Route path="/result" element={<ResultPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </AuthProvider>
  )
}
