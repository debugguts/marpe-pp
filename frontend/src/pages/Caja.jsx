import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AvisoError from '../components/AvisoError'
import Cifra from '../components/Cifra'
import Dialogo from '../components/Dialogo'
import { Boton, CabeceraPagina, Campo, EstadoVacio, Insignia, Panel } from '../components/ui'
import { erroresDe } from '../lib/abm'
import { api } from '../lib/api'
import { fecha, hora, moneda } from '../lib/formato'
import { errorImporte, sinRueda, sinSignos } from '../lib/reglasImporte'
import '../styles/movimientos.css'

// Caja diaria (S5-12 · HU-10): abrir con el saldo inicial, ver lo que entra y sale
// en efectivo, cargar ingresos o retiros con motivo y cerrar con arqueo.
const ENTRAN = ['VENTA_EFECTIVO', 'COBRO_DEUDA_EFECTIVO', 'INGRESO_MANUAL']

export default function Caja() {
  const actual = useQuery({ queryKey: ['caja', 'actual'], queryFn: () => api('/cajas/actual/') })
  const [ventana, setVentana] = useState(null) // 'INGRESO_MANUAL' | 'RETIRO' | 'cerrar' | null

  return (
    <>
      <CabeceraPagina
        titulo="Caja"
        descripcion="El efectivo del día: lo que entra, lo que sale y el arqueo al cerrar."
        acciones={actual.data && (
          <div className="acciones">
            <Boton variante="secundario" icono="mas" onClick={() => setVentana('INGRESO_MANUAL')}>Ingreso</Boton>
            <Boton variante="secundario" icono="gastos" onClick={() => setVentana('RETIRO')}>Retiro</Boton>
            <Boton icono="caja" onClick={() => setVentana('cerrar')}>Cerrar caja</Boton>
          </div>
        )}
      />

      {actual.isPending && <p className="abm-cargando">Cargando…</p>}
      {actual.isError && <EstadoVacio icono="cerrar" titulo="No se pudo cargar la caja" texto={actual.error.message} />}
      {actual.isSuccess && (actual.data ? <CajaAbierta caja={actual.data} /> : <AbrirCaja />)}

      <Historial />

      {ventana === 'cerrar' && <CerrarCaja caja={actual.data} alCerrar={() => setVentana(null)} />}
      {(ventana === 'INGRESO_MANUAL' || ventana === 'RETIRO') && (
        <MovimientoManual tipo={ventana} caja={actual.data} alCerrar={() => setVentana(null)} />
      )}
    </>
  )
}

function useRefrescarCaja() {
  const cliente = useQueryClient()
  return () => cliente.invalidateQueries({ queryKey: ['caja'] })
}

function AbrirCaja() {
  const refrescar = useRefrescarCaja()
  const abrir = useMutation({
    mutationFn: (saldo) => api('/cajas/', { metodo: 'POST', datos: { saldo_inicial: saldo } }),
    onSuccess: refrescar,
  })
  const [local, setLocal] = useState('')
  const errores = erroresDe(abrir.error)

  return (
    <Panel titulo="La caja está cerrada" className="caja-abrir is-cerrada">
      <p className="suave">Contá el efectivo con el que arrancás el día y abrí la caja.</p>
      <form className="caja-abrir__form" noValidate onSubmit={(e) => {
        e.preventDefault()
        const saldo = new FormData(e.currentTarget).get('saldo')
        const error = errorImporte(saldo, { cero: true, etiqueta: 'el efectivo con el que abrís (puede ser 0)' })
        setLocal(error)
        if (error) e.currentTarget.elements.saldo.focus()
        else abrir.mutate(saldo)
      }}>
        <Campo etiqueta="Efectivo inicial" name="saldo" type="number" inputMode="decimal" min="0" step="0.01"
          required error={local || errores.saldo_inicial} placeholder="0" onKeyDown={sinSignos} onWheel={sinRueda}
          onChange={(e) => local && setLocal(errorImporte(e.target.value, { cero: true }))} />
        <Boton type="submit" icono="caja" cargando={abrir.isPending} textoCargando="Abriendo…">Abrir caja</Boton>
      </form>
      {errores.general && <AvisoError error={abrir.error} titulo="No se pudo abrir la caja" alCerrar={() => abrir.reset()} />}
    </Panel>
  )
}

