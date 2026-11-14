import { useDeferredValue, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AvisoError from '../components/AvisoError'
import Dialogo from '../components/Dialogo'
import FormularioABM from '../components/FormularioABM'
import { Boton, CabeceraPagina, Campo, EstadoVacio, Insignia, Panel } from '../components/ui'
import { api } from '../lib/api'
import { fecha, hora } from '../lib/formato'
import { useEsAdministrador, useSesion } from '../lib/sesion'
import '../styles/movimientos.css'

// Usuarios y roles (HU-01 · solo administrador). El rol decide qué puede hacer cada uno:
// el Operador vende, cobra, opera la caja y carga mermas; el Administrador gestiona todo.
// Un usuario no se borra: se da de baja y no puede entrar, pero lo que hizo sigue a su nombre.
// En «Actividad» se ve quién hizo qué y cuándo (REGISTRO_ACTIVIDAD).
export default function Usuarios() {
  const esAdministrador = useEsAdministrador()
  const [ver, setVer] = useState('usuarios')
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

function ListaUsuarios({ alEditar }) {
  const cliente = useQueryClient()
  const yo = useSesion().data
  const [estado, setEstado] = useState('ACTIVO')
  const [buscar, setBuscar] = useState('')
  const [aDarDeBaja, setADarDeBaja] = useState(null)
  const [fallo, setFallo] = useState(null)
  const texto = useDeferredValue(buscar.trim())
  const usuarios = useQuery({
    queryKey: ['usuarios', estado, texto],
    queryFn: () => api(`/usuarios/?estado=${estado}&search=${encodeURIComponent(texto)}`),
    placeholderData: keepPreviousData,
  })
  const reactivar = useMutation({
    mutationFn: (id) => api(`/usuarios/${id}/reactivar/`, { metodo: 'POST' }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['usuarios'] }),
    onError: setFallo,
  })
  const filas = usuarios.data?.results ?? []

  return (
    <>
      <div className="abm-barra" role="search">
        <Campo etiqueta="Buscar" type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)}
          placeholder="Usuario o nombre…" autoComplete="off" className="abm-buscar-campo" />
        <Campo as="select" etiqueta="Mostrar" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="ACTIVO">Activos</option>
          <option value="INACTIVO">Dados de baja</option>
        </Campo>
      </div>
      <Panel>
        <div className="tabla-wrap">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Usuario</th><th scope="col">Nombre</th><th scope="col">Rol</th>
                <th scope="col">Último ingreso</th><th scope="col"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((u) => (
                <tr key={u.id_usuario}>
                  <td><strong>{u.username}</strong>{u.id_usuario === yo?.id_usuario && <span className="suave"> (vos)</span>}</td>
                  <td>{u.nombre}</td>
                  <td><Insignia variante={u.rol === 'Administrador' ? 'marca' : 'neutro'}>{u.rol}</Insignia></td>
                  <td>{u.last_login ? `${fecha(u.last_login)} ${hora(u.last_login)}` : <span className="suave">Nunca</span>}</td>
                  <td className="num">
                    {u.estado === 'ACTIVO' ? (
                      <div className="abm-acciones">
                        <Boton variante="fantasma" icono="editar" onClick={() => alEditar(u)} aria-label={`Editar ${u.username}`}>Editar</Boton>
                        {u.id_usuario !== yo?.id_usuario && (
                          <Boton variante="fantasma" icono="archivar" onClick={() => setADarDeBaja(u)} aria-label={`Dar de baja ${u.username}`}>Dar de baja</Boton>
                        )}
                      </div>
                    ) : (
                      <Boton variante="fantasma" icono="reactivar" cargando={reactivar.isPending && reactivar.variables === u.id_usuario}
                        onClick={() => reactivar.mutate(u.id_usuario)} aria-label={`Reactivar ${u.username}`}>Reactivar</Boton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filas.length === 0 && !usuarios.isPending && <p className="suave">No hay usuarios con ese filtro.</p>}
      </Panel>
      {aDarDeBaja && <BajaUsuario usuario={aDarDeBaja} alCerrar={() => setADarDeBaja(null)} alFallar={setFallo} />}
      {fallo && <AvisoError error={fallo} titulo="No se pudo completar" alCerrar={() => setFallo(null)} />}
    </>
  )
}

function FormularioUsuario({ usuario, alCerrar }) {
  const nuevo = !usuario.id_usuario
  return (
    <FormularioABM recurso="usuarios" id={usuario.id_usuario} alCerrar={alCerrar}
      titulo={nuevo ? 'Nuevo usuario' : `Editar a ${usuario.username}`}
      descripcion={nuevo ? 'La clave se guarda cifrada: nadie la puede ver, ni el administrador.' : 'Dejá la clave vacía para no cambiarla.'}>
      {(errores) => (
        <>
          <Campo etiqueta="Usuario" name="username" defaultValue={usuario.username} error={errores.username}
            autoComplete="off" spellCheck={false} placeholder="lucia" readOnly={!nuevo} data-foco={nuevo || undefined} />
          <div className="fila-2">
            <Campo etiqueta="Nombre" name="first_name" defaultValue={usuario.first_name} error={errores.first_name} autoComplete="off"
              data-foco={!nuevo || undefined} />
            <Campo etiqueta="Apellido" name="last_name" defaultValue={usuario.last_name} error={errores.last_name} autoComplete="off" />
          </div>
          <Campo as="select" etiqueta="Rol" name="rol" defaultValue={usuario.rol ?? 'Operador'} error={errores.rol}
            ayuda="Operador: vende, cobra, opera la caja y carga mermas. Administrador: además compras, gastos, precios, catálogo y usuarios.">
            <option value="Operador">Operador</option>
            <option value="Administrador">Administrador</option>
          </Campo>
          <Campo etiqueta={nuevo ? 'Clave' : 'Clave nueva (opcional)'} name="clave" type="password" error={errores.clave}
            autoComplete="new-password" ayuda="Al menos 8 caracteres, que no sean solo números." />
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
const ENTIDADES = ['', 'Venta', 'Compra', 'Gasto', 'Caja', 'MovimientoInventario', 'CuentaCorriente', 'PrecioProducto',
  'Producto', 'Presentacion', 'Proveedor', 'Cliente', 'Usuario']

function Actividad() {
  const [entidad, setEntidad] = useState('')
  const [pagina, setPagina] = useState(1)
  const parametros = new URLSearchParams({ page: pagina })
  if (entidad) parametros.set('entidad', entidad)
  const registros = useQuery({
    queryKey: ['actividad', entidad, pagina],
    queryFn: () => api(`/actividad/?${parametros}`),
    placeholderData: keepPreviousData,
  })
  const filas = registros.data?.results ?? []

  return (
    <Panel titulo="Registro de actividad" className="actividad"
      accion={(
        <Campo as="select" etiqueta="Sobre" value={entidad} onChange={(e) => { setEntidad(e.target.value); setPagina(1) }}>
          {ENTIDADES.map((e) => <option key={e} value={e}>{e || 'Todo'}</option>)}
        </Campo>
      )}>
      <div className="tabla-wrap">
        <table className="tabla">
          <thead>
            <tr><th scope="col">Fecha</th><th scope="col">Usuario</th><th scope="col">Operación</th><th scope="col">Sobre</th><th scope="col">Detalle</th></tr>
          </thead>
          <tbody>
            {filas.map((r) => (
              <tr key={r.id_actividad}>
                <td>{fecha(r.fecha_hora)} <span className="suave">{hora(r.fecha_hora)}</span></td>
                <td>{r.usuario_nombre ?? <span className="suave">—</span>}</td>
                <td><Insignia variante={r.operacion === 'Anulación' || r.operacion === 'Baja' ? 'peligro' : r.operacion === 'Alta' ? 'exito' : 'neutro'}>{r.operacion}</Insignia></td>
                <td>{r.entidad_afectada} Nº {r.referencia_registro}</td>
                <td className="actividad__detalle">{r.detalle}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filas.length === 0 && !registros.isPending && <p className="suave">Sin registros.</p>}
      {(registros.data?.previous || registros.data?.next) && (
        <div className="paginado">
          <Boton variante="secundario" disabled={!registros.data?.previous} onClick={() => setPagina((p) => p - 1)}>Anterior</Boton>
          <span className="suave">Página {pagina}</span>
          <Boton variante="secundario" disabled={!registros.data?.next} onClick={() => setPagina((p) => p + 1)}>Siguiente</Boton>
        </div>
      )}
    </Panel>
  )
}
