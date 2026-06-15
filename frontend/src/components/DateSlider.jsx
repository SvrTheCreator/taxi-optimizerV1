import { Swiper, SwiperSlide } from 'swiper/react'
import { FreeMode } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/free-mode'

const DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const DAYS_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

function getDates(count = 1) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return {
      value: d.toISOString().split('T')[0],
      day: DAYS[d.getDay()],
      dayFull: DAYS_FULL[d.getDay()],
      date: d.getDate(),
      month: MONTHS[d.getMonth()],
      monthFull: MONTHS_FULL[d.getMonth()],
    }
  })
}

export default function DateSlider({ selected, onChange, days = 1 }) {
  const dates = getDates(days)

  // Один день — показываем красивую центрированную плашку без слайдера
  if (days === 1) {
    const d = dates[0]
    return (
      <div className="date-single">
        <span className="date-single-day">{d.dayFull}</span>
        <span className="date-single-full">{d.date} {d.monthFull}</span>
      </div>
    )
  }

  return (
    <Swiper
      modules={[FreeMode]}
      freeMode={true}
      slidesPerView="auto"
      spaceBetween={8}
      className="date-slider"
    >
      {dates.map(d => (
        <SwiperSlide key={d.value} style={{ width: 'auto' }}>
          <button
            className={`date-slide ${d.value === selected ? 'active' : ''}`}
            onClick={() => onChange(d.value)}
          >
            <span className="date-slide-day">{d.day}</span>
            <span className="date-slide-num">{d.date}</span>
            <span className="date-slide-month">{d.month}</span>
          </button>
        </SwiperSlide>
      ))}
    </Swiper>
  )
}
