import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'
import { Boton, Campo, CampoClave } from '../components/ui'
import { ZONA } from '../lib/formato'
import { useLogin, useSesion } from '../lib/sesion'

// Login animado: el paisaje con vida (FondoAnimado, montado en App) a la izquierda y el formulario en un panel a la derecha.
// Al ingresar bien hay una bienvenida antes de entrar al sistema:
//   form → enviando → saliendo (se va el panel) → bienvenida ("Bienvenido, Nombre", al centro)
//   → final (se desvanece el saludo) → Inicio, que entra de a poco (Layout, data-entrada).
// Con "reducir movimiento" la bienvenida es corta y sin desplazamientos.

const TIEMPOS = { saliendo: 650, bienvenida: 2300, final: 800 }
const TIEMPOS_QUIETO = { saliendo: 0, bienvenida: 1300, final: 300 }

const FECHA = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: ZONA })
const HORA = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA })

function Reloj() {
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  const fecha = FECHA.format(ahora)
  return (
    <p className="login__reloj">
      <i aria-hidden="true" />
      <time dateTime={ahora.toISOString()}>{fecha.charAt(0).toUpperCase() + fecha.slice(1)} · {HORA.format(ahora)} hs</time>
    </p>
  )
}

export default function Login() {
  const { data: usuario } = useSesion()
  const login = useLogin()
  const navegar = useNavigate()
  const destino = useLocation().state?.desde || '/'
  const [datos, setDatos] = useState({ usuario: '', clave: '' })
  const [aviso, setAviso] = useState(() => {
    // Viene de una sesión vencida: se explica una sola vez.
    if (sessionStorage.getItem('marpe-sesion-vencida')) {
      sessionStorage.removeItem('marpe-sesion-vencida')
      return 'Tu sesión venció. Volvé a ingresar para seguir.'
    }
    return ''
  })
  const [fase, setFase] = useState('form')
  const [quien, setQuien] = useState(null)
  const hola = useRef(null)
  const saludo = useRef(null)
  const relojes = useRef([])

  // Si se sale de la pantalla a mitad de la bienvenida, no quedan temporizadores sueltos.
  useEffect(() => {
    const pendientes = relojes.current
    return () => pendientes.forEach(clearTimeout)
  }, [])

  // El saludo "viaja" desde donde estaba "Bienvenido de nuevo" hasta el centro (técnica FLIP).
  useEffect(() => {
    if (fase !== 'bienvenida' || !hola.current || !saludo.current) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const a = hola.current.getBoundingClientRect()
    const b = saludo.current.getBoundingClientRect()
    const dx = a.left + a.width / 2 - (b.left + b.width / 2)
    const dy = a.top + a.height / 2 - (b.top + b.height / 2)
    const escala = Math.min(1, a.width / b.width)
    saludo.current.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scale(${escala})`, opacity: 0.3 }, { transform: 'none', opacity: 1 }],
      { duration: 900, easing: 'cubic-bezier(.2, .7, .2, 1)' },
    )
  }, [fase])

  // Durante la bienvenida se esconde el selector del momento del día (está en el fondo global).
  const enFormulario = fase === 'form' || fase === 'enviando'
  useEffect(() => {
    if (enFormulario) return
    document.documentElement.dataset.bienvenida = 'si'
    return () => { delete document.documentElement.dataset.bienvenida }
  }, [enFormulario])

  // Ya tenía sesión (entró directo a /login): al sistema sin animación.
  if (usuario && fase === 'form') return <Navigate to={destino} replace />

  const cambiar = (e) => setDatos({ ...datos, [e.target.name]: e.target.value })

  const entrar = (u) => {
    const t = matchMedia('(prefers-reduced-motion: reduce)').matches ? TIEMPOS_QUIETO : TIEMPOS
    setQuien(u)
    setFase('saliendo')
    const r = relojes.current
    r.push(setTimeout(() => setFase('bienvenida'), t.saliendo))
    r.push(setTimeout(() => setFase('final'), t.saliendo + t.bienvenida))
    r.push(setTimeout(() => {
      sessionStorage.setItem('marpe-entrada', '1') // el Layout entra animado una sola vez
      navegar(destino, { replace: true })
    }, t.saliendo + t.bienvenida + t.final))
  }

  const enviar = (e) => {
    e.preventDefault()
    if (!datos.usuario.trim() || !datos.clave) {
      setAviso('Completá el usuario y la contraseña.')
      return
    }
    setAviso('')
    setFase('enviando')
    login.mutate(datos, { onSuccess: entrar, onError: () => setFase('form') })
  }

  const error = aviso || (login.isError ? login.error.message : '')
  const primerNombre = quien?.nombre?.split(' ')[0] || quien?.username || ''

  return (
    <main className="login" data-fase={fase}>
      <div className="login__hola" ref={hola} aria-hidden={!enFormulario}>
        <small>Huevería Marpe · Cerrillos</small>
        <p className="login__hola-titulo">Bienvenido<br />de nuevo.</p>
        <p>Ventas, caja, compras e inventario en un solo lugar.</p>
      </div>

      <form className="login__tarjeta" onSubmit={enviar} noValidate inert={!enFormulario}>
        <div className="login__contenido">
          <div className="login__marca"><Logo alto={150} vertical /></div>
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
          {/* Con el «ojito» para mostrar u ocultar la contraseña */}
          <CampoClave
            etiqueta="Contraseña"
            name="clave"
            value={datos.clave}
            onChange={cambiar}
            autoComplete="current-password"
          />
          <p className="login__error" role="alert">{error}</p>
          <Boton type="submit" cargando={login.isPending} textoCargando="Ingresando…" className="login__boton">
            Ingresar
          </Boton>
          <Reloj />
        </div>
      </form>

      {(fase === 'bienvenida' || fase === 'final') && quien && (
        <div className="login__saludo" role="status">
          <div className="login__saludo-caja" ref={saludo}>
            <p className="login__saludo-titulo">Bienvenido, <span>{primerNombre}</span></p>
            <p className="login__saludo-rol">Estás accediendo como <b>{quien.rol}</b></p>
          </div>
        </div>
      )}
    </main>
  )
}
