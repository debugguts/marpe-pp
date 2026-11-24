// Gráfico de dona (torta con agujero) para ver cómo se reparte un total: gastos por categoría,
// ventas por presentación, compras por proveedor. Va con su leyenda (punto de color y porcentaje).
// partes: [{ nombre, valor, color }] · centro: texto grande del medio · nota: texto chico debajo.
const TAMANO = 180
const GROSOR = 32

export default function Dona({ partes, centro, nota, etiqueta }) {
  const total = partes.reduce((s, p) => s + Number(p.valor), 0)
  const visibles = partes.filter((p) => Number(p.valor) > 0)
  const radio = (TAMANO - GROSOR) / 2
  const circulo = 2 * Math.PI * radio
  const porcentaje = (v) => (total ? Math.round((Number(v) / total) * 100) : 0)
  // Dónde empieza cada parte sobre el círculo (la suma de las anteriores)
  const tramos = visibles.map((p, i) => {
    const largo = (Number(p.valor) / total) * circulo
    const inicio = visibles.slice(0, i).reduce((s, q) => s + (Number(q.valor) / total) * circulo, 0)
    return { ...p, largo, inicio }
  })

  return (
    <div className="dona">
      <svg viewBox={`0 0 ${TAMANO} ${TAMANO}`} className="dona__grafico" role="img"
        aria-label={`${etiqueta ?? 'Distribución'}: ${visibles.map((p) => `${p.nombre} ${porcentaje(p.valor)} %`).join(', ') || 'sin datos'}`}>
        <circle cx={TAMANO / 2} cy={TAMANO / 2} r={radio} fill="none" stroke="#EFE6DC" strokeWidth={GROSOR} />
        {tramos.map((p) => (
          <circle key={p.nombre} cx={TAMANO / 2} cy={TAMANO / 2} r={radio} fill="none" style={{ stroke: p.color }} strokeWidth={GROSOR}
            strokeDasharray={`${Math.max(0, p.largo - (tramos.length > 1 ? 2 : 0))} ${circulo}`} strokeDashoffset={-p.inicio}
            transform={`rotate(-90 ${TAMANO / 2} ${TAMANO / 2})`} />
        ))}
        {centro && <text x="50%" y="48%" textAnchor="middle" className="dona__centro">{centro}</text>}
        {nota && <text x="50%" y="61%" textAnchor="middle" className="dona__nota">{nota}</text>}
      </svg>
      <ul className="dona__leyenda">
        {visibles.map((p) => (
          <li key={p.nombre}>
            <span className="punto-color" style={{ background: p.color }} aria-hidden="true" />
            <span>{p.nombre}</span>
            <b>{porcentaje(p.valor)} %</b>
          </li>
        ))}
        {visibles.length === 0 && <li className="suave">Todavía no hay datos este mes.</li>}
      </ul>
    </div>
  )
}
