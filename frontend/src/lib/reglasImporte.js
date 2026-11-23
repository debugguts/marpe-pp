// Importes en pesos (caja, gastos): sin signos, hasta 2 decimales y con tope. La API controla lo mismo.
export const IMPORTE_MAXIMO = 100000000

// cero: si se acepta $ 0 (por ejemplo, abrir la caja sin cambio o contar una caja vacía).
export function errorImporte(texto, { cero = false, maximo = IMPORTE_MAXIMO, etiqueta = 'el importe' } = {}) {
  const valor = String(texto ?? '').trim()
  if (!valor) return `Indicá ${etiqueta}.`
  if (!/^\d+(\.\d{1,2})?$/.test(valor)) return 'Escribí solo números (sin signos), con hasta 2 decimales.'
  const n = Number(valor)
  if (!cero && n <= 0) return 'Tiene que ser mayor a $ 0.'
  if (n > maximo) return `No puede pasar de $ ${maximo.toLocaleString('es-AR')}.`
  return ''
}

// No deja escribir - + e E (la coma o el punto sí, para los centavos).
export function sinSignos(evento) {
  if (['-', '+', 'e', 'E'].includes(evento.key)) evento.preventDefault()
}

export const sinRueda = (evento) => evento.currentTarget.blur()
