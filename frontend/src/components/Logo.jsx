// Logo horizontal del manual de identidad: isotipo (el huevo) + "MARPE" + "HUEVERÍA - CERRILLOS".
// El huevo es una imagen en alta resolución (/public/logo-isotipo.png, sacada del manual) y el texto
// se escribe con Poppins en los colores del manual: así se ve nítido a cualquier tamaño.
// "alto" es la altura del huevo en píxeles; el texto se ajusta solo.
export default function Logo({ alto = 52 }) {
  return (
    <span className="logo" style={{ '--logo-alto': `${alto}px` }} translate="no">
      <img src="/logo-isotipo.png" alt="" width={Math.round(alto * 0.74)} height={alto} />
      <span className="logo__texto">
        <span className="logo__nombre">MARPE</span>
        <span className="logo__lugar">HUEVERÍA - CERRILLOS</span>
      </span>
      <span className="sr-only">Huevería Marpe</span>
    </span>
  )
}
