import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AvisoError from '../components/AvisoError'
import Dialogo from '../components/Dialogo'
import Icono from '../components/Icono'
import { Boton, EstadoVacio } from '../components/ui'
import { api } from '../lib/api'
import { contenidoDe, moneda, numero } from '../lib/formato'
import { useSesion } from '../lib/sesion'
import '../styles/precios.css'

// Solapa Precios del Catálogo (S5-10 · HU-02-C), pensada para un administrador nuevo:
// cada presentación trae su precio actual en el casillero; se edita encima o con un atajo
// (Mínimo, +20 %, +30 %) y al lado se ve en vivo cuánto se gana. Se guarda todo junto por huevo.
const PRECIO_MAXIMO = 100000000
const ATAJOS = [[0, 'Mínimo'], [20, '+20 %'], [30, '+30 %']]

// Precio con ganancia, redondeado para arriba a $ 10 (precios fáciles de cobrar).
const conGanancia = (cuesta, margen) => Math.ceil((Number(cuesta) * (1 + margen / 100)) / 10) * 10
const comoTexto = (valor) => (valor === null || valor === undefined || valor === '' ? '' : String(Math.round(Number(valor))))
const conPuntos = (digitos) => (digitos ? Number(digitos).toLocaleString('es-AR') : '')

export default function Precios() {
  const sugeridos = useQuery({ queryKey: ['precios', 'sugeridos'], queryFn: () => api('/precios/sugeridos/') })
  const { data: usuario } = useSesion()
  const esAdministrador = usuario?.rol === 'Administrador'
  const [soloNumeros, setSoloNumeros] = useState(false) // ventana "solo se pueden escribir números"
  const [guardadoEn, setGuardadoEn] = useState(null) // huevo cuyos precios se acaban de guardar

  if (sugeridos.isPending) return <p className="abm-cargando">Calculando precios…</p>
  if (sugeridos.isError) {
    return <EstadoVacio icono="cerrar" titulo="No se pudieron calcular los precios" texto={sugeridos.error.message} />
  }

  return (
    <div className="precios">
      <p className="precios__intro">
        {esAdministrador
          ? <>Escribí el precio nuevo en el casillero o tocá un atajo. Al lado ves <strong>cuánto ganás</strong> con ese precio. Solo se guarda lo que cambiaste.</>
          : <>Para cada producto ves <strong>cuánto te cuesta</strong>, a cuánto se vende y cuánto se gana. Solo el administrador puede cambiar precios.</>}
      </p>

      {sugeridos.data.map((fila) => (
        <ProductoPrecios key={`${fila.producto}-${fila.presentaciones.map((p) => p.precio_vigente).join('|')}`}
          fila={fila} puedeCambiar={esAdministrador} alTeclaInvalida={() => setSoloNumeros(true)}
          guardado={guardadoEn === fila.producto} alGuardar={() => setGuardadoEn(fila.producto)} />
      ))}

      {soloNumeros && (
        <Dialogo titulo="Solo se pueden escribir números" alCerrar={() => setSoloNumeros(false)}>
          <div className="dialogo__cuerpo precios__aviso-numeros">
            <span className="precios__aviso-icono" aria-hidden="true"><Icono nombre="alerta" /></span>
            <p>El precio va en pesos y sin centavos: escribí solo números, por ejemplo <strong>5850</strong>.
              No se pueden usar letras, signos (- + , .) ni espacios.</p>
          </div>
          <footer className="dialogo__pie">
            <Boton onClick={() => setSoloNumeros(false)} data-foco>Entendido</Boton>
          </footer>
        </Dialogo>
      )}
    </div>
  )
}

