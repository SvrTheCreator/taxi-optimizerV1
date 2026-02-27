import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import InputPage from './pages/InputPage'
import ResultPage from './pages/ResultPage'

// Паттерн: Provider оборачивает Router — контекст доступен на всех страницах
export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<InputPage />} />
          <Route path="/result" element={<ResultPage />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}
