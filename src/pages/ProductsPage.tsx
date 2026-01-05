import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/state/AuthContext'
import { formatCurrency } from '@/lib/format'
import type { Product } from '@/types/domain'

type ProductDraft = {
  id?: string
  name: string
  price: string
  category: string
  active: boolean
}

const emptyDraft: ProductDraft = {
  name: '',
  price: '',
  category: '',
  active: true,
}

const ProductsPage = () => {
  const { role } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const loadProducts = async () => {
    setError(null)
    if (!supabase) {
      setError('Supabase nao configurado')
      return
    }
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })
    if (loadError) {
      setError(loadError.message)
    } else if (data) {
      setProducts(
        data.map((row: any) => ({
          id: row.id,
          name: row.name,
          price: Number(row.price ?? 0),
          category: row.category ?? undefined,
          active: row.active,
        })),
      )
    }
    setLoading(false)
  }

  useEffect(() => {
    if (role === 'admin') {
      void loadProducts()
    }
  }, [role])

  const resetDraft = () => setDraft(emptyDraft)

  const parsePrice = (value: string) => Number(value.replace(',', '.'))

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setFeedback(null)
    if (!supabase) {
      setError('Supabase nao configurado')
      return
    }
    if (!draft.name.trim()) {
      setError('Informe o nome do produto.')
      return
    }
    const priceValue = parsePrice(draft.price)
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      setError('Informe um preco valido.')
      return
    }

    setSaving(true)
    try {
      if (draft.id) {
        const { error: updateError } = await supabase
          .from('products')
          .update({
            name: draft.name.trim(),
            price: priceValue,
            category: draft.category.trim() || null,
            active: draft.active,
          })
          .eq('id', draft.id)
        if (updateError) throw updateError
        setFeedback('Produto atualizado.')
      } else {
        const { error: insertError } = await supabase.from('products').insert({
          name: draft.name.trim(),
          price: priceValue,
          category: draft.category.trim() || null,
          active: draft.active,
        })
        if (insertError) throw insertError
        setFeedback('Produto criado.')
      }
      resetDraft()
      await loadProducts()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (product: Product) => {
    setDraft({
      id: product.id,
      name: product.name,
      price: String(product.price ?? ''),
      category: product.category ?? '',
      active: product.active !== false,
    })
    setFeedback(null)
    setError(null)
  }

  const handleDeactivate = async (productId: string) => {
    setError(null)
    setFeedback(null)
    if (!supabase) {
      setError('Supabase nao configurado')
      return
    }
    setSaving(true)
    try {
      const { error: updateError } = await supabase.from('products').update({ active: false }).eq('id', productId)
      if (updateError) throw updateError
      setFeedback('Produto desativado.')
      await loadProducts()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <section className="card">
        <div className="section-title">
          <h3 style={{ margin: 0 }}>{draft.id ? 'Editar produto' : 'Novo produto'}</h3>
          <span className="muted">Cadastro e atualizacao de itens vendidos no PDV.</span>
        </div>
        <form onSubmit={handleSubmit} className="grid grid-cols-2" style={{ gap: 12 }}>
          <div className="field">
            <label>Nome</label>
            <input
              className="input"
              value={draft.name}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label>Preco</label>
            <input
              className="input"
              type="number"
              min={0.01}
              step={0.01}
              value={draft.price}
              onChange={(event) => setDraft((prev) => ({ ...prev, price: event.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label>Categoria</label>
            <input
              className="input"
              value={draft.category}
              onChange={(event) => setDraft((prev) => ({ ...prev, category: event.target.value }))}
              placeholder="Lanches, Bebidas, Doces..."
            />
          </div>
          <div className="field">
            <label>Ativo</label>
            <select
              className="input"
              value={draft.active ? 'true' : 'false'}
              onChange={(event) => setDraft((prev) => ({ ...prev, active: event.target.value === 'true' }))}
            >
              <option value="true">Sim</option>
              <option value="false">Nao</option>
            </select>
          </div>
          {error && <div className="pill danger">{error}</div>}
          {feedback && <div className="pill positive">{feedback}</div>}
          <div className="chips">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Salvando...' : draft.id ? 'Atualizar' : 'Criar produto'}
            </button>
            {draft.id && (
              <button className="btn btn-ghost" type="button" onClick={resetDraft} disabled={saving}>
                Cancelar edicao
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="card">
        <div className="section-title">
          <h3 style={{ margin: 0 }}>Produtos cadastrados</h3>
          <span className="muted">Visao completa de itens ativos e inativos.</span>
        </div>
        {loading && <div className="muted">Carregando produtos...</div>}
        {!loading && products.length === 0 && <div className="muted">Nenhum produto cadastrado.</div>}
        {!loading && products.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Categoria</th>
                <th>Preco</th>
                <th>Status</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td>{product.category ?? '-'}</td>
                  <td>{formatCurrency(product.price)}</td>
                  <td>
                    <span className={`pill ${product.active === false ? 'danger' : 'positive'}`}>
                      {product.active === false ? 'Inativo' : 'Ativo'}
                    </span>
                  </td>
                  <td>
                    <div className="chips">
                      <button className="btn" type="button" onClick={() => handleEdit(product)}>
                        Editar
                      </button>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => handleDeactivate(product.id)}
                        disabled={saving || product.active === false}
                      >
                        Desativar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export default ProductsPage
