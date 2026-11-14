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
export default function FormularioABM({ recurso, id, titulo, descripcion, alCerrar, children }) {
  const guardar = useGuardar(recurso)
  const errores = erroresDe(guardar.error)

  function enviar(evento) {
    evento.preventDefault()
    // Toma los valores de los campos por su "name": { nombre: '...', telefono: '...' }
    const datos = Object.fromEntries(new FormData(evento.currentTarget))
    guardar.mutate({ id, datos }, { onSuccess: alCerrar })
  }

  return (
    <Dialogo titulo={titulo} descripcion={descripcion} alCerrar={alCerrar}>
      <form onSubmit={enviar} noValidate>
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
