import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import AvisoError from './AvisoError'
import Dialogo from './Dialogo'
import { Boton, Campo, CampoClave } from './ui'
import { api } from '../lib/api'
import { erroresDe } from '../lib/abm'
import { errorClave, errorNombre, errorRepetir, requisitosClave } from '../lib/reglasUsuario'

// "Editar perfil" del menú lateral: cada uno cambia su nombre y, si quiere, su clave.
// El usuario, el email y el rol los cambia solo el Administrador desde "Usuarios y roles".
export default function EditarPerfil({ usuario, alCerrar }) {
  const cliente = useQueryClient()
  const guardar = useMutation({
    mutationFn: (datos) => api('/auth/yo/', { metodo: 'PATCH', datos }),
    onSuccess: (yo) => { cliente.setQueryData(['sesion'], yo); alCerrar() },
  })
  const [locales, setLocales] = useState({})
  const [nombre, setNombre] = useState(usuario.first_name ?? '')
  const [clave, setClave] = useState('')
  const errores = { ...erroresDe(guardar.error), ...locales }
  const datosClave = { usuario: usuario.username, nombre: nombre.trim() }

  function revisar(datos) {
    const encontrados = {
      first_name: errorNombre(datos.first_name, 'nombre'),
      last_name: errorNombre(datos.last_name, 'apellido'),
      clave_actual: datos.clave_nueva && !datos.clave_actual ? 'Escribí tu clave actual.' : '',
      clave_nueva: datos.clave_nueva ? errorClave(datos.clave_nueva, datosClave) : '',
      clave2: datos.clave_nueva ? errorRepetir(datos.clave_nueva, datos.clave2) : '',
    }
    return Object.fromEntries(Object.entries(encontrados).filter(([, texto]) => texto))
  }

  function enviar(evento) {
    evento.preventDefault()
    const form = evento.currentTarget
    const datos = Object.fromEntries(new FormData(form))
    const encontrados = revisar(datos)
    setLocales(encontrados)
    if (Object.keys(encontrados).length > 0) {
      ;[...form.elements].find((el) => el.name in encontrados)?.focus()
      return
    }
    delete datos.clave2
    if (!datos.clave_nueva) { delete datos.clave_actual; delete datos.clave_nueva }
    guardar.mutate(datos)
  }

  return (
    <Dialogo titulo="Editar perfil" descripcion={`Entrás como ${usuario.username} · ${usuario.rol}`} alCerrar={alCerrar}>
      <form onSubmit={enviar} noValidate
        onChange={(e) => { if (Object.keys(locales).length) setLocales(revisar(Object.fromEntries(new FormData(e.currentTarget)))) }}>
        <div className="dialogo__cuerpo">
          <div className="fila-2">
            <Campo etiqueta="Nombre" name="first_name" value={nombre} onChange={(e) => setNombre(e.target.value)}
              error={errores.first_name} autoComplete="given-name" maxLength={40} data-foco />
            <Campo etiqueta="Apellido" name="last_name" defaultValue={usuario.last_name} error={errores.last_name}
              autoComplete="family-name" maxLength={40} />
          </div>
          <p className="suave">Cambiar la clave (opcional): dejala vacía para no cambiarla.</p>
          <CampoClave etiqueta="Clave actual" name="clave_actual" error={errores.clave_actual} autoComplete="current-password" />
          <CampoClave etiqueta="Clave nueva" name="clave_nueva" value={clave} onChange={(e) => setClave(e.target.value)}
            error={errores.clave_nueva} autoComplete="new-password"
            requisitos={clave ? requisitosClave(clave, datosClave) : undefined} />
          {clave && <CampoClave etiqueta="Repetir clave nueva" name="clave2" error={errores.clave2} autoComplete="new-password" />}
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
