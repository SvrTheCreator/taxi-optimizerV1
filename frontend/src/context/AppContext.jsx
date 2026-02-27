import { createContext, useContext, useReducer } from 'react'

// Начальное состояние всего приложения
const initialState = {
  // Список введённых адресов: [{ id, address, time }]
  entries: [],
  // Результат оптимизации: [{ time, taxis: [{ id, addresses }] }]
  result: null,
  // Идёт ли загрузка геокодирования
  loading: false,
  // Сообщение об ошибке
  error: null,
}

// Reducer — чистая функция: (текущее состояние, действие) => новое состояние
// Паттерн: все изменения состояния через dispatch({ type, payload })
function reducer(state, action) {
  switch (action.type) {
    case 'ADD_ENTRY':
      return { ...state, entries: [...state.entries, action.payload] }

    case 'REMOVE_ENTRY':
      return { ...state, entries: state.entries.filter(e => e.id !== action.payload) }

    case 'SET_RESULT':
      return { ...state, result: action.payload, loading: false }

    case 'SET_LOADING':
      return { ...state, loading: action.payload, error: null }

    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false }

    case 'MOVE_ADDRESS': {
      // Переместить адрес из одного такси в другое
      const { time, fromTaxiId, toTaxiId, address } = action.payload
      const newResult = state.result.map(group => {
        if (group.time !== time) return group
        return {
          ...group,
          taxis: group.taxis.map(taxi => {
            if (taxi.id === fromTaxiId) {
              return { ...taxi, addresses: taxi.addresses.filter(a => a !== address) }
            }
            if (taxi.id === toTaxiId) {
              return { ...taxi, addresses: [...taxi.addresses, address] }
            }
            return taxi
          }).filter(taxi => taxi.addresses.length > 0),
        }
      })
      return { ...state, result: newResult }
    }

    case 'CLEAR_ENTRIES':
      return { ...state, entries: [], result: null }

    default:
      return state
  }
}

// Создаём контекст
const AppContext = createContext(null)

// Provider — оборачивает всё приложение, предоставляет state и dispatch
export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  )
}

// Хук для удобного использования контекста
// Вместо useContext(AppContext) везде пишем просто useApp()
export function useApp() {
  return useContext(AppContext)
}
