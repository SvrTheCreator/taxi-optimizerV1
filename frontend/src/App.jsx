import { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './components/Toast'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPinPage from './pages/ForgotPinPage'
import WorkerPage from './pages/WorkerPage'
import AdminPage from './pages/AdminPage'
import ResultPage from './pages/ResultPage'

function AppRoutes() {
  const { user, loading } = useAuth()
  const hasRegToken = new URLSearchParams(window.location.search).has('regToken')
  const [authScreen, setAuthScreen] = useState(hasRegToken ? 'register' : 'login') // 'login' | 'register' | 'forgot'

  if (loading) return null // не показываем ничего пока проверяем токен

  // Не авторизован — показываем нужный экран
  if (!user) {
    if (authScreen === 'register') {
      return <RegisterPage onSwitch={() => setAuthScreen('login')} />
    }
    if (authScreen === 'forgot') {
      return <ForgotPinPage onBack={() => setAuthScreen('login')} />
    }
    return <LoginPage
      onSwitch={() => setAuthScreen('register')}
      onForgot={() => setAuthScreen('forgot')}
    />
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
    <ToastProvider>
      <AuthProvider>
        <AppProvider>
          <AppRoutes />
        </AppProvider>
      </AuthProvider>
    </ToastProvider>
  )
}
