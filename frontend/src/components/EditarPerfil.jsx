import { useMutation, useQueryClient } from '@tanstack/react-query'
import AvisoError from './AvisoError'
import Dialogo from './Dialogo'
import { Boton, Campo } from './ui'
import { api } from '../lib/api'
import { erroresDe } from '../lib/abm'

// "Editar perfil" del menú lateral: cada uno cambia su nombre y, si quiere, su clave.
// El usuario, el email y el rol los cambia solo el Administrador desde "Usuarios y roles".
export default function EditarPerfil({ usuario, alCerrar }) {
  const cliente = useQueryClient()
  const guardar = useMutation({
    mutationFn: (datos) => api('/auth/yo/', { metodo: 'PATCH', datos }),
    onSuccess: (yo) => { cliente.setQueryData(['sesion'], yo); alCerrar() },
  })
  const errores = erroresDe(guardar.error)

  function enviar(evento) {
    evento.preventDefault()
    const datos = Object.fromEntries(new FormData(evento.currentTarget))
    if (!datos.clave_nueva) { delete datos.clave_actual; delete datos.clave_nueva }
    guardar.mutate(datos)
  }

  return (
    <Dialogo titulo="Editar perfil" descripcion={`Entrás como ${usuario.username} · ${usuario.rol}`} alCerrar={alCerrar}>
      <form onSubmit={enviar} noValidate>
        <div className="dialogo__cuerpo">
          <div className="fila-2">
            <Campo etiqueta="Nombre" name="first_name" defaultValue={usuario.first_name} error={errores.first_name}
              autoComplete="given-name" data-foco />
            <Campo etiqueta="Apellido" name="last_name" defaultValue={usuario.last_name} error={errores.last_name}
              autoComplete="family-name" />
          </div>
          <p className="suave">Cambiar la clave (opcional): dejala vacía para no cambiarla.</p>
          <div className="fila-2">
            <Campo etiqueta="Clave actual" name="clave_actual" type="password" error={errores.clave_actual}
              autoComplete="current-password" />
            <Campo etiqueta="Clave nueva" name="clave_nueva" type="password" error={errores.clave_nueva}
              autoComplete="new-password" />
          </div>
        </div>
        <footer className="dialogo__pie">
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" cargando={guardar.isPending} textoCargando="Guardando…">Guardar cambios</Boton>
        </footer>
      </form>
      {errores.general && <AvisoError error={guardar.error} alCerrar={() => guardar.reset()} />}
    </Dialogo>
  )
}
