import { CabeceraPagina, Insignia, Panel } from '../components/ui'
import { fechaLarga, moneda, numero } from '../lib/formato'

// Datos de ejemplo: se reemplazan por la API en el Sprint 5 (ventas, caja e inventario).
const VENTAS = [
  { clave: 'Efectivo', monto: 118400, color: 'var(--marron)' },
  { clave: 'Transferencias', monto: 52920, color: 'var(--rosa)' },
  { clave: 'Fiado', monto: 13000, color: 'color-mix(in srgb, var(--marron) 38%, var(--arena))' },
]
const STOCK = { maples: 142, sueltos: 18, porMaple: 30 }
const MOVIMIENTOS = [
  { hora: '11:20', tipo: 'Venta', detalle: 'Consumidor final · 2 maples', pago: 'Efectivo', importe: 26000 },
  { hora: '10:42', tipo: 'Venta', detalle: 'Kiosco San Cayetano · 1 maple', pago: 'Fiado', importe: 13000 },
  { hora: '10:05', tipo: 'Venta', detalle: 'Panadería Doña Rosa · 4 maples', pago: 'Transferencia', importe: 52000 },
  { hora: '09:30', tipo: 'Merma', detalle: '6 huevos rotos en la descarga', pago: '—', importe: null },
  { hora: '08:15', tipo: 'Compra', detalle: 'Granja Los Álamos · 20 maples', pago: 'Transferencia', importe: -190000 },
]
const TIPO = { Venta: 'marca', Compra: 'neutro', Merma: 'peligro' }

function Maple({ huevos, capacidad }) {
  return (
    <div className="maple" role="img" aria-label={`Maple abierto con ${huevos} de ${capacidad} huevos`}>
      {Array.from({ length: capacidad }, (_, i) => (
        <span key={i} className={`maple__huevo${i < huevos ? ' is-lleno' : ''}`} style={{ '--i': i }} />
      ))}
    </div>
  )
}

export default function Inicio() {
  const totalVentas = VENTAS.reduce((s, v) => s + v.monto, 0)
  const totalHuevos = STOCK.maples * STOCK.porMaple + STOCK.sueltos

  return (
    <>
      <CabeceraPagina
        titulo="Inicio"
        descripcion={fechaLarga(new Date())}
        acciones={<Insignia variante="aviso">Datos de ejemplo</Insignia>}
      />

      <div className="inicio-grid">
        <Panel
          className="inicio-ventas"
          titulo="Ventas de hoy"
          accion={<Insignia variante="exito">Caja abierta</Insignia>}
        >
          <p className="cifra">{moneda(totalVentas)}</p>
          <p className="cifra-nota">Abrió Gustavo a las 08:00</p>

          <div className="reparto" aria-hidden="true">
            {VENTAS.map((v) => (
              <span key={v.clave} style={{ flexGrow: v.monto, '--sw': v.color }} />
            ))}
          </div>

          <dl className="hechos">
            {VENTAS.map((v) => (
              <div key={v.clave} style={{ '--sw': v.color }}>
                <dt>{v.clave}</dt>
                <dd>{moneda(v.monto)}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel
          className="inicio-stock"
          titulo="Huevo blanco selección"
          accion={<Insignia variante="exito">Stock normal</Insignia>}
        >
          <p className="cifra">
            {numero(STOCK.maples)} <span className="cifra__unidad">maples</span>
          </p>
          <p className="cifra-nota">
            y {numero(STOCK.sueltos)} huevos sueltos · {numero(totalHuevos)} en total
          </p>
          <Maple huevos={STOCK.sueltos} capacidad={STOCK.porMaple} />
          <p className="maple-leyenda">Maple abierto: {STOCK.sueltos} de {STOCK.porMaple} huevos</p>
        </Panel>

        <Panel className="inicio-mov" titulo="Movimientos de hoy">
          <div className="tabla-wrap">
            <table className="tabla">
              <caption className="sr-only">Últimos movimientos del día</caption>
              <thead>
                <tr>
                  <th scope="col">Hora</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Detalle</th>
                  <th scope="col">Pago</th>
                  <th scope="col" className="num">Importe</th>
                </tr>
              </thead>
              <tbody>
                {MOVIMIENTOS.map((m) => (
                  <tr key={m.hora}>
                    <td>{m.hora}</td>
                    <td><Insignia variante={TIPO[m.tipo]}>{m.tipo}</Insignia></td>
                    <td>{m.detalle}</td>
                    <td>{m.pago === 'Fiado' ? <Insignia variante="aviso">Fiado</Insignia> : m.pago}</td>
                    <td className="num">{m.importe === null ? '—' : moneda(m.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  )
}