function ProductoPrecios({ fila, puedeCambiar, alTeclaInvalida, guardado, alGuardar }) {
  const cliente = useQueryClient()
  const { calculo } = fila
  const tituloId = `precio-${fila.producto}`
  const originales = Object.fromEntries(fila.presentaciones.map((p) => [p.presentacion, comoTexto(p.precio_vigente)]))
  const [valores, setValores] = useState(originales)
  const [confirmando, setConfirmando] = useState(null) // precios bajo el costo que hay que confirmar

  const cambiados = fila.presentaciones.filter((p) => valores[p.presentacion] && valores[p.presentacion] !== originales[p.presentacion])
  const bajoCosto = cambiados.filter((p) => p.sugerido && Number(valores[p.presentacion]) < Number(p.sugerido))

  const guardar = useMutation({
    // Uno por uno: si alguno falla, los anteriores quedan guardados y se avisa cuál no.
    mutationFn: async () => {
      for (const p of cambiados) {
        await api('/precios/confirmar/', {
          metodo: 'POST',
          datos: { producto: fila.producto, presentacion: p.presentacion, precio: valores[p.presentacion], confirmar_bajo_equilibrio: true },
        })
      }
    },
    onSuccess: () => { setConfirmando(null); alGuardar(); cliente.invalidateQueries({ queryKey: ['precios'] }) },
    onError: () => setConfirmando(null),
  })

  function pedirGuardar() {
    if (bajoCosto.length > 0) setConfirmando(bajoCosto)
    else guardar.mutate()
  }

  return (
    <section className="panel precios__producto" aria-labelledby={tituloId}>
      <header className="precios__cab">
        <div>
          <h2 id={tituloId}>{fila.producto_nombre}</h2>
          {calculo.error ? (
            <p className="campo__error">{calculo.error}</p>
          ) : (
            <p className="precios__detalle">
              Lo que te cuesta = lo que le pagás al proveedor ({moneda(calculo.costo_bandeja)} la bandeja) + gastos fijos del mes
              ({moneda(calculo.gasto_fijo_bandeja)} por bandeja: {moneda(calculo.gastos_fijos_mes)} repartidos entre {numero(Number(calculo.bandejas_compradas_mes))} bandejas).
            </p>
          )}
        </div>
        {!calculo.error && (
          <p className="precios__costo"><small>Cada bandeja te cuesta</small><strong>{moneda(calculo.equilibrio_bandeja)}</strong></p>
        )}
      </header>

      <ul className="precios__filas">
        {fila.presentaciones.map((p) => (
          <FilaPrecio key={p.presentacion} p={p} valor={valores[p.presentacion]} original={originales[p.presentacion]}
            puedeCambiar={puedeCambiar} alTeclaInvalida={alTeclaInvalida}
            alCambiar={(v) => { guardar.reset(); setValores((actual) => ({ ...actual, [p.presentacion]: v })) }} />
        ))}
      </ul>

      {puedeCambiar && (
        <footer className="precios__pie">
          <p aria-live="polite">
            {guardado && cambiados.length === 0 ? <span className="precios__ok">Precios guardados. Rigen desde hoy.</span>
              : cambiados.length === 0 ? 'Sin cambios.'
                : `${cambiados.length === 1 ? '1 precio cambiado' : `${cambiados.length} precios cambiados`}`
                  + (bajoCosto.length ? ` · ${bajoCosto.length === 1 ? 'uno queda' : `${bajoCosto.length} quedan`} por debajo de lo que te cuesta` : '')}
          </p>
          <div className="precios__botones">
            <Boton variante="secundario" disabled={cambiados.length === 0 || guardar.isPending} onClick={() => setValores(originales)}>Deshacer</Boton>
            <Boton disabled={cambiados.length === 0} cargando={guardar.isPending} textoCargando="Guardando…" onClick={pedirGuardar}>
              {cambiados.length > 1 ? `Guardar ${cambiados.length} precios` : 'Guardar precio'}
            </Boton>
          </div>
        </footer>
      )}

      {confirmando && (
        <Dialogo titulo="¿Guardar precios que no cubren el costo?" descripcion={fila.producto_nombre} alCerrar={() => setConfirmando(null)}>
          <div className="dialogo__cuerpo">
            <p>Con estos precios <strong>perdés plata</strong> en cada venta:</p>
            <ul className="precios__lista-perdida">
              {confirmando.map((p) => (
                <li key={p.presentacion}>
                  <strong>{p.presentacion_nombre}</strong>: lo vendés a {moneda(Number(valores[p.presentacion]))} y te cuesta {moneda(p.sugerido)}
                  {' '}(perdés {moneda(Number(p.sugerido) - Number(valores[p.presentacion]))}).
                </li>
              ))}
            </ul>
          </div>
          <footer className="dialogo__pie">
            <Boton variante="secundario" onClick={() => setConfirmando(null)}>Revisar</Boton>
            <Boton variante="peligro" cargando={guardar.isPending} textoCargando="Guardando…" onClick={() => guardar.mutate()}>Guardar igual</Boton>
          </footer>
        </Dialogo>
      )}
      {guardar.isError && <AvisoError error={guardar.error} titulo="No se pudo guardar el precio" alCerrar={() => guardar.reset()} />}
    </section>
  )
}

