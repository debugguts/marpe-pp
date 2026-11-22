import { useState } from 'react'
import { erroresDe, useGuardar } from '../lib/abm'
import AvisoError from './AvisoError'
import Dialogo from './Dialogo'
import { Boton } from './ui'

// Formulario de alta y edición dentro de una ventana.
// Si recibe "id" modifica ese registro; si no, da de alta uno nuevo.
// Los errores de un campo se muestran debajo del campo; los generales (una regla del negocio,
// sin conexión, sin permiso) se avisan en una ventana para que no pasen desapercibidos.
// "children" es una función que recibe los errores y dibuja los campos:
//   {(errores) => <Campo name="nombre" error={errores.nombre} ... />}
// "validar" (opcional) revisa en la web antes de mandar: (datos) => { campo: 'mensaje' }.
// Un campo avisa recién cuando se sale de él (no mientras se escribe por primera vez);
// después de intentar guardar, avisan todos y el aviso se va solo al corregir.
export default function FormularioABM({ recurso, id, titulo, descripcion, alCerrar, validar, children }) {
  const guardar = useGuardar(recurso)
  const [tocados, setTocados] = useState(() => new Set())
  const [intentado, setIntentado] = useState(false)
  const [locales, setLocales] = useState({})
  const errores = { ...erroresDe(guardar.error), ...locales }

  // Toma los valores de los campos por su "name": { nombre: '...', telefono: '...' }
  const leer = (form) => Object.fromEntries(new FormData(form))

  function revisar(form, vistos = tocados, todos = intentado) {
    const encontrados = validar?.(leer(form)) ?? {}
    setLocales(todos ? encontrados : Object.fromEntries(Object.entries(encontrados).filter(([c]) => vistos.has(c))))
    return encontrados
  }

  function alSalir(evento) {
    const campo = evento.target.name
    if (!validar || !campo || tocados.has(campo)) return
    const vistos = new Set(tocados).add(campo)
    setTocados(vistos)
    revisar(evento.currentTarget, vistos)
  }

  function alCambiar(evento) {
    if (validar && (intentado || tocados.has(evento.target.name))) revisar(evento.currentTarget)
  }

  function enviar(evento) {
    evento.preventDefault()
    const form = evento.currentTarget
    setIntentado(true)
    const encontrados = revisar(form, tocados, true)
    if (Object.keys(encontrados).length > 0) {
      // Lleva el cursor al primer campo con problema.
      ;[...form.elements].find((el) => el.name in encontrados)?.focus()
      return
    }
    guardar.mutate({ id, datos: leer(form) }, { onSuccess: alCerrar })
  }

  return (
    <Dialogo titulo={titulo} descripcion={descripcion} alCerrar={alCerrar}>
      <form onSubmit={enviar} onBlur={alSalir} onChange={alCambiar} noValidate>
        <div className="dialogo__cuerpo">
          {children(errores)}
        </div>
        <footer className="dialogo__pie">
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" cargando={guardar.isPending} textoCargando="Guardando…">
            {id ? 'Guardar cambios' : 'Dar de alta'}
          </Boton>
        </footer>
      </form>
      {errores.general && <AvisoError error={guardar.error} alCerrar={() => guardar.reset()} />}
    </Dialogo>
  )
}
