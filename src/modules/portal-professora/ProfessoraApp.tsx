import { HashRouter, Route, Routes } from 'react-router-dom'
import { AulasPage } from './AulasPage'
import { ChamadaPage } from './ChamadaPage'
import { PagamentosPage } from './PagamentosPage'
import { PerfilPage } from './PerfilPage'
import { ProfessoraAuthGate } from './ProfessoraAuthGate'
import { ProfessoraLayout } from './ProfessoraLayout'

/** Mesmo defeito e mesma correção do portal da aluna — ver PortalApp. */
const BASENAME = window.location.hash.startsWith('#/prof') ? '/prof' : ''

export function ProfessoraApp() {
  return (
    <ProfessoraAuthGate>
      <HashRouter basename={BASENAME}>
        <Routes>
          <Route element={<ProfessoraLayout />}>
            <Route index element={<AulasPage />} />
            <Route path="aula/:turmaId/:data" element={<ChamadaPage />} />
            <Route path="pagamentos" element={<PagamentosPage />} />
            <Route path="perfil" element={<PerfilPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </ProfessoraAuthGate>
  )
}
