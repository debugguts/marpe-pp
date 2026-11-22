// Reglas del formulario de presentación (las mismas controla la API).
export const MAX_BANDEJAS_CAJA = 50

export function validarPresentacion(d) {
  const e = {}
  const nombre = (d.nombre ?? '').trim()
  if (!nombre) e.nombre = 'Escribí el nombre, por ejemplo «Caja» o «Maple de 20».'
  else if (nombre.length < 3) e.nombre = 'El nombre tiene que tener al menos 3 letras.'
  else if (!/[a-záéíóúñü]/i.test(nombre)) e.nombre = 'El nombre tiene que tener letras, no solo números o signos.'
  else if (nombre.length > 50) e.nombre = 'El nombre no puede pasar de 50 letras.'
  if (d.formato === 'CAJA') {
    const n = Number(d.bandejas_caja)
    if (!/^\d+$/.test(d.bandejas_caja ?? '') || n < 2) e.bandejas_caja = 'Una caja trae 2 bandejas o más (en números enteros).'
    else if (n > MAX_BANDEJAS_CAJA) e.bandejas_caja = `Una caja no puede traer más de ${MAX_BANDEJAS_CAJA} bandejas.`
  }
  return e
}
