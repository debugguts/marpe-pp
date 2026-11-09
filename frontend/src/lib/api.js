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
  if (!respuesta.ok) throw new ErrorApi(respuesta.status, cuerpo)
  return cuerpo
}
