import { useState } from 'react'

// Logo horizontal oficial del manual de identidad: /public/logo-horizontal.png (290 × 112 px).
// A 40 px de alto mide 104 px de ancho: respeta el mínimo digital de 96 px del manual.
// Si el archivo todavía no existe, muestra el nombre en texto. No se altera ni se recolorea el logo.
export default function Logo({ alto = 40 }) {
  const [falla, setFalla] = useState(false)

  if (falla) {
    return <span className="logo-texto" translate="no">Huevería Marpe</span>
  }
  return (
    <img
      src="/logo-horizontal.png"
      alt="Huevería Marpe"
      width={Math.round(alto * 2.59)}
      height={alto}
      onError={() => setFalla(true)}
    />
  )
}
