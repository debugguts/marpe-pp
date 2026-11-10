import { useEffect, useId, useRef } from 'react'
import Icono from './Icono'

// Ventana modal con el <dialog> nativo del navegador:
// bloquea el fondo, se cierra con Escape y devuelve el foco al botón que la abrió.
export default function Dialogo({ titulo, descripcion, alCerrar, children }) {
  const ref = useRef(null)
  const tituloId = useId()

  useEffect(() => {
    const dialogo = ref.current
    dialogo.showModal()
    // Pone el cursor en el primer campo marcado con data-foco (si hay).
    dialogo.querySelector('[data-foco]')?.focus()
    return () => dialogo.close()
  }, [])

  return (
    <dialog
      ref={ref}
      className="dialogo"
      aria-labelledby={tituloId}
      onCancel={(e) => { e.preventDefault(); alCerrar() }}
    >
      <header className="dialogo__cab">
        <div>
          <h2 id={tituloId}>{titulo}</h2>
          {descripcion && <p className="suave">{descripcion}</p>}
        </div>
        <button type="button" className="btn btn--fantasma dialogo__cerrar" aria-label="Cerrar" onClick={alCerrar}>
          <Icono nombre="cerrar" />
        </button>
      </header>
      {children}
    </dialog>
  )
}
