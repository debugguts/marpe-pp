// Formatos regionales con Intl (no hardcodear separadores ni símbolos)

// Hora del negocio (Cerrillos, Salta), igual que el servidor (TIME_ZONE en settings.py).
// Fija a propósito: si la PC o el celular tienen otra zona horaria, la web igual muestra la hora de acá.
export const ZONA = 'America/Argentina/Salta'
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
  timeZone: ZONA,
})

export const moneda = (n) => ars.format(n)
export const numero = (n) => entero.format(n)
export const fechaLarga = (d) => fechaCompleta.format(d)
const horaMinutos = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA })
const diaMes = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: ZONA })
// Una fecha sola ("2026-11-10") es un día del calendario, no un instante: se lee y se muestra en UTC
// para que ninguna zona horaria la corra al día anterior.
const diaMesCalendario = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
const diaISO = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: ZONA })

export const hora = (iso) => horaMinutos.format(new Date(iso))
// "2026-11-10" → "10/11/2026"
export const fecha = (iso) => (iso.length === 10 ? diaMesCalendario.format(new Date(`${iso}T00:00Z`)) : diaMes.format(new Date(iso)))

// «hace 5 min», «hoy 09:12», «ayer 18:33» o «14/11/2026»: para «Último ingreso».
export function haceCuanto(iso) {
  const minutos = Math.round((Date.now() - new Date(iso)) / 60_000)
  if (minutos < 1) return 'recién'
  if (minutos < 60) return `hace ${minutos} min`
  const dia = diaISO.format(new Date(iso))
  if (dia === hoyISO()) return `hoy ${hora(iso)}`
  if (dia === diaISO.format(new Date(Date.now() - 86_400_000))) return `ayer ${hora(iso)}`
  return fecha(iso)
}
// Hoy en formato AAAA-MM-DD para filtrar en la API
// Qué trae una presentación según sus bandejas: 1/30 → "1 huevo", 1 → "30 huevos", 6 → "6 bandejas"
export function contenidoDe(bandejas) {
  const b = Number(bandejas)
  if (b < 1) {
    const huevos = Math.round(b * 30)
    return `${huevos} ${huevos === 1 ? 'huevo' : 'huevos'}`
  }
  if (b === 1) return '30 huevos'
  return `${entero.format(b)} bandejas`
}
export const hoyISO = () => diaISO.format(new Date())
