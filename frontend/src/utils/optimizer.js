// Алгоритм оптимизации маршрутов такси
// Используем k-means кластеризацию с адаптивным выбором k

const MAX_PER_TAXI = 4
const MIN_PER_TAXI = 2

// Формула Хаверсина — расстояние между двумя точками (км)
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

// Максимальное расстояние между любыми двумя точками в кластере (диаметр)
function clusterDiameter(cluster) {
  let maxDist = 0
  for (let i = 0; i < cluster.length; i++) {
    for (let j = i + 1; j < cluster.length; j++) {
      const d = haversineDistance(cluster[i].lat, cluster[i].lon, cluster[j].lat, cluster[j].lon)
      if (d > maxDist) maxDist = d
    }
  }
  return maxDist
}

// Суммарное расстояние всех точек от центроида — "компактность" кластера
function clusterInertia(cluster) {
  if (cluster.length === 0) return 0
  const centLat = cluster.reduce((s, p) => s + p.lat, 0) / cluster.length
  const centLon = cluster.reduce((s, p) => s + p.lon, 0) / cluster.length
  return cluster.reduce((s, p) => s + haversineDistance(p.lat, p.lon, centLat, centLon), 0)
}

// K-means++ инициализация — выбирает начальные центроиды равномерно по карте
// Лучше случайной инициализации: меньше шанс получить плохое разбиение
function initCentroids(points, k) {
  const centroids = [points[0]] // первый центроид — первая точка
  while (centroids.length < k) {
    // Для каждой точки — расстояние до ближайшего уже выбранного центроида
    const distances = points.map(p =>
      Math.min(...centroids.map(c => haversineDistance(p.lat, p.lon, c.lat, c.lon))) ** 2
    )
    const sum = distances.reduce((a, b) => a + b, 0)
    // Выбираем следующий центроид случайно, но с вероятностью пропорциональной расстоянию
    // Это гарантирует что центроиды будут разнесены по карте
    let rand = Math.random() * sum
    for (let i = 0; i < points.length; i++) {
      rand -= distances[i]
      if (rand <= 0) { centroids.push(points[i]); break }
    }
  }
  return centroids.map(c => ({ lat: c.lat, lon: c.lon }))
}

// Одна итерация k-means: возвращает массив кластеров
function runKmeans(points, k) {
  let centroids = initCentroids(points, k)
  let assignments = new Array(points.length).fill(0)

  for (let iter = 0; iter < 50; iter++) {
    // Шаг 1: каждая точка идёт к ближайшему центроиду
    const newAssignments = points.map(p => {
      let minDist = Infinity, minIdx = 0
      centroids.forEach((c, j) => {
        const d = haversineDistance(p.lat, p.lon, c.lat, c.lon)
        if (d < minDist) { minDist = d; minIdx = j }
      })
      return minIdx
    })

    if (newAssignments.join() === assignments.join()) break // сошлось
    assignments = newAssignments

    // Шаг 2: двигаем центроиды в центр своего кластера
    centroids = centroids.map((_, j) => {
      const cluster = points.filter((_, i) => assignments[i] === j)
      if (cluster.length === 0) return centroids[j]
      return {
        lat: cluster.reduce((s, p) => s + p.lat, 0) / cluster.length,
        lon: cluster.reduce((s, p) => s + p.lon, 0) / cluster.length,
      }
    })
  }

  // Собираем кластеры
  const clusters = Array.from({ length: k }, () => [])
  points.forEach((p, i) => clusters[assignments[i]].push(p))
  return clusters.filter(c => c.length > 0)
}

// Запускаем k-means несколько раз, берём лучший результат
// (k-means может попасть в локальный минимум из-за случайной инициализации)
function bestKmeans(points, k, runs = 5) {
  let bestClusters = null
  let bestScore = Infinity
  for (let i = 0; i < runs; i++) {
    const clusters = runKmeans(points, k)
    const score = clusters.reduce((s, c) => s + clusterInertia(c), 0)
    if (score < bestScore) { bestScore = score; bestClusters = clusters }
  }
  return bestClusters
}

// Если кластер больше MAX_PER_TAXI — разбиваем его на подкластеры
function splitOverfullClusters(clusters) {
  const result = []
  for (const cluster of clusters) {
    if (cluster.length <= MAX_PER_TAXI) {
      result.push(cluster)
    } else {
      // Разбиваем на части по MAX_PER_TAXI
      const k = Math.ceil(cluster.length / MAX_PER_TAXI)
      const subclusters = bestKmeans(cluster, k)
      result.push(...subclusters)
    }
  }
  return result
}

