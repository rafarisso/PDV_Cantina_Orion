import { Link } from 'react-router-dom'

const GuardianOnboardingPage = () => {
  return (
    <div className="app-shell" style={{ maxWidth: 620, paddingTop: 64 }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <img src="/logo-orion.png" alt="Cantina Orion" className="logo-mark" style={{ width: 88, height: 88 }} />
        </div>
        <div className="card-title">Portal do responsavel</div>
        <p className="muted">
          Este acesso permite acompanhar o consumo do aluno, ver saldo e adicionar creditos com Pix seguro.
        </p>
        <div className="card" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <strong>Como funciona</strong>
          <ol style={{ marginTop: 8 }}>
            <li>Solicite o acesso ao portal com a escola.</li>
            <li>Entre com suas credenciais e cadastre o aluno.</li>
            <li>Acompanhe o consumo e recarregue a carteira quando precisar.</li>
          </ol>
        </div>
        <div className="chips" style={{ marginTop: 14 }}>
          <Link to="/" className="btn btn-primary">
            Voltar para o login
          </Link>
        </div>
      </div>
    </div>
  )
}

export default GuardianOnboardingPage
