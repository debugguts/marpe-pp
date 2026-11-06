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
