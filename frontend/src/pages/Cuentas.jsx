import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AvisoError from '../components/AvisoError'
import Cifra from '../components/Cifra'
import Dialogo from '../components/Dialogo'
import { Boton, CabeceraPagina, Campo, EstadoVacio, Insignia, Panel } from '../components/ui'
import { erroresDe } from '../lib/abm'
import { api } from '../lib/api'
import { fecha, moneda } from '../lib/formato'
import '../styles/movimientos.css'

// Cuentas corrientes (HU-05-G · HU-07). Cada venta fiada abre una deuda con el cliente.
// Acá se ve cuánto se debe y se cobra; en esta versión la deuda se paga entera, de una vez.
// En efectivo, el cobro entra a la caja abierta.
export default function Cuentas() {
  const [estado, setEstado] = useState('PENDIENTE')
  const [clienteId, setClienteId] = useState('')
  const [pagina, setPagina] = useState(1)
  const [cobrando, setCobrando] = useState(null)

  const resumen = useQuery({ queryKey: ['cuentas-corrientes', 'resumen'], queryFn: () => api('/cuentas-corrientes/resumen/') })
  const parametros = new URLSearchParams({ page: pagina })
  if (estado) parametros.set('estado', estado)
  if (clienteId) parametros.set('cliente', clienteId)
  const cuentas = useQuery({
    queryKey: ['cuentas-corrientes', estado, clienteId, pagina],
    queryFn: () => api(`/cuentas-corrientes/?${parametros}`),
    placeholderData: keepPreviousData,
  })
  const filas = cuentas.data?.results ?? []
  const deudores = resumen.data?.por_cliente ?? []

  return (
    <>
      <CabeceraPagina titulo="Cuentas corrientes" descripcion="Lo que deben los clientes por ventas fiadas." />

      {resumen.data && (
        <div className="cifras">
          <Cifra titulo="Total a cobrar" valor={moneda(resumen.data.total_pendiente)} destacada />
          <Cifra titulo="Deudas pendientes" valor={resumen.data.cantidad} nota={`${deudores.length} ${deudores.length === 1 ? 'cliente' : 'clientes'}`} />
          {deudores[0] && <Cifra titulo="Debe más" valor={deudores[0].cliente_nombre} nota={moneda(deudores[0].deuda)} />}
        </div>
      )}

      <div className="cuentas-filtros">
        <div className="segmentado" role="group" aria-label="Qué deudas mostrar">
          {[['PENDIENTE', 'Pendientes'], ['CANCELADA', 'Canceladas'], ['', 'Todas']].map(([v, texto]) => (
            <button key={v} type="button" className="segmentado__opcion" aria-pressed={estado === v}
              onClick={() => { setEstado(v); setPagina(1) }}>{texto}</button>
          ))}
        </div>
        <Campo as="select" etiqueta="Cliente" value={clienteId} onChange={(e) => { setClienteId(e.target.value); setPagina(1) }}>
          <option value="">Todos</option>
          {deudores.map((d) => <option key={d.cliente} value={d.cliente}>{d.cliente_nombre} · {moneda(d.deuda)}</option>)}
        </Campo>
      </div>

      {cuentas.isPending ? <p className="abm-cargando">Cargando…</p> : filas.length === 0 ? (
        <EstadoVacio icono="cuentas" titulo={estado === 'PENDIENTE' ? 'No hay deudas pendientes' : 'No hay deudas'}
          texto="Las deudas aparecen cuando se registra una venta fiada." />
      ) : (
        <Panel>
          <div className="tabla-wrap">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Fecha</th><th scope="col">Venta</th><th scope="col">Cliente</th><th scope="col">Estado</th>
                  <th scope="col" className="num">Importe</th><th scope="col" className="num">Saldo</th>
                  <th scope="col"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((c) => (
                  <tr key={c.id_cuenta}>
                    <td>{fecha(c.fecha)}</td>
                    <td>Nº {c.venta}</td>
                    <td><strong>{c.cliente_nombre}</strong></td>
                    <td><EstadoDeuda cuenta={c} /></td>
                    <td className="num">{moneda(c.importe_original)}</td>
                    <td className="num"><strong>{moneda(c.saldo_pendiente)}</strong></td>
                    <td className="num">
                      {c.estado === 'PENDIENTE' && <Boton variante="suave" onClick={() => setCobrando(c)}>Cobrar</Boton>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(cuentas.data?.previous || cuentas.data?.next) && (
            <div className="paginado">
              <Boton variante="secundario" disabled={!cuentas.data?.previous} onClick={() => setPagina((p) => p - 1)}>Anterior</Boton>
              <span className="suave">Página {pagina}</span>
              <Boton variante="secundario" disabled={!cuentas.data?.next} onClick={() => setPagina((p) => p + 1)}>Siguiente</Boton>
            </div>
          )}
        </Panel>
      )}

      {cobrando && <Cobrar cuenta={cobrando} alCerrar={() => setCobrando(null)} />}
    </>
  )
}

function EstadoDeuda({ cuenta }) {
  if (cuenta.venta_estado === 'ANULADA') return <Insignia variante="neutro">Venta anulada</Insignia>
  if (cuenta.estado === 'PENDIENTE') return <Insignia variante="aviso">Pendiente</Insignia>
  const pago = cuenta.pagos[0]
  return (
    <span className="cuenta-pagada">
      <Insignia variante="exito">Cobrada</Insignia>
      {pago && <span className="suave"> {fecha(pago.fecha_hora)} · {pago.medio_pago === 'EFECTIVO' ? 'efectivo' : 'transferencia'}</span>}
    </span>
  )
}

// Cobro del total de la deuda. Si algo falla (por ejemplo, no hay caja abierta) se avisa en una ventana.
function Cobrar({ cuenta, alCerrar }) {
  const cliente = useQueryClient()
  const [medio, setMedio] = useState('EFECTIVO')
  const [referencia, setReferencia] = useState('')
  const [fallo, setFallo] = useState(null)
  const cobrar = useMutation({
    mutationFn: () => api(`/cuentas-corrientes/${cuenta.id_cuenta}/cobrar/`, {
      metodo: 'POST',
      datos: { importe: cuenta.saldo_pendiente, medio_pago: medio, referencia_transferencia: referencia },
    }),
    onSuccess: () => {
      for (const clave of ['cuentas-corrientes', 'caja', 'ventas']) cliente.invalidateQueries({ queryKey: [clave] })
      alCerrar()
    },
    onError: (error) => { if (!erroresDe(error).referencia_transferencia) setFallo(error) },
  })
  const errores = erroresDe(cobrar.error)

  if (fallo) return <AvisoError error={fallo} titulo="No se pudo cobrar la deuda" alCerrar={alCerrar} />

  return (
    <Dialogo titulo={`Cobrar a ${cuenta.cliente_nombre}`} descripcion={`Venta Nº ${cuenta.venta} del ${fecha(cuenta.fecha)}`} alCerrar={alCerrar}>
      <form className="dialogo__cuerpo" onSubmit={(e) => { e.preventDefault(); cobrar.mutate() }}>
        <div className="total-dialogo"><span>Total a cobrar</span><strong>{moneda(cuenta.saldo_pendiente)}</strong></div>
        <fieldset className="pos__opciones">
          <legend className="campo__label">Medio de pago</legend>
          <div className="segmentado">
            {[['EFECTIVO', 'Efectivo'], ['TRANSFERENCIA', 'Transferencia']].map(([v, texto]) => (
              <button key={v} type="button" className="segmentado__opcion" aria-pressed={medio === v} onClick={() => setMedio(v)}>{texto}</button>
            ))}
          </div>
        </fieldset>
        {medio === 'TRANSFERENCIA' && (
          <Campo etiqueta="Referencia de la transferencia" value={referencia} onChange={(e) => setReferencia(e.target.value)}
            error={errores.referencia_transferencia} autoComplete="off" data-foco />
        )}
        <p className="suave">{medio === 'EFECTIVO' ? 'El cobro entra a la caja abierta.' : 'La transferencia no pasa por la caja.'}</p>
      </form>
      <footer className="dialogo__pie">
        <Boton variante="secundario" onClick={alCerrar}>Volver</Boton>
        <Boton cargando={cobrar.isPending} textoCargando="Cobrando…" onClick={() => cobrar.mutate()}>
          Cobrar {moneda(cuenta.saldo_pendiente)}
        </Boton>
      </footer>
    </Dialogo>
  )
}
