// Pedidos a la API de Django. La sesión viaja sola en una cookie (credentials: 'same-origin').

function leerCookie(nombre) {
  const fila = document.cookie.split('; ').find((c) => c.startsWith(`${nombre}=`))
  return fila ? decodeURIComponent(fila.split('=')[1]) : null
}

// Error con el código HTTP y el mensaje que mandó Django ("detail").
export class ErrorApi extends Error {
  constructor(estado, datos) {
    super(datos?.detail || 'No se pudo completar la operación.')
    this.estado = estado
    this.datos = datos
  }
}

export async function api(ruta, { metodo = 'GET', datos } = {}) {
  const opciones = {
    method: metodo,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  }
  if (datos !== undefined) {
    opciones.headers['Content-Type'] = 'application/json'
    opciones.body = JSON.stringify(datos)
  }
  if (metodo !== 'GET') {
    // Django pide este token en los pedidos que cambian datos (protección CSRF).
    opciones.headers['X-CSRFToken'] = leerCookie('csrftoken')
  }

  let respuesta
  try {
    respuesta = await fetch(`/api${ruta}`, opciones)
  } catch {
    throw new ErrorApi(0, { detail: 'No hay conexión con el servidor. Revisá que Docker esté levantado.' })
  }
  const cuerpo = respuesta.status === 204 ? null : await respuesta.json().catch(() => null)
  if (!respuesta.ok) {
    if (ruta !== '/auth/yo/' && ruta !== '/auth/login/' && sesionVencida(respuesta.status, cuerpo)) {
      // La sesión del servidor ya no existe (venció, se cerró en otra pestaña o se reinició el servidor):
      // avisamos a la app para que vuelva al login en vez de mostrar errores en cada pantalla.
      window.dispatchEvent(new Event(SESION_VENCIDA))
    }
    throw new ErrorApi(respuesta.status, cuerpo)
  }
  return cuerpo
}

export const SESION_VENCIDA = 'marpe:sesion-vencida'

// Django responde 401, o 403 con este mensaje, cuando el pedido llega sin sesión.
function sesionVencida(estado, cuerpo) {
  if (estado === 401) return true
  const detalle = String(cuerpo?.detail || '')
  return estado === 403 && /credenciales de autenticación no se proveyeron|authentication credentials were not provided/i.test(detalle)
}
