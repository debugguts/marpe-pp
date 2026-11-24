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
// Arqueo ciego (S16): el operador no ve cuánto debería haber; al cerrar cuenta billete por billete
// y la diferencia la ve solo el administrador (la API ni siquiera le manda esos datos).
const ENTRAN = ['VENTA_EFECTIVO', 'COBRO_DEUDA_EFECTIVO', 'INGRESO_MANUAL']
const BILLETES = [20000, 10000, 2000, 1000, 500, 200, 100, 50, 20, 10]

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

  if (caja.arqueo_ciego) {
    return (
      <>
        <div className="cifras">
          <Cifra tono="arena" icono="caja" titulo="Saldo inicial" valor={moneda(caja.saldo_inicial)}
            nota={`Abrió ${caja.usuario_apertura_nombre}`} />
          <Cifra tono="verde" icono="reloj" titulo="Caja abierta" valor={`Desde las ${hora(caja.fecha_hora_apertura)}`}
            nota={`${lista.length} ${lista.length === 1 ? 'movimiento' : 'movimientos'} en efectivo`} />
          <Cifra tono="salmon" icono="alerta" titulo="Arqueo ciego" valor="Al cerrar, contá"
            nota="Contás el efectivo billete por billete. La diferencia la revisa el administrador." />
        </div>
        <ListaMovimientos lista={lista} cargando={movimientos.isPending} />
      </>
    )
  }

  return (
    <>
      <div className="cifras">
        <Cifra tono="arena" icono="caja" titulo="Saldo inicial" valor={moneda(caja.saldo_inicial)}
          nota={`Abrió ${caja.usuario_apertura_nombre} a las ${hora(caja.fecha_hora_apertura)}`} />
        <Cifra tono="verde" icono="efectivo" titulo="Entró en efectivo" valor={moneda(suma((t) => ENTRAN.includes(t)))} />
        <Cifra tono="salmon" icono="gastos" titulo="Salió en efectivo" valor={moneda(suma((t) => !ENTRAN.includes(t)))} />
        <Cifra icono="caja" titulo="Debería haber" valor={moneda(caja.saldo_actual)} destacada />
      </div>
      <ListaMovimientos lista={lista} cargando={movimientos.isPending} />
    </>
  )
}