function CajaAbierta({ caja }) {
  const movimientos = useQuery({
    queryKey: ['caja', caja.id_caja, 'movimientos'],
    queryFn: () => api(`/cajas/${caja.id_caja}/movimientos/`),
  })
  const lista = movimientos.data ?? []
  const suma = (tipos) => lista.filter((m) => tipos(m.tipo_movimiento)).reduce((s, m) => s + Number(m.importe), 0)

  return (
    <>
      <div className="cifras">
        <Cifra tono="arena" icono="caja" titulo="Saldo inicial" valor={moneda(caja.saldo_inicial)}
          nota={`Abrió ${caja.usuario_apertura_nombre} a las ${hora(caja.fecha_hora_apertura)}`} />
        <Cifra tono="verde" icono="efectivo" titulo="Entró en efectivo" valor={moneda(suma((t) => ENTRAN.includes(t)))} />
        <Cifra tono="salmon" icono="gastos" titulo="Salió en efectivo" valor={moneda(suma((t) => !ENTRAN.includes(t)))} />
        <Cifra icono="caja" titulo="Debería haber" valor={moneda(caja.saldo_actual)} destacada />
      </div>

      <Panel titulo="Movimientos de hoy">
        {lista.length === 0 ? (
          <p className="suave">{movimientos.isPending ? 'Cargando…' : 'Todavía no hay movimientos en efectivo.'}</p>
        ) : (
          <div className="tabla-wrap">
            <table className="tabla">
              <thead>
                <tr><th scope="col">Hora</th><th scope="col">Movimiento</th><th scope="col">Detalle</th><th scope="col" className="num">Importe</th></tr>
              </thead>
              <tbody>
                {lista.map((m) => {
                  const entra = ENTRAN.includes(m.tipo_movimiento)
                  return (
                    <tr key={m.id_movimiento_caja}>
                      <td>{hora(m.fecha_hora)}</td>
                      <td><Insignia variante={entra ? 'exito' : 'peligro'}>{m.tipo_texto}</Insignia></td>
                      <td>{m.motivo || '—'}</td>
                      <td className={`num ${entra ? 'importe--entra' : 'importe--sale'}`}>
                        {entra ? '+' : '−'} {moneda(m.importe)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}

function MovimientoManual({ tipo, caja, alCerrar }) {
  const refrescar = useRefrescarCaja()
  const guardar = useMutation({
    mutationFn: (datos) => api(`/cajas/${caja.id_caja}/movimientos/`, { metodo: 'POST', datos: { ...datos, tipo_movimiento: tipo } }),
    onSuccess: () => { refrescar(); alCerrar() },
  })
  const esRetiro = tipo === 'RETIRO'
  const [locales, setLocales] = useState(null) // errores de la web: aparecen al primer intento de guardar
  const errores = { ...erroresDe(guardar.error), ...(locales ?? {}) }

  function revisar(datos) {
    const e = {}
    const importe = errorImporte(datos.importe)
    if (importe) e.importe = importe
    else if (esRetiro && Number(datos.importe) > Number(caja.saldo_actual)) {
      e.importe = `No alcanza: en la caja debería haber ${moneda(caja.saldo_actual)}.`
    }
    const motivo = (datos.motivo ?? '').trim()
    if (!motivo) e.motivo = 'Escribí el motivo.'
    else if (motivo.length < 3) e.motivo = 'El motivo tiene que tener al menos 3 letras.'
    return e
  }

  return (
    <Dialogo titulo={esRetiro ? 'Retiro de efectivo' : 'Ingreso de efectivo'}
      descripcion={esRetiro ? 'Plata que sale de la caja (por ejemplo, al banco).' : 'Plata que entra a la caja sin ser una venta (por ejemplo, cambio).'}
      alCerrar={alCerrar}>
      <form noValidate
        onChange={(e) => locales && setLocales(revisar(Object.fromEntries(new FormData(e.currentTarget))))}
        onSubmit={(e) => {
          e.preventDefault()
          const datos = Object.fromEntries(new FormData(e.currentTarget))
          const encontrados = revisar(datos)
          setLocales(encontrados)
          const primero = Object.keys(encontrados)[0]
          if (primero) e.currentTarget.elements[primero].focus()
          else guardar.mutate(datos)
        }}>
        <div className="dialogo__cuerpo">
          <Campo etiqueta="Importe" name="importe" type="number" inputMode="decimal" min="0.01" step="0.01" error={errores.importe}
            onKeyDown={sinSignos} onWheel={sinRueda} placeholder="0" data-foco />
          <Campo etiqueta="Motivo" name="motivo" error={errores.motivo} autoComplete="off" maxLength={200} placeholder={esRetiro ? 'Depósito en el banco' : 'Cambio para el día'} />
        </div>
        <footer className="dialogo__pie">
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" cargando={guardar.isPending} textoCargando="Guardando…">Guardar</Boton>
        </footer>
      </form>
      {errores.general && <AvisoError error={guardar.error} alCerrar={() => guardar.reset()} />}
    </Dialogo>
  )
}

function CerrarCaja({ caja, alCerrar }) {
  const refrescar = useRefrescarCaja()
  const cerrar = useMutation({
    mutationFn: (contado) => api(`/cajas/${caja.id_caja}/cerrar/`, { metodo: 'POST', datos: { efectivo_contado: contado } }),
    onSuccess: refrescar,
  })
  const [local, setLocal] = useState('')
  const errores = erroresDe(cerrar.error)
  const cerrada = cerrar.data

  return (
    <Dialogo titulo={cerrada ? 'Caja cerrada' : 'Cerrar caja'}
      descripcion={cerrada ? undefined : `Debería haber ${moneda(caja.saldo_actual)} en efectivo. Contalo y cargá lo que hay.`}
      alCerrar={alCerrar}>
      {cerrada ? (
        <>
          <div className="dialogo__cuerpo">
            <dl className="arqueo">
              <div><dt>Debería haber</dt><dd>{moneda(cerrada.saldo_esperado)}</dd></div>
              <div><dt>Contaste</dt><dd>{moneda(cerrada.efectivo_contado)}</dd></div>
              <div className={Number(cerrada.diferencia) === 0 ? 'is-ok' : 'is-diferencia'}>
                <dt>Diferencia</dt>
                <dd>{Number(cerrada.diferencia) === 0 ? 'Sin diferencia' : moneda(cerrada.diferencia)}</dd>
              </div>
            </dl>
          </div>
          <footer className="dialogo__pie"><Boton onClick={alCerrar}>Listo</Boton></footer>
        </>
      ) : (
        <form noValidate onSubmit={(e) => {
          e.preventDefault()
          const contado = new FormData(e.currentTarget).get('contado')
          const error = errorImporte(contado, { cero: true, etiqueta: 'el efectivo que contaste (puede ser 0)' })
          setLocal(error)
          if (error) e.currentTarget.elements.contado.focus()
          else cerrar.mutate(contado)
        }}>
          <div className="dialogo__cuerpo">
            <Campo etiqueta="Efectivo contado" name="contado" type="number" inputMode="decimal" min="0" step="0.01"
              error={local || errores.efectivo_contado} onKeyDown={sinSignos} onWheel={sinRueda} placeholder="0"
              onChange={(e) => local && setLocal(errorImporte(e.target.value, { cero: true }))} data-foco />
          </div>
          <footer className="dialogo__pie">
            <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
            <Boton type="submit" cargando={cerrar.isPending} textoCargando="Cerrando…">Cerrar caja</Boton>
          </footer>
        </form>
      )}
      {errores.general && <AvisoError error={cerrar.error} titulo="No se pudo cerrar la caja" alCerrar={() => cerrar.reset()} />}
    </Dialogo>
  )
}

function Historial() {
  const cajas = useQuery({ queryKey: ['caja', 'historial'], queryFn: () => api('/cajas/') })
  const cerradas = (cajas.data?.results ?? []).filter((c) => c.estado === 'CERRADA')
  if (cerradas.length === 0) return null

  return (
    <Panel titulo="Cierres anteriores" className="caja-historial">
      <div className="tabla-wrap">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Día</th><th scope="col">Cerró</th>
              <th scope="col" className="num">Debería haber</th><th scope="col" className="num">Contado</th>
              <th scope="col" className="num">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {cerradas.map((c) => (
              <tr key={c.id_caja}>
                <td>{fecha(c.fecha_hora_apertura)}</td>
                <td>{c.usuario_cierre_nombre} · {hora(c.fecha_hora_cierre)}</td>
                <td className="num">{moneda(c.saldo_esperado)}</td>
                <td className="num">{moneda(c.efectivo_contado)}</td>
                <td className="num">
                  {Number(c.diferencia) === 0
                    ? <Insignia variante="exito">Justa</Insignia>
                    : <Insignia variante="peligro">{moneda(c.diferencia)}</Insignia>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
