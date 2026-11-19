import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
// Menú lateral (Sprint 11): Roboto de Menú a Clientes, Inter de Reportes a Salir
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/componentes.css'
import './styles/layout.css'
import './styles/inicio.css'
import './styles/login.css'
import './styles/abm.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