function FilaPrecio({ p, valor, original, puedeCambiar, alCambiar, alTeclaInvalida }) {
  const campoId = `precio-${p.presentacion}-${p.presentacion_nombre}`
  const cuesta = p.sugerido ? Number(p.sugerido) : null
  const precio = valor ? Number(valor) : null
  const cambiado = Boolean(valor) && valor !== original
  const unidad = Number(p.bandejas) < 0.1 ? 'huevo' : p.presentacion_nombre.toLowerCase()

  // Solo dígitos: cualquier otra tecla (letras, signos, coma, punto) abre el aviso.
  function teclear(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return
    if (!/\d/.test(e.key)) { e.preventDefault(); alTeclaInvalida() }
  }
  function escribir(texto) {
    const limpio = texto.replace(/\./g, '').trim()
    if (limpio && !/^\d+$/.test(limpio)) { alTeclaInvalida(); return }
    alCambiar(limpio && Number(limpio) > PRECIO_MAXIMO ? String(PRECIO_MAXIMO) : limpio.replace(/^0+(?=\d)/, ''))
  }

  return (
    <li className={`precios__fila${cambiado ? ' is-cambiada' : ''}`}>
      <div className="precios__pres">
        <strong>{p.presentacion_nombre}</strong>
        <small>{contenidoDe(p.bandejas)}</small>
        <span>Te cuesta <b>{cuesta ? moneda(cuesta) : '—'}</b></span>
      </div>

      <div className="precios__entrada">
        {puedeCambiar ? (
          <>
            <div className="precios__campo-fila">
              <label className="precios__campo" htmlFor={campoId}>
                <span aria-hidden="true">$</span>
                <input id={campoId} type="text" inputMode="numeric" autoComplete="off" placeholder="Sin precio"
                  value={conPuntos(valor)} onKeyDown={teclear} onChange={(e) => escribir(e.target.value)}
                  onPaste={(e) => { e.preventDefault(); escribir(e.clipboardData.getData('text')) }}
                  aria-label={`Precio de ${p.presentacion_nombre}`} />
              </label>
              <span className="precios__antes">
                {cambiado ? (original ? <><s>{moneda(Number(original))}</s> antes</> : 'Precio nuevo') : original ? 'Precio actual' : 'Todavía no tiene precio'}
              </span>
            </div>
            {cuesta && (
              <div className="precios__atajos" role="group" aria-label={`Atajos de precio para ${p.presentacion_nombre}`}>
                {ATAJOS.map(([margen, texto]) => {
                  const sugerido = conGanancia(cuesta, margen)
                  return (
                    <button key={margen} type="button" aria-pressed={valor === String(sugerido)} onClick={() => alCambiar(String(sugerido))}>
                      {texto} <small>{moneda(sugerido)}</small>
                    </button>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <p className="precios__vigente">{original ? moneda(Number(original)) : 'Sin precio'}</p>
        )}
      </div>

      <Ganancia cuesta={cuesta} precio={precio} unidad={unidad} />
    </li>
  )
}

function Ganancia({ cuesta, precio, unidad }) {
  if (!cuesta) return <div className="precios__gana is-neutra">Cargá el costo en Proveedores para ver cuánto ganás.</div>
  if (!precio) return <div className="precios__gana is-neutra">Escribí un precio para ver cuánto ganás.</div>
  const diferencia = precio - cuesta
  const porcentaje = Math.round((diferencia / cuesta) * 100)
  if (diferencia >= 0) {
    return (
      <div className="precios__gana is-gana" aria-live="polite">
        Ganás por {unidad}<b>{moneda(diferencia)}</b>{porcentaje} % sobre lo que te cuesta
      </div>
    )
  }
  return (
    <div className="precios__gana is-pierde" aria-live="polite">
      Perdés por {unidad}<b>− {moneda(-diferencia)}</b>No cubre lo que te cuesta
    </div>
  )
}
