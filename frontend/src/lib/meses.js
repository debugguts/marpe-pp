import { hoyISO } from './formato'

// Selector de mes de las pantallas con tablero (Gastos, Compras): "2026-11" ⇄ "Noviembre de 2026".
const nombreMes = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export function textoMes(mes) {
  const texto = nombreMes.format(new Date(`${mes}-01T12:00:00Z`))
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

// Los últimos 12 meses, del actual hacia atrás: "2026-11", "2026-10", …
export function ultimosMeses() {
  const [anio, mes] = hoyISO().split('-').map(Number)
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(anio, mes - 1 - i, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  })
}

// Último día del mes: "2026-11" → "2026-11-30"
export function ultimoDia(mes) {
  const [a, m] = mes.split('-').map(Number)
  return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`
}
