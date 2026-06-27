import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Просим браузер не вычищать наше хранилище (localStorage с токеном входа).
// Помогает против авто-очистки данных сайта (особенно iOS Safari через ~7 дней
// простоя). Где поддерживается — снижает «выкидывает, просит войти заново».
if (navigator.storage?.persist) {
  navigator.storage.persisted().then(p => { if (!p) navigator.storage.persist() }).catch(() => {})
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
