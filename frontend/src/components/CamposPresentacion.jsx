import { useState } from 'react'
import { numero } from '../lib/formato'
import { MAX_BANDEJAS_CAJA } from '../lib/reglasPresentacion'
import { Campo } from './ui'

// ---------- Formulario de presentación: se elige cómo se vende y la equivalencia se calcula sola ----------
const FORMATOS = [['UNIDAD', 'Unidad', 'Huevos sueltos'], ['BANDEJA', 'Bandeja', 'Maple o bandeja'], ['CAJA', 'Caja', 'Varias bandejas']]

// Equivalencia en bandejas de 30 (así se guarda el stock), con 6 decimales y redondeada para abajo
// para que vender todo nunca pida un poquito más de lo que hay (1 huevo = 0,033333).
const equivalenciaDe = (huevos) => (Math.floor((huevos / 30) * 1e6) / 1e6).toFixed(6)

function estadoInicial(p) {
  const formato = p.formato ?? 'BANDEJA'
  const huevosBandeja = Number(p.huevos_por_bandeja ?? 30)
  const huevos = p.cantidad_bandejas_equivalentes ? Math.round(Number(p.cantidad_bandejas_equivalentes) * 30) : null
  const bandejas = formato === 'CAJA' && huevos ? Math.max(2, Math.round(huevos / huevosBandeja)) : 6
  return { formato, huevosBandeja, bandejas: String(bandejas) }
}

export function CamposPresentacion({ editando, errores }) {
  const [estado, setEstado] = useState(() => estadoInicial(editando))
  const { formato, huevosBandeja } = estado
  const bandejas = Math.min(MAX_BANDEJAS_CAJA, Math.max(0, Math.floor(Number(estado.bandejas) || 0)))
  const huevos = formato === 'UNIDAD' ? 1 : formato === 'BANDEJA' ? huevosBandeja : bandejas * huevosBandeja
  const equivalencia = equivalenciaDe(huevos)
  const cambiar = (cambios) => setEstado((actual) => ({ ...actual, ...cambios }))
  const soloEnteros = (e) => { if (e.key.length === 1 && !/\d/.test(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault() }

  return (
    <>
      <Campo etiqueta="Nombre" name="nombre" defaultValue={editando.nombre} error={errores.nombre}
        required maxLength={50} autoComplete="off" placeholder="Por ejemplo: Caja, Maple de 20, Unidad" data-foco />

      <fieldset className="pres-form__grupo">
        <legend className="campo__label">¿Cómo se vende?</legend>
        <div className="pres-form__opciones">
          {FORMATOS.map(([v, texto, ayuda]) => (
            <button key={v} type="button" aria-pressed={formato === v} className="pres-form__opcion"
              onClick={() => cambiar({ formato: v, ...(v === 'UNIDAD' ? { huevosBandeja: 30 } : {}) })}>
              <strong>{texto}</strong><small>{ayuda}</small>
            </button>
          ))}
        </div>
      </fieldset>

      {formato !== 'UNIDAD' && (
        <fieldset className="pres-form__grupo">
          <legend className="campo__label">¿De cuántos huevos es cada bandeja?</legend>
          <div className="pres-form__chips">
            {[30, 20].map((h) => (
              <button key={h} type="button" aria-pressed={huevosBandeja === h} onClick={() => cambiar({ huevosBandeja: h })}>
                {h} huevos{h === 20 && <small> · solo Súper</small>}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {formato === 'CAJA' && (
        <div className="campo">
          <label className="campo__label" htmlFor="pres-bandejas">¿Cuántas bandejas trae la caja?</label>
          <div className="pres-form__paso">
            <button type="button" aria-label="Una bandeja menos" disabled={bandejas <= 2} onClick={() => cambiar({ bandejas: String(bandejas - 1) })}>−</button>
            <input id="pres-bandejas" name="bandejas_caja" type="text" inputMode="numeric" value={estado.bandejas}
              aria-invalid={errores.bandejas_caja ? 'true' : undefined} aria-describedby={errores.bandejas_caja ? 'pres-bandejas-error' : undefined}
              onKeyDown={soloEnteros} onChange={(e) => cambiar({ bandejas: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
            <button type="button" aria-label="Una bandeja más" disabled={bandejas >= MAX_BANDEJAS_CAJA} onClick={() => cambiar({ bandejas: String(bandejas + 1) })}>+</button>
          </div>
          {errores.bandejas_caja && <p id="pres-bandejas-error" className="campo__error">{errores.bandejas_caja}</p>}
        </div>
      )}

      <input type="hidden" name="formato" value={formato} />
      <input type="hidden" name="huevos_por_bandeja" value={huevosBandeja} />
      <input type="hidden" name="cantidad_bandejas_equivalentes" value={equivalencia} />

      <div className="pres-form__resumen" aria-live="polite">
        <span className="pres-form__huevos"><b>{numero(huevos)}</b>{huevos === 1 ? 'huevo' : 'huevos'}</span>
        <p>
          {formato === 'UNIDAD' && 'Se vende de a un huevo.'}
          {formato === 'BANDEJA' && `Una bandeja de ${huevosBandeja} huevos.`}
          {formato === 'CAJA' && `${numero(bandejas)} bandejas de ${huevosBandeja} = ${numero(huevos)} huevos.`}
          <br /><small>En el stock cuenta como <strong>{Number(equivalencia).toLocaleString('es-AR', { maximumFractionDigits: 6 })}</strong> {Number(equivalencia) === 1 ? 'bandeja' : 'bandejas'} de 30.</small>
        </p>
      </div>
      {errores.cantidad_bandejas_equivalentes && <p className="campo__error">{errores.cantidad_bandejas_equivalentes}</p>}
      {(errores.formato || errores.huevos_por_bandeja) && <p className="campo__error">{errores.formato || errores.huevos_por_bandeja}</p>}
    </>
  )
}
