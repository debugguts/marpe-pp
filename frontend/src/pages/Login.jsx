import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'
import { Boton, Campo } from '../components/ui'
import { useLogin, useSesion } from '../lib/sesion'

export default function Login() {
  const { data: usuario } = useSesion()
  const login = useLogin()
  const navegar = useNavigate()
  const destino = useLocation().state?.desde || '/'
  const [datos, setDatos] = useState({ usuario: '', clave: '' })
  const [aviso, setAviso] = useState('')

  if (usuario) return <Navigate to={destino} replace />

  const cambiar = (e) => setDatos({ ...datos, [e.target.name]: e.target.value })

  const enviar = (e) => {
    e.preventDefault()
    if (!datos.usuario.trim() || !datos.clave) {
      setAviso('Completá el usuario y la contraseña.')
      return
    }
    setAviso('')
    login.mutate(datos, { onSuccess: () => navegar(destino, { replace: true }) })
  }

  const error = aviso || (login.isError ? login.error.message : '')

  return (
    <main className="login">
      <form className="login__tarjeta" onSubmit={enviar} noValidate>
        <div className="login__marca"><Logo alto={56} /></div>
        <div className="login__titulo">
          <h1>Iniciar sesión</h1>
          <p>Ingresá con tu usuario de Huevería Marpe.</p>
        </div>
        <Campo
          etiqueta="Usuario"
          name="usuario"
          value={datos.usuario}
          onChange={cambiar}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
        />
        <Campo
          etiqueta="Contraseña"
          name="clave"
          type="password"
          value={datos.clave}
          onChange={cambiar}
          autoComplete="current-password"
        />
        <p className="login__error" role="alert">{error}</p>
        <Boton type="submit" cargando={login.isPending} textoCargando="Ingresando…" className="login__boton">
          Ingresar
        </Boton>
      </form>
    </main>
  )
}
