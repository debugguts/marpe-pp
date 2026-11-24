import { useSyncExternalStore } from 'react'

// Preferencias del fondo animado, compartidas por el login y el menú lateral (se guardan en este navegador):
//  · modo: 'auto' (según la hora) o un momento fijo: 'manana' | 'tarde' | 'atardecer' | 'noche'
//  · quieto: true deja el paisaje sin movimiento (sigue cambiando de color según el momento)

export const MOMENTOS = [
  { id: 'manana', texto: 'Mañana' },
  { id: 'tarde', texto: 'Tarde' },
  { id: 'atardecer', texto: 'Atardecer' },
  { id: 'noche', texto: 'Noche' },
]

// Hora del negocio (Salta), aunque la PC esté en otra zona.
const HORA = new Intl.DateTimeFormat('es-AR', { hour: 'numeric', minute: 'numeric', hour12: false, timeZone: 'America/Argentina/Salta' })
function momentoDelDia() {
  const [h, m] = HORA.format(new Date()).split(':').map(Number)
  const ahora = h + m / 60
  if (ahora >= 6 && ahora < 12) return 'manana'
  if (ahora >= 12 && ahora < 18) return 'tarde'
  if (ahora >= 18 && ahora < 20.5) return 'atardecer'
  return 'noche'
}

function leer(clave, porDefecto) {
  try { return localStorage.getItem(clave) ?? porDefecto } catch { return porDefecto }
}

let estado = { modo: leer('marpe-momento', 'auto'), quieto: leer('marpe-fondo-quieto', 'no') === 'si', delReloj: momentoDelDia() }
const oyentes = new Set()

function cambiar(parcial) {
  estado = { ...estado, ...parcial }
  try {
    localStorage.setItem('marpe-momento', estado.modo)
    localStorage.setItem('marpe-fondo-quieto', estado.quieto ? 'si' : 'no')
  } catch { /* sin almacenamiento: vale solo hasta recargar */ }
  oyentes.forEach((f) => f())
}

const suscribir = (f) => { oyentes.add(f); return () => oyentes.delete(f) }
const leerEstado = () => estado

// Revisa la hora (lo llama el fondo cada minuto): en automático el momento cambia solo.
export function actualizarHora() {
  const ahora = momentoDelDia()
  if (ahora !== estado.delReloj) cambiar({ delReloj: ahora })
}
export const elegirModo = (modo) => cambiar({ modo })
export const cambiarQuieto = () => cambiar({ quieto: !estado.quieto })

// { modo, quieto, momento } — "momento" es el que se ve ahora (en automático, el de la hora).
export function useFondo() {
  const e = useSyncExternalStore(suscribir, leerEstado)
  return { modo: e.modo, quieto: e.quieto, momento: e.modo === 'auto' ? e.delReloj : e.modo }
}
