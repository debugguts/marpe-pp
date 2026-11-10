import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
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