function ListaMovimientos({ lista, cargando }) {
  return (
    <Panel titulo="Movimientos de hoy">
        {lista.length === 0 ? (
          <p className="suave">{cargando ? 'Cargando…' : 'Todavía no hay movimientos en efectivo.'}</p>
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
    else if (esRetiro && caja.saldo_actual !== undefined && Number(datos.importe) > Number(caja.saldo_actual)) {
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
  const [cantidades, setCantidades] = useState({}) // billete → cuántos
  const [monedas, setMonedas] = useState('')
  const [confirmar, setConfirmar] = useState(false)
  const errores = erroresDe(cerrar.error)
  const cerrada = cerrar.data
  const total = BILLETES.reduce((s, b) => s + b * (cantidades[b] ?? 0), 0) + (Number(monedas) || 0)
  const errorMonedas = monedas && errorImporte(monedas, { cero: true, etiqueta: 'las monedas' })
  const cambiar = (billete, n) => setCantidades((c) => ({ ...c, [billete]: Math.max(0, Math.min(9999, n)) }))

  if (cerrada) {
    return (
      <Dialogo titulo="Caja cerrada" alCerrar={alCerrar}>
        <div className="dialogo__cuerpo">
          {cerrada.arqueo_ciego ? (
            <div className="arqueo-ciego__fin">
              <p>Registraste <strong>{moneda(cerrada.efectivo_contado)}</strong> en efectivo.</p>
              <p className="suave">Listo, la caja quedó cerrada. El administrador revisa el arqueo.</p>
            </div>
          ) : (
            <dl className="arqueo">
              <div><dt>Debería haber</dt><dd>{moneda(cerrada.saldo_esperado)}</dd></div>
              <div><dt>Contaste</dt><dd>{moneda(cerrada.efectivo_contado)}</dd></div>
              <div className={Number(cerrada.diferencia) === 0 ? 'is-ok' : 'is-diferencia'}>
                <dt>Diferencia</dt>
                <dd>{Number(cerrada.diferencia) === 0 ? 'Sin diferencia' : moneda(cerrada.diferencia)}</dd>
              </div>
            </dl>
          )}
        </div>
        <footer className="dialogo__pie"><Boton onClick={alCerrar}>Listo</Boton></footer>
      </Dialogo>
    )
  }

  return (
    <Dialogo titulo="Cerrar caja"
      descripcion={caja.arqueo_ciego
        ? 'Contá el efectivo del cajón billete por billete. El sistema suma solo.'
        : `Debería haber ${moneda(caja.saldo_actual)} en efectivo. Contalo billete por billete.`}
      alCerrar={alCerrar}>
      <form noValidate onSubmit={(e) => {
        e.preventDefault()
        if (errorMonedas) return
        if (!confirmar) { setConfirmar(true); return }
        cerrar.mutate(total.toFixed(2))
      }}>
        <div className="dialogo__cuerpo contador">
          <table className="contador__tabla">
            <thead><tr><th scope="col">Billete</th><th scope="col">Cantidad</th><th scope="col" className="num">Subtotal</th></tr></thead>
            <tbody>
              {BILLETES.map((b) => {
                const n = cantidades[b] ?? 0
                return (
                  <tr key={b} className={n ? 'is-con-cantidad' : undefined}>
                    <th scope="row">{moneda(b)}</th>
                    <td>
                      <div className="paso-a-paso contador__paso" role="group" aria-label={`Billetes de ${moneda(b)}`}>
                        <button type="button" onClick={() => { cambiar(b, n - 1); setConfirmar(false) }} aria-label="Uno menos" disabled={!n}>−</button>
                        <input type="number" inputMode="numeric" min="0" step="1" value={n || ''} placeholder="0"
                          onKeyDown={sinSignos} onWheel={sinRueda} aria-label={`Cantidad de billetes de ${moneda(b)}`}
                          onChange={(e) => { cambiar(b, Math.floor(Number(e.target.value) || 0)); setConfirmar(false) }} />
                        <button type="button" onClick={() => { cambiar(b, n + 1); setConfirmar(false) }} aria-label="Uno más">+</button>
                      </div>
                    </td>
                    <td className="num">{n ? moneda(b * n) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Campo etiqueta="Monedas (el total)" type="number" inputMode="decimal" min="0" step="0.01" value={monedas}
            onChange={(e) => { setMonedas(e.target.value); setConfirmar(false) }} onKeyDown={sinSignos} onWheel={sinRueda}
            placeholder="0" error={errorMonedas || undefined} />
          <div className="contador__total"><span>Total contado</span><strong>{moneda(total)}</strong></div>
          {confirmar && (
            <p className="contador__confirmar" role="alert">
              ¿Contaste todo el cajón? Vas a cerrar la caja con <strong>{moneda(total)}</strong>. No se puede deshacer.
            </p>
          )}
          {errores.efectivo_contado && <p className="campo__error">{errores.efectivo_contado}</p>}
        </div>
        <footer className="dialogo__pie">
          <Boton variante="secundario" onClick={confirmar ? () => setConfirmar(false) : alCerrar}>{confirmar ? 'Volver a contar' : 'Cancelar'}</Boton>
          <Boton type="submit" icono="caja" cargando={cerrar.isPending} textoCargando="Cerrando…">
            {confirmar ? `Sí, cerrar con ${moneda(total)}` : 'Cerrar caja'}
          </Boton>
        </footer>
      </form>
      {errores.general && <AvisoError error={cerrar.error} titulo="No se pudo cerrar la caja" alCerrar={() => cerrar.reset()} />}
    </Dialogo>
  )
}

function Historial() {
  const cajas = useQuery({ queryKey: ['caja', 'historial'], queryFn: () => api('/cajas/') })
  const cerradas = (cajas.data?.results ?? []).filter((c) => c.estado === 'CERRADA')
  if (cerradas.length === 0) return null
  const ciego = cerradas[0].arqueo_ciego // el operador ve solo lo que contó

  return (
    <Panel titulo="Cierres anteriores" className="caja-historial">
      <div className="tabla-wrap">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Día</th><th scope="col">Cerró</th>
              {!ciego && <th scope="col" className="num">Debería haber</th>}
              <th scope="col" className="num">Contado</th>
              {!ciego && <th scope="col" className="num">Diferencia</th>}
            </tr>
          </thead>
          <tbody>
            {cerradas.map((c) => (
              <tr key={c.id_caja}>
                <td>{fecha(c.fecha_hora_apertura)}</td>
                <td>{c.usuario_cierre_nombre} · {hora(c.fecha_hora_cierre)}</td>
                {!ciego && <td className="num">{moneda(c.saldo_esperado)}</td>}
                <td className="num">{moneda(c.efectivo_contado)}</td>
                {!ciego && (
                  <td className="num">
                    {Number(c.diferencia) === 0
                      ? <Insignia variante="exito">Justa</Insignia>
                      : <Insignia variante={Number(c.diferencia) > 0 ? 'aviso' : 'peligro'}>
                          {Number(c.diferencia) > 0 ? 'Sobrante' : 'Faltante'} {moneda(Math.abs(Number(c.diferencia)))}
                        </Insignia>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
