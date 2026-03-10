import { createContext, useContext, useReducer, useEffect } from 'react'

// Загружаем последний результат из localStorage — работает после закрытия браузера
function loadSavedResult() {
  try { return JSON.parse(localStorage.getItem('taxi_result')) } catch { return null }
}

// Начальное состояние всего приложения
const initialState = {
  // Список введённых адресов: [{ id, address, time }]
  entries: [],
  // Результат оптимизации: [{ time, taxis: [{ id, addresses }] }]
  result: loadSavedResult(),
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

    case 'REMOVE_FAILED':
      // payload: массив адресов которые не удалось геокодировать
      return { ...state, entries: state.entries.filter(e => !action.payload.includes(e.address)), loading: false }

    case 'SET_RESULT':
      return { ...state, result: action.payload, loading: false }

    case 'SET_LOADING':
      return { ...state, loading: action.payload, error: null }

    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false }

    case 'MOVE_ADDRESS': {
      // Переместить адрес из одного такси в другое
      // Важно: обновляем и addresses (строки), и points (координаты для карты)
      const { time, fromTaxiId, toTaxiId, address } = action.payload
      const newResult = state.result.map(group => {
        if (group.time !== time) return group

        // Находим точку с координатами для перемещаемого адреса
        const fromTaxi = group.taxis.find(t => t.id === fromTaxiId)
        const movingPoint = fromTaxi?.points?.find(p => p.address === address)

        return {
          ...group,
          taxis: group.taxis.map(taxi => {
            if (taxi.id === fromTaxiId) {
              return {
                ...taxi,
                addresses: taxi.addresses.filter(a => a !== address),
                points: (taxi.points || []).filter(p => p.address !== address),
              }
            }
            if (taxi.id === toTaxiId) {
              return {
                ...taxi,
                addresses: [...taxi.addresses, address],
                points: movingPoint ? [...(taxi.points || []), movingPoint] : (taxi.points || []),
              }
            }
            return taxi
          }).filter(taxi => taxi.addresses.length > 0),
        }
      })
      return { ...state, result: newResult }
    }

    case 'REORDER_ADDRESSES': {
      // Перетасовать адреса внутри одного такси
      const { time, taxiId, fromIndex, toIndex } = action.payload
      const newResult = state.result.map(group => {
        if (group.time !== time) return group
        return {
          ...group,
          taxis: group.taxis.map(taxi => {
            if (taxi.id !== taxiId) return taxi
            const addrs = [...taxi.addresses]
            const pts = [...(taxi.points || [])]
            const [movedAddr] = addrs.splice(fromIndex, 1)
            addrs.splice(toIndex, 0, movedAddr)
            if (pts.length > fromIndex) {
              const [movedPt] = pts.splice(fromIndex, 1)
              pts.splice(toIndex, 0, movedPt)
            }
            return { ...taxi, addresses: addrs, points: pts }
          }),
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

  // Синхронизируем result с localStorage — сохраняет результат между сессиями
  useEffect(() => {
    if (state.result) {
      localStorage.setItem('taxi_result', JSON.stringify(state.result))
    } else {
      localStorage.removeItem('taxi_result')
    }
  }, [state.result])

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
