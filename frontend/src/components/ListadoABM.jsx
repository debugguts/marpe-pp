import { useDeferredValue, useState } from 'react'
import { useBaja, useGuardar, useListado } from '../lib/abm'
import { numero } from '../lib/formato'
import AvisoError from './AvisoError'
import Dialogo from './Dialogo'
import Icono from './Icono'
import { Boton, EstadoVacio, Insignia } from './ui'

const POR_PAGINA = 20 // igual que PAGE_SIZE en settings.py

// Listado común de las tablas maestras: buscador, filtro por estado, tabla,
// paginado y las acciones Editar / Dar de baja / Reactivar.
// Cada pantalla solo dice qué recurso pide, qué columnas muestra y qué pasa al editar.
export default function ListadoABM({
  recurso,        // 'proveedores', 'clientes', ...
  clave,          // nombre del id: 'id_proveedor'
  columnas,       // [{ titulo, valor: (fila) => ..., num: true si es número }]
  nombreDe,       // (fila) => texto para mensajes: "Avícola del Norte"
  alEditar,       // (fila) => abre el formulario
  protegido = () => false, // (fila) => true si no se puede tocar (Consumidor final)
  soloLectura = false, // true: el rol solo consulta (el operador en proveedores y catálogo)
  buscarTexto = 'Buscar',
  vacio,          // { icono, titulo, texto, accion }
}) {
  const [buscar, setBuscar] = useState('')
  const [estado, setEstado] = useState('ACTIVO')
  const [pagina, setPagina] = useState(1)
  const [aDarDeBaja, setADarDeBaja] = useState(null)

  // useDeferredValue: no pide a la API en cada tecla mientras se escribe rápido.
  const buscarDiferido = useDeferredValue(buscar.trim())
  const listado = useListado(recurso, { buscar: buscarDiferido, estado, pagina })
  const reactivar = useGuardar(recurso)

  const filas = listado.data?.results ?? []
  const total = listado.data?.count ?? 0
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const filtrando = buscarDiferido !== '' || estado !== 'ACTIVO'

  const cambiarFiltro = (aplicar) => (e) => { aplicar(e.target.value); setPagina(1) }

  return (
    <>
      <div className="abm-barra" role="search">
        <label className="abm-buscar">
          <span className="sr-only">{buscarTexto}</span>
          <Icono nombre="buscar" />
          <input
            type="search"
            className="campo__control"
            placeholder={`${buscarTexto}…`}
            value={buscar}
            onChange={cambiarFiltro(setBuscar)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="abm-filtro">
          <span className="sr-only">Mostrar</span>
          <select className="campo__control" value={estado} onChange={cambiarFiltro(setEstado)}>
            <option value="ACTIVO">Activos</option>
            <option value="INACTIVO">Dados de baja</option>
            <option value="">Todos</option>
          </select>
        </label>
      </div>

      {listado.isError ? (
        <EstadoVacio icono="cerrar" titulo="No se pudo cargar la lista" texto={listado.error.message}>
          <Boton variante="secundario" onClick={() => listado.refetch()}>Reintentar</Boton>
        </EstadoVacio>
      ) : listado.isPending ? (
        <p className="abm-cargando" aria-live="polite">Cargando…</p>
      ) : filas.length === 0 ? (
        filtrando ? (
          <EstadoVacio icono="buscar" titulo="Sin resultados" texto="Probá con otra búsqueda o cambiá el filtro." />
        ) : (
          <EstadoVacio icono={vacio.icono} titulo={vacio.titulo} texto={vacio.texto}>{vacio.accion}</EstadoVacio>
        )
      ) : (
        <div className="panel abm-panel">
          <div className="tabla-wrap">
            <table className="tabla abm-tabla">
              <thead>
                <tr>
                  {columnas.map((c) => (
                    <th key={c.titulo} scope="col" className={c.num ? 'num' : undefined}>{c.titulo}</th>
                  ))}
                  <th scope="col">Estado</th>
                  <th scope="col" className="num"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => {
                  const activo = fila.estado === 'ACTIVO'
                  return (
                    <tr key={fila[clave]}>
                      {columnas.map((c) => (
                        <td key={c.titulo} data-titulo={c.titulo} className={c.num ? 'num' : undefined}>
                          {c.valor(fila) ?? '—'}
                        </td>
                      ))}
                      <td data-titulo="Estado">
                        {protegido(fila)
                          ? <Insignia variante="marca">Del sistema</Insignia>
                          : <Insignia variante={activo ? 'exito' : 'neutro'}>{activo ? 'Activo' : 'De baja'}</Insignia>}
                      </td>
                      <td className="num abm-celda-acciones">
                        {!protegido(fila) && !soloLectura && (
                          <div className="abm-acciones">
                            {activo ? (
                              <>
                                <Boton variante="fantasma" icono="editar" onClick={() => alEditar(fila)}
                                  aria-label={`Editar ${nombreDe(fila)}`}>Editar</Boton>
                                <Boton variante="fantasma" icono="archivar" onClick={() => setADarDeBaja(fila)}
                                  aria-label={`Dar de baja ${nombreDe(fila)}`}>Dar de baja</Boton>
                              </>
                            ) : (
                              <Boton variante="fantasma" icono="reactivar"
                                cargando={reactivar.isPending && reactivar.variables?.id === fila[clave]}
                                onClick={() => reactivar.mutate({ id: fila[clave], datos: { estado: 'ACTIVO' } })}
                                aria-label={`Reactivar ${nombreDe(fila)}`}>Reactivar</Boton>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <footer className="abm-pie">
            <p className="suave" aria-live="polite">
              {numero(total)} {total === 1 ? 'registro' : 'registros'}
              {paginas > 1 && ` · página ${pagina} de ${paginas}`}
            </p>
            {paginas > 1 && (
              <div className="abm-paginas">
                <Boton variante="secundario" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)}>Anterior</Boton>
                <Boton variante="secundario" disabled={pagina === paginas} onClick={() => setPagina(pagina + 1)}>Siguiente</Boton>
              </div>
            )}
          </footer>
        </div>
      )}

      {reactivar.isError && <AvisoError error={reactivar.error} titulo="No se pudo reactivar" alCerrar={() => reactivar.reset()} />}

      {aDarDeBaja && (
        <ConfirmarBaja
          recurso={recurso}
          id={aDarDeBaja[clave]}
          nombre={nombreDe(aDarDeBaja)}
          alCerrar={() => setADarDeBaja(null)}
        />
      )}
    </>
  )
}

// Pide confirmación antes de la baja. Explica que no se borra: queda inactivo.
function ConfirmarBaja({ recurso, id, nombre, alCerrar }) {
  const baja = useBaja(recurso)
  if (baja.isError) return <AvisoError error={baja.error} titulo="No se pudo dar de baja" alCerrar={alCerrar} />
  return (
    <Dialogo titulo={`¿Dar de baja «${nombre}»?`} alCerrar={alCerrar}>
      <div className="dialogo__cuerpo">
        <p>No se borra: queda guardado como <strong>dado de baja</strong> para no perder el historial
          de compras y ventas. Lo podés reactivar cuando quieras.</p>
      </div>
      <footer className="dialogo__pie">
        <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
        <Boton variante="peligro" cargando={baja.isPending} textoCargando="Dando de baja…"
          onClick={() => baja.mutate(id, { onSuccess: alCerrar })}>Dar de baja</Boton>
      </footer>
    </Dialogo>
  )
}