// Центроид кластера
function centroid(cluster) {
  return {
    lat: cluster.reduce((s, p) => s + p.lat, 0) / cluster.length,
    lon: cluster.reduce((s, p) => s + p.lon, 0) / cluster.length,
  }
}

// Объединяем кластеры меньше MIN_PER_TAXI с ближайшим соседом
// Если некуда вместить (все полные) — оставляем как есть
function mergeSmallClusters(clusters) {
  let result = clusters.map(c => [...c])
  let changed = true

  while (changed) {
    changed = false
    const smallIdx = result.findIndex(c => c.length < MIN_PER_TAXI)
    if (smallIdx === -1) break

    const small = result[smallIdx]
    const sc = centroid(small)

    // Ищем ближайший кластер, который может принять людей из маленького
    let bestIdx = -1, bestDist = Infinity
    result.forEach((c, i) => {
      if (i === smallIdx) return
      if (c.length + small.length > MAX_PER_TAXI) return
      const cc = centroid(c)
      const dist = haversineDistance(sc.lat, sc.lon, cc.lat, cc.lon)
      if (dist < bestDist) { bestDist = dist; bestIdx = i }
    })

    if (bestIdx !== -1) {
      result[bestIdx] = [...result[bestIdx], ...small]
      result.splice(smallIdx, 1)
      changed = true
    } else {
      break // некуда вместить — оставляем
    }
  }

  return result
}

// Главная функция кластеризации с адаптивным k
// SPREAD_THRESHOLD_KM — если адреса в кластере разбросаны дальше этого расстояния,
// разбиваем на две машины, даже если людей < 4
const SPREAD_THRESHOLD_KM = 5

function clusterAddresses(points, workLat, workLon) {
  if (points.length === 0) return []
  if (points.length === 1) return [points]

  // Начинаем с минимально необходимого количества машин
  let k = Math.ceil(points.length / MAX_PER_TAXI)

  let clusters
  // Увеличиваем k пока маршруты не станут разумными
  while (k <= points.length) {
    clusters = bestKmeans(points, k)
    clusters = splitOverfullClusters(clusters)

    const anyTooSpread = clusters.some(c => c.length > 1 && clusterDiameter(c) > SPREAD_THRESHOLD_KM)
    if (!anyTooSpread) break
    k++
  }

  // Объединяем одиночные кластеры с соседними (минимум MIN_PER_TAXI человек в машине)
  clusters = mergeSmallClusters(clusters)

  // Внутри каждого кластера сортируем по алгоритму ближайшего соседа от рабочего адреса
  return clusters.map(cluster => nearestNeighborOrder(cluster, workLat, workLon))
}

// Упорядочиваем адреса внутри машины: начинаем от работы, каждый следующий — ближайший
function nearestNeighborOrder(points, startLat, startLon) {
  const remaining = [...points]
  const ordered = []
  let curLat = startLat, curLon = startLon

  while (remaining.length > 0) {
    let nearestIdx = 0, nearestDist = Infinity
    remaining.forEach((p, i) => {
      const d = haversineDistance(curLat, curLon, p.lat, p.lon)
      if (d < nearestDist) { nearestDist = d; nearestIdx = i }
    })
    const nearest = remaining.splice(nearestIdx, 1)[0]
    ordered.push(nearest)
    curLat = nearest.lat
    curLon = nearest.lon
  }
  return ordered
}

// Главная функция оптимизации
// entries: [{ id, address, time, lat, lon }]
// workCoords: { lat, lon }
export function optimize(entries, workCoords) {
  // Группируем по времени смены
  const byTime = {}
  for (const entry of entries) {
    if (!byTime[entry.time]) byTime[entry.time] = []
    byTime[entry.time].push(entry)
  }

  const result = []
  let taxiCounter = 1

  for (const time of Object.keys(byTime).sort()) {
    const group = byTime[time]
    const clusters = clusterAddresses(group, workCoords.lat, workCoords.lon)

    result.push({
      time,
      taxis: clusters.map(cluster => ({
        id: taxiCounter++,
        addresses: cluster.map(p => p.address),
        points: cluster.map(p => ({ address: p.address, lat: p.lat, lon: p.lon })),
      })),
    })
  }

  return result
}

// Форматирует результат в текст для копирования
export function formatResultAsText(result) {
  return result
    .map(group => {
      const taxiLines = group.taxis
        .map(taxi => `Такси ${taxi.id}\n` + taxi.addresses.map(a => `  ${a}`).join('\n'))
        .join('\n\n')
      return `${group.time}\n${taxiLines}`
    })
    .join('\n\n')
}
