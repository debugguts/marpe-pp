// Reglas del nombre y el teléfono de clientes y proveedores: las mismas que config/validaciones.py.
// La web avisa al instante; el servidor decide (y además controla que el nombre no esté repetido).

const PATRON_NOMBRE = /^\p{L}[\p{L}\p{N}\s.,'&/()-]*$/u
const PATRON_TELEFONO = /^[0-9+\-\s()]{6,20}$/

export function errorNombreContacto(texto = '') {
  const valor = texto.trim().replace(/\s+/g, ' ')
  if (!valor) return 'Escribí el nombre.'
  if (valor.length > 80) return 'El nombre no puede pasar de 80 caracteres.'
  const letras = (valor.match(/\p{L}/gu) ?? []).length
  if (letras < 3 || !PATRON_NOMBRE.test(valor)) {
    return 'El nombre tiene que empezar con una letra y tener al menos 3 letras (no solo números o signos).'
  }
  return ''
}

export function errorTelefono(texto = '') {
  const valor = texto.trim()
  if (!valor) return '' // es opcional
  const digitos = (valor.match(/\d/g) ?? []).length
  if (!PATRON_TELEFONO.test(valor) || digitos < 6 || digitos > 12) {
    return 'Usá solo números, espacios, guiones, + o paréntesis (entre 6 y 12 números).'
  }
  return ''
}

// Para el formulario: { campo: 'mensaje' } con lo que está mal.
export function validarContacto(datos) {
  const errores = {}
  const nombre = errorNombreContacto(datos.nombre)
  const telefono = errorTelefono(datos.telefono)
  if (nombre) errores.nombre = nombre
  if (telefono) errores.telefono = telefono
  return errores
}

// En el teléfono no se pueden escribir letras.
export function soloTelefono(evento) {
  if (evento.ctrlKey || evento.metaKey || evento.key.length !== 1) return
  if (!/[0-9+\-\s()]/.test(evento.key)) evento.preventDefault()
}
