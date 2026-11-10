// Formatos regionales con Intl (no hardcodear separadores ni símbolos)
const ars = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})
const entero = new Intl.NumberFormat('es-AR')
const fechaCompleta = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

export const moneda = (n) => ars.format(n)
export const numero = (n) => entero.format(n)
export const fechaLarga = (d) => fechaCompleta.format(d)
const horaMinutos = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' })
const diaMes = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export const hora = (iso) => horaMinutos.format(new Date(iso))
// "2026-11-10" → "10/11/2026" (las fechas sin hora se leen como día local, no UTC)
export const fecha = (iso) => diaMes.format(new Date(iso.length === 10 ? `${iso}T00:00` : iso))
// Hoy en formato AAAA-MM-DD para filtrar en la API
export const hoyISO = () => new Date().toLocaleDateString('en-CA')
