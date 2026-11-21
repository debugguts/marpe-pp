import { useDeferredValue, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AvisoError from '../components/AvisoError'
import Dialogo from '../components/Dialogo'
import Icono from '../components/Icono'
import FormularioABM from '../components/FormularioABM'
import { Boton, CabeceraPagina, Campo, CampoClave, EstadoVacio, Insignia, Panel } from '../components/ui'
import { errorClave, errorNombre, errorRepetir, errorUsuario, normalizarUsuario, requisitosClave } from '../lib/reglasUsuario'
import { api } from '../lib/api'
import { fecha, haceCuanto, hora, numero } from '../lib/formato'
import { useEsAdministrador, useSesion } from '../lib/sesion'
import '../styles/movimientos.css'

// Usuarios y roles (HU-01 · solo administrador). El rol decide qué puede hacer cada uno:
// el Operador vende, cobra, opera la caja y carga mermas; el Administrador gestiona todo.
// Un usuario no se borra: se da de baja y no puede entrar, pero lo que hizo sigue a su nombre.
// En «Actividad» se ve quién hizo qué y cuándo (REGISTRO_ACTIVIDAD).
export default function Usuarios() {
  const esAdministrador = useEsAdministrador()
  // La solapa queda en la dirección (?ver=actividad): al recargar o volver atrás sigue en la misma.
  const [parametros, setParametros] = useSearchParams()
  const ver = parametros.get('ver') === 'actividad' ? 'actividad' : 'usuarios'
  const setVer = (v) => setParametros(v === 'actividad' ? { ver: v } : {}, { replace: true })
  const [editando, setEditando] = useState(null)

  if (!esAdministrador) {
    return <EstadoVacio icono="usuarios" titulo="Solo el administrador" texto="Esta sección la maneja el administrador del negocio." />
  }

  const nuevo = ver === 'usuarios' && <Boton icono="mas" onClick={() => setEditando({})}>Nuevo usuario</Boton>
  return (
    <>
      <CabeceraPagina titulo="Usuarios y roles" descripcion="Quién entra al sistema y qué puede hacer." acciones={nuevo} />
      <div className="segmentado" role="group" aria-label="Qué mostrar">
        {[['usuarios', 'Usuarios'], ['actividad', 'Actividad']].map(([v, texto]) => (
          <button key={v} type="button" className="segmentado__opcion" aria-pressed={ver === v} onClick={() => setVer(v)}>{texto}</button>
        ))}
      </div>
      {ver === 'usuarios' ? <ListaUsuarios alEditar={setEditando} /> : <Actividad />}
      {editando && <FormularioUsuario usuario={editando} alCerrar={() => setEditando(null)} />}
    </>
  )
}

const POR_PAGINA = 20 // igual que PAGE_SIZE en settings.py
const sinNombre = (u) => !u.first_name && !u.last_name

function ListaUsuarios({ alEditar }) {
  const cliente = useQueryClient()
  const yo = useSesion().data
  const [estado, setEstado] = useState('ACTIVO')
  const [buscar, setBuscar] = useState('')
  const [pagina, setPagina] = useState(1)
  const [aDarDeBaja, setADarDeBaja] = useState(null)
  const [fallo, setFallo] = useState(null)
  const texto = useDeferredValue(buscar.trim())
  const usuarios = useQuery({
    queryKey: ['usuarios', estado, texto, pagina],
    queryFn: () => api(`/usuarios/?${new URLSearchParams({ estado, search: texto, page: pagina })}`),
    placeholderData: keepPreviousData,
  })
  const reactivar = useMutation({
    mutationFn: (id) => api(`/usuarios/${id}/reactivar/`, { metodo: 'POST' }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['usuarios'] }),
    onError: setFallo,
  })
  const filas = usuarios.data?.results ?? []
  const total = usuarios.data?.count ?? 0
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const filtrar = (aplicar) => (e) => { aplicar(e.target.value); setPagina(1) }

  return (
    <>
      <div className="abm-barra" role="search">
        <Campo etiqueta="Buscar" type="search" value={buscar} onChange={filtrar(setBuscar)}
          placeholder="Usuario o nombre…" autoComplete="off" className="abm-buscar-campo" />
        <Campo as="select" etiqueta="Mostrar" value={estado} onChange={filtrar(setEstado)}>
          <option value="ACTIVO">Activos</option>
          <option value="INACTIVO">Dados de baja</option>
          <option value="">Todos</option>
        </Campo>
      </div>

      {usuarios.isError ? (
        <EstadoVacio icono="cerrar" titulo="No se pudo cargar la lista" texto={usuarios.error.message}>
          <Boton variante="secundario" onClick={() => usuarios.refetch()}>Reintentar</Boton>
        </EstadoVacio>
      ) : (
        <Panel className="usuarios">
          <div className="tabla-wrap">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Usuario</th><th scope="col">Nombre</th><th scope="col">Rol</th>
                  <th scope="col">App del celular</th><th scope="col">Último ingreso</th>
                  <th scope="col" className="num"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((u) => {
                  const soyYo = u.id_usuario === yo?.id_usuario
                  return (
                    <tr key={u.id_usuario} className={u.estado === 'INACTIVO' ? 'is-baja' : undefined}>
                      <td><strong>{u.username}</strong>{soyYo && <span className="suave"> (vos)</span>}</td>
                      <td>
                        {sinNombre(u) ? (
                          <span className="usuarios__sin-nombre">
                            <span className="suave">Sin nombre</span>
                            {u.estado === 'ACTIVO' && (
                              <button type="button" className="enlace" onClick={() => alEditar(u)}
                                aria-label={`Completar el nombre de ${u.username}`}>Completar</button>
                            )}
                          </span>
                        ) : u.nombre}
                      </td>
                      <td><Insignia variante={u.rol === 'Administrador' ? 'marca' : 'neutro'}>{u.rol}</Insignia></td>
                      <td>
                        {u.email
                          ? <span className="usuarios__app" title={u.email}><Icono nombre="celular" tamano={16} />Habilitada</span>
                          : <span className="suave">No</span>}
                      </td>
                      <td>
                        {u.last_login
                          ? <time dateTime={u.last_login} title={`${fecha(u.last_login)} ${hora(u.last_login)}`}>{haceCuanto(u.last_login)}</time>
                          : <span className="suave">Nunca</span>}
                      </td>
                      <td className="num">
                        {u.estado === 'ACTIVO' ? (
                          <div className="abm-acciones usuarios__acciones">
                            <Boton variante="fantasma" icono="editar" onClick={() => alEditar(u)} aria-label={`Editar ${u.username}`}>Editar</Boton>
                            {/* A uno mismo no se lo puede dar de baja: el botón queda apagado y explica por qué (y la fila no se desalinea) */}
                            <Boton variante="fantasma" icono="archivar" className="btn--baja" disabled={soyYo}
                              title={soyYo ? 'No podés darte de baja a vos mismo' : undefined}
                              onClick={() => setADarDeBaja(u)} aria-label={`Dar de baja ${u.username}`}>Dar de baja</Boton>
                          </div>
                        ) : (
                          <Boton variante="fantasma" icono="reactivar" cargando={reactivar.isPending && reactivar.variables === u.id_usuario}
                            onClick={() => reactivar.mutate(u.id_usuario)} aria-label={`Reactivar ${u.username}`}>Reactivar</Boton>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {usuarios.isPending && <p className="suave" aria-live="polite">Cargando…</p>}
          {!usuarios.isPending && filas.length === 0 && (
            <p className="suave">{texto ? 'Nadie coincide con la búsqueda.' : 'No hay usuarios con ese filtro.'}</p>
          )}
          <footer className="abm-pie">
            <p className="suave" aria-live="polite">
              {numero(total)} {total === 1 ? 'usuario' : 'usuarios'}{paginas > 1 && ` · página ${pagina} de ${paginas}`}
            </p>
            {paginas > 1 && (
              <div className="abm-paginas">
                <Boton variante="secundario" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)}>Anterior</Boton>
                <Boton variante="secundario" disabled={pagina === paginas} onClick={() => setPagina(pagina + 1)}>Siguiente</Boton>
              </div>
            )}
          </footer>
        </Panel>
      )}
      {aDarDeBaja && <BajaUsuario usuario={aDarDeBaja} alCerrar={() => setADarDeBaja(null)} alFallar={setFallo} />}
      {fallo && <AvisoError error={fallo} titulo="No se pudo completar" alCerrar={() => setFallo(null)} />}
    </>
  )
}

// Alta y edición de un usuario. Las reglas (lib/reglasUsuario.js) se avisan antes de mandar
// y la clave muestra sus requisitos mientras se escribe; el servidor vuelve a revisar todo.
function FormularioUsuario({ usuario, alCerrar }) {
  const nuevo = !usuario.id_usuario
  const [username, setUsername] = useState(usuario.username ?? '')
  const [nombre, setNombre] = useState(usuario.first_name ?? '')
  const [clave, setClave] = useState('')
  const datosClave = { usuario: username, nombre: nombre.trim() }
  // Al editar, la clave es opcional: «Repetir» aparece recién cuando se empieza a escribir una nueva.
  const pideRepetir = nuevo || clave !== ''

  const validar = (datos) => {
    const errores = {
      username: nuevo ? errorUsuario(datos.username) : '',
      first_name: errorNombre(datos.first_name, 'nombre'),
      last_name: errorNombre(datos.last_name, 'apellido'),
      clave: nuevo || datos.clave ? errorClave(datos.clave, datosClave) : '',
      clave2: pideRepetir ? errorRepetir(datos.clave, datos.clave2) : '',
    }
    return Object.fromEntries(Object.entries(errores).filter(([, texto]) => texto))
  }

  return (
    <FormularioABM recurso="usuarios" id={usuario.id_usuario} alCerrar={alCerrar} validar={validar}
      titulo={nuevo ? 'Nuevo usuario' : `Editar a ${usuario.username}`}
      descripcion={nuevo ? 'La clave se guarda cifrada: nadie la puede ver, ni el administrador.' : 'Dejá la clave vacía para no cambiarla.'}>
      {(errores) => (
        <>
          {/* Al editar no se manda: el usuario no cambia (es con lo que entra y queda en el historial). */}
          <Campo etiqueta="Usuario" name={nuevo ? 'username' : undefined} value={username} error={errores.username}
            onChange={(e) => setUsername(normalizarUsuario(e.target.value))}
            autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={20} placeholder="Ej.: lucia"
            readOnly={!nuevo} data-foco={nuevo || undefined}
            ayuda={nuevo ? 'Con esto entra al sistema. Minúsculas, sin espacios; puede llevar números (marta2).' : 'El usuario no se puede cambiar.'} />
          <div className="fila-2">
            <Campo etiqueta="Nombre" name="first_name" value={nombre} onChange={(e) => setNombre(e.target.value)}
              error={errores.first_name} autoComplete="off" maxLength={40} placeholder="Ej.: Lucía" data-foco={!nuevo || undefined} />
            <Campo etiqueta="Apellido" name="last_name" defaultValue={usuario.last_name} error={errores.last_name}
              autoComplete="off" maxLength={40} placeholder="Ej.: Pérez" />
          </div>
          <Campo etiqueta="Email para la app del celular (opcional)" name="email" type="email" defaultValue={usuario.email}
            error={errores.email} autoComplete="off" spellCheck={false} placeholder="Ej.: lucia@gmail.com"
            ayuda="Solo si esta persona entra desde el celular: es su cuenta de Firebase." />
          <fieldset className="opciones">
            <legend>Rol</legend>
            <div className="opciones__lista">
              <label className="opcion">
                <input type="radio" name="rol" value="Operador" defaultChecked={(usuario.rol ?? 'Operador') === 'Operador'} />
                <strong>Operador</strong>
                <small>Vende, cobra, opera la caja y carga mermas.</small>
              </label>
              <label className="opcion">
                <input type="radio" name="rol" value="Administrador" defaultChecked={usuario.rol === 'Administrador'} />
                <strong>Administrador</strong>
                <small>Además: compras, gastos, precios, catálogo y usuarios.</small>
              </label>
            </div>
            {errores.rol && <p className="campo__error" aria-live="polite">{errores.rol}</p>}
          </fieldset>
          {/* Una debajo de la otra: la lista de requisitos entra en dos columnas sin apretar el campo */}
          <CampoClave etiqueta={nuevo ? 'Clave' : 'Clave nueva (opcional)'} name="clave" value={clave}
            onChange={(e) => setClave(e.target.value)} error={errores.clave} autoComplete="new-password"
            requisitos={pideRepetir ? requisitosClave(clave, datosClave) : undefined} />
          {pideRepetir && (
            <CampoClave etiqueta="Repetir clave" name="clave2" error={errores.clave2} autoComplete="new-password" />
          )}
        </>
      )}
    </FormularioABM>
  )
}

function BajaUsuario({ usuario, alCerrar, alFallar }) {
  const cliente = useQueryClient()
  const baja = useMutation({
    mutationFn: () => api(`/usuarios/${usuario.id_usuario}/`, { metodo: 'DELETE' }),
    onSuccess: () => { cliente.invalidateQueries({ queryKey: ['usuarios'] }); alCerrar() },
    onError: (error) => { alCerrar(); alFallar(error) },
  })
  return (
    <Dialogo titulo={`¿Dar de baja a «${usuario.username}»?`} alCerrar={alCerrar}>
      <div className="dialogo__cuerpo">
        <p>No va a poder entrar al sistema. No se borra: sus ventas, cobros y movimientos siguen a su nombre, y lo podés reactivar.</p>
      </div>
      <footer className="dialogo__pie">
        <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
        <Boton variante="peligro" cargando={baja.isPending} textoCargando="Dando de baja…" onClick={() => baja.mutate()}>Dar de baja</Boton>
      </footer>
    </Dialogo>
  )
}

// Quién hizo qué y cuándo. Sirve para auditar: altas, modificaciones, anulaciones, cobros…
// Los textos ya vienen legibles del servidor (apps/usuarios/actividad.py).
const ENTIDADES = [
  ['', 'Todo'], ['Venta', 'Ventas'], ['Compra', 'Compras'], ['Gasto', 'Gastos'], ['Caja', 'Caja'],
  ['MovimientoInventario', 'Movimientos de inventario'], ['CuentaCorriente', 'Cuentas corrientes'],
  ['PrecioProducto', 'Precios'], ['Producto', 'Productos'], ['Presentacion', 'Presentaciones'],
  ['Proveedor', 'Proveedores'], ['Cliente', 'Clientes'], ['Usuario', 'Usuarios'],
]
const SIN_FILTROS = { quien: '', entidad: '', desde: '', hasta: '' }

function Actividad() {
  const [filtros, setFiltros] = useState(SIN_FILTROS)
  const [pagina, setPagina] = useState(1)
  const filtrar = (campo) => (e) => { setFiltros({ ...filtros, [campo]: e.target.value }); setPagina(1) }
  const hayFiltros = Object.values(filtros).some(Boolean)

  const parametros = new URLSearchParams({ page: pagina })
  if (filtros.quien) parametros.set('usuario', filtros.quien)
  if (filtros.entidad) parametros.set('entidad', filtros.entidad)
  if (filtros.desde) parametros.set('desde', filtros.desde)
  if (filtros.hasta) parametros.set('hasta', filtros.hasta)

  // Todos los usuarios, también los dados de baja: lo que hicieron sigue en el registro.
  const usuarios = useQuery({ queryKey: ['usuarios', 'todos'], queryFn: () => api('/usuarios/?estado=') })
  const registros = useQuery({
    queryKey: ['actividad', filtros, pagina],
    queryFn: () => api(`/actividad/?${parametros}`),
    placeholderData: keepPreviousData,
  })
  const filas = registros.data?.results ?? []
  const total = registros.data?.count ?? 0
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  return (
    <Panel titulo="Registro de actividad" className="actividad">
      <div className="actividad__filtros" role="search">
        <Campo as="select" etiqueta="Usuario" value={filtros.quien} onChange={filtrar('quien')}>
          <option value="">Todos</option>
          {(usuarios.data?.results ?? []).map((u) => (
            <option key={u.id_usuario} value={u.id_usuario}>
              {sinNombre(u) ? u.username : `${u.nombre} (${u.username})`}{u.estado === 'INACTIVO' ? ' · de baja' : ''}
            </option>
          ))}
        </Campo>
        <Campo as="select" etiqueta="Sobre" value={filtros.entidad} onChange={filtrar('entidad')}>
          {ENTIDADES.map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
        </Campo>
        <Campo etiqueta="Desde" type="date" value={filtros.desde} max={filtros.hasta || undefined} onChange={filtrar('desde')} />
        <Campo etiqueta="Hasta" type="date" value={filtros.hasta} min={filtros.desde || undefined} onChange={filtrar('hasta')} />
        {hayFiltros && (
          <Boton variante="fantasma" icono="cerrar" className="actividad__limpiar"
            onClick={() => { setFiltros(SIN_FILTROS); setPagina(1) }}>Limpiar filtros</Boton>
        )}
      </div>

      {registros.isError ? (
        <EstadoVacio icono="cerrar" titulo="No se pudo cargar la actividad" texto={registros.error.message}>
          <Boton variante="secundario" onClick={() => registros.refetch()}>Reintentar</Boton>
        </EstadoVacio>
      ) : (
        <>
          <div className="tabla-wrap">
            <table className="tabla">
              <thead>
                <tr><th scope="col">Fecha</th><th scope="col">Quién</th><th scope="col">Operación</th><th scope="col">Sobre</th><th scope="col">Detalle</th></tr>
              </thead>
              <tbody>
                {filas.map((r) => (
                  <tr key={r.id_actividad}>
                    <td className="actividad__fecha">{fecha(r.fecha_hora)} <span className="suave">{hora(r.fecha_hora)}</span></td>
                    <td>
                      {r.usuario_nombre
                        ? <span className="actividad__quien">{r.usuario_nombre}{r.usuario_nombre !== r.usuario_username && <small className="suave">{r.usuario_username}</small>}</span>
                        : <span className="suave">Sistema</span>}
                    </td>
                    <td><Insignia variante={r.operacion === 'Anulación' || r.operacion === 'Baja' ? 'peligro' : r.operacion === 'Alta' ? 'exito' : 'neutro'}>{r.operacion}</Insignia></td>
                    <td>{r.entidad_nombre} <span className="suave">Nº {r.referencia_registro}</span></td>
                    <td className="actividad__detalle">{r.detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {registros.isPending && <p className="suave" aria-live="polite">Cargando…</p>}
          {!registros.isPending && filas.length === 0 && (
            <p className="suave">{hayFiltros ? 'No hay registros con esos filtros.' : 'Todavía no hay registros.'}</p>
          )}
          <footer className="abm-pie">
            <p className="suave" aria-live="polite">
              {numero(total)} {total === 1 ? 'registro' : 'registros'}{paginas > 1 && ` · página ${pagina} de ${paginas}`}
            </p>
            {paginas > 1 && (
              <div className="abm-paginas">
                <Boton variante="secundario" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)}>Anterior</Boton>
                <Boton variante="secundario" disabled={pagina === paginas} onClick={() => setPagina(pagina + 1)}>Siguiente</Boton>
              </div>
            )}
          </footer>
        </>
      )}
    </Panel>
  )
}
