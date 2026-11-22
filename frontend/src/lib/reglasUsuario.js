// Reglas de los datos de un usuario: las mismas que apps/usuarios/validaciones.py.
// La web avisa al instante; el servidor es el que decide (si alguien saltea la web, igual se rechaza).

const LETRA = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ'
const PATRON_USUARIO = /^[a-z][a-z0-9._]{2,19}$/
const PATRON_NOMBRE = new RegExp(`^[${LETRA}]+(?:[ '\\-][${LETRA}]+)*$`)

// Lo que se escribe en «Usuario» se acomoda solo: minúsculas, sin tildes y sin espacios.
export function normalizarUsuario(texto) {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '')
}

export function errorUsuario(texto = '') {
  const valor = texto.trim().toLowerCase()
  if (!valor) return 'Escribí el usuario.'
  if (!PATRON_USUARIO.test(valor)) {
    return 'De 3 a 20 caracteres: empieza con una letra y lleva solo letras sin tilde, números, punto o guion bajo.'
  }
  return ''
}

// campo: «nombre» o «apellido», para el mensaje.
export function errorNombre(texto = '', campo) {
  const valor = texto.trim().replace(/\s+/g, ' ')
  if (!valor) return `Escribí el ${campo}.`
  if (valor.length < 2 || valor.length > 40) return `El ${campo} tiene que tener entre 2 y 40 letras.`
  if (!PATRON_NOMBRE.test(valor)) return `El ${campo} lleva solo letras: sin números ni símbolos.`
  return ''
}

// Lista que se muestra debajo de la clave y se va tildando mientras se escribe.
// Lo que no se puede saber acá (clave demasiado común) lo avisa el servidor al guardar.
export function requisitosClave(clave = '', { usuario = '', nombre = '' } = {}) {
  const minuscula = clave.toLowerCase()
  const contieneDatos = [usuario, nombre].some((dato) => dato.length >= 3 && minuscula.includes(dato.toLowerCase()))
  return [
    { texto: 'Al menos 8 caracteres', ok: clave.length >= 8 },
    { texto: 'Al menos una letra', ok: /\p{L}/u.test(clave) },
    { texto: 'Al menos un número', ok: /\d/.test(clave) },
    { texto: 'Sin tu usuario ni tu nombre', ok: clave.length > 0 && !contieneDatos },
  ]
}

export function errorClave(clave = '', datos) {
  if (!clave) return 'Escribí una clave.'
  return requisitosClave(clave, datos).every((r) => r.ok) ? '' : 'La clave todavía no cumple todos los requisitos.'
}

export function errorRepetir(clave = '', repetida = '') {
  if (!repetida) return 'Repetí la clave.'
  return clave === repetida ? '' : 'No coincide con la clave.'
}
