import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import Logo from './Logo'
import Icono from './Icono'

// Items sin "a" todavía no existen: se muestran apagados con la marca "Pronto".
const GRUPOS = [
  {
    titulo: 'Operación',
    items: [
      { a: '/', texto: 'Inicio', icono: 'inicio', fin: true },
      { texto: 'Ventas', icono: 'ventas' },
      { texto: 'Caja', icono: 'caja' },
      { texto: 'Compras', icono: 'compras' },
      { texto: 'Inventario', icono: 'inventario' },
      { texto: 'Gastos', icono: 'gastos' },
    ],
  },
  {
    titulo: 'Maestros',
    items: [
      { a: '/catalogo', texto: 'Catálogo', icono: 'catalogo' },
      { a: '/clientes', texto: 'Clientes', icono: 'clientes' },
      { a: '/proveedores', texto: 'Proveedores', icono: 'proveedores' },
    ],
  },
  {
    titulo: 'Administración',
    items: [{ texto: 'Usuarios y roles', icono: 'usuarios' }],
  },
]

export default function Layout() {
  const [abierto, setAbierto] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => { setAbierto(false) }, [pathname])

  useEffect(() => {
    if (!abierto) return
    const alTecla = (e) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('keydown', alTecla)
    return () => document.removeEventListener('keydown', alTecla)
  }, [abierto])

  return (
    <div className="app">
      <a className="saltar" href="#contenido">Saltar al contenido</a>

      <header className="cabecera">
        <button
          type="button"
          className="cabecera__menu"
          aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={abierto}
          aria-controls="lateral"
          onClick={() => setAbierto((v) => !v)}
        >
          <Icono nombre={abierto ? 'cerrar' : 'menu'} />
        </button>

        <NavLink to="/" className="cabecera__logo"><Logo /></NavLink>

        {/* Datos de ejemplo hasta conectar el login (S4-05) */}
        <div className="cabecera__usuario">
          <span className="avatar" aria-hidden="true">G</span>
          <span className="cabecera__datos">
            <strong>Gustavo</strong>
            <small>Administrador</small>
          </span>
        </div>
      </header>

      <div className="cuerpo">
        <aside id="lateral" className="lateral sobre-oscuro" data-abierto={abierto || undefined}>
          <nav aria-label="Principal">
            {GRUPOS.map((g) => (
              <div className="nav-grupo" key={g.titulo}>
                <p className="nav-grupo__titulo">{g.titulo}</p>
                <ul className="nav-lista">
                  {g.items.map((it) => (
                    <li key={it.texto}>
                      {it.a ? (
                        <NavLink
                          to={it.a}
                          end={it.fin}
                          className={({ isActive }) => `nav-item${isActive ? ' is-activo' : ''}`}
                        >
                          <Icono nombre={it.icono} />
                          <span>{it.texto}</span>
                        </NavLink>
                      ) : (
                        <span className="nav-item is-pronto" aria-disabled="true">
                          <Icono nombre={it.icono} />
                          <span>{it.texto}</span>
                          <span className="nav-item__pronto">Pronto</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {abierto && (
          <button type="button" className="scrim" aria-label="Cerrar menú" tabIndex={-1} onClick={() => setAbierto(false)} />
        )}

        <main id="contenido" tabIndex={-1} className="contenido">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
