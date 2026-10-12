import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MultiSelect } from '@/components/ui/multi-select'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const EMPTY = {
  key: '',
  label: '',
  identifiers: [],
  sttTerms: [],
  offreExternalIds: [],
  offreFournisseur: null,
}

/** Une valeur par ligne : identifiants et termes STT se saisissent en liste. */
const toLines = values => values.join('\n')
const fromLines = text =>
  text
    .split('\n')
    .map(v => v.trim())
    .filter(Boolean)

const linkOf = product =>
  product.offreExternalIds.length ? 'offres' : product.offreFournisseur ? 'fournisseur' : 'aucune'

/**
 * Création ou modification d'un produit du brouillon. La clé est l'identifiant stable
 * visé par le plan (`productDetected:<clé>`) : elle ne change plus une fois créée.
 */
export default function ProductForm({ open, onOpenChange, product, offres, onSave }) {
  const editing = Boolean(product)
  const [form, setForm] = useState(EMPTY)
  const [identifiers, setIdentifiers] = useState('')
  const [sttTerms, setSttTerms] = useState('')
  const [link, setLink] = useState('aucune')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    const initial = product ?? EMPTY
    setForm(initial)
    setIdentifiers(toLines(initial.identifiers))
    setSttTerms(toLines(initial.sttTerms))
    setLink(linkOf(initial))
    setError(null)
  }, [open, product])

  const offreOptions = useMemo(
    () =>
      offres.map(o => ({
        value: String(o.externalId),
        label: `${o.nom}${o.isActive ? '' : ' (inactive)'}`,
        group: o.fournisseur || 'Sans fournisseur',
      })),
    [offres]
  )
  const fournisseurs = useMemo(
    () => [...new Set(offres.map(o => o.fournisseur).filter(Boolean))].sort(),
    [offres]
  )

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await onSave({
        key: form.key.trim(),
        label: form.label.trim(),
        identifiers: fromLines(identifiers),
        sttTerms: fromLines(sttTerms),
        offreExternalIds: link === 'offres' ? form.offreExternalIds : [],
        offreFournisseur: link === 'fournisseur' ? form.offreFournisseur : null,
      })
      onOpenChange(false)
    } catch (e) {
      setError(e?.message || 'Enregistrement impossible.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={next => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? `Modifier « ${product.label} »` : 'Ajouter un produit'}
          </DialogTitle>
          <DialogDescription>
            Le plan de vente vise un produit par sa clé (étape <code>productDetected:clé</code>).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="product-key">Clé</Label>
            <Input
              id="product-key"
              value={form.key}
              disabled={editing}
              placeholder="assistant_personnel"
              onChange={e => setForm({ ...form, key: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Minuscules, chiffres et _ ; non modifiable ensuite.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-label">Nom</Label>
            <Input
              id="product-label"
              value={form.label}
              placeholder="Assistant personnel"
              onChange={e => setForm({ ...form, label: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-identifiers">
              Pour reconnaître l'offre (une ligne par signal)
            </Label>
            <Textarea
              id="product-identifiers"
              rows={3}
              value={identifiers}
              onChange={e => setIdentifiers(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-stt">
              Termes à orthographier pour la transcription (une ligne par terme)
            </Label>
            <Textarea
              id="product-stt"
              rows={2}
              value={sttTerms}
              onChange={e => setSttTerms(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Offres WinLead+ (prix)</Label>
            <Select value={link} onValueChange={setLink}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="offres">Offres précises</SelectItem>
                <SelectItem value="fournisseur">Toutes les offres d'un fournisseur</SelectItem>
                <SelectItem value="aucune">Aucune (tarifs non vérifiés)</SelectItem>
              </SelectContent>
            </Select>
            {link === 'offres' && (
              <MultiSelect
                options={offreOptions}
                selected={form.offreExternalIds.map(String)}
                onChange={values => setForm({ ...form, offreExternalIds: values.map(Number) })}
                placeholder="Choisir les offres…"
              />
            )}
            {link === 'fournisseur' && (
              <Select
                value={form.offreFournisseur ?? ''}
                onValueChange={value => setForm({ ...form, offreFournisseur: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choisir le fournisseur…" />
                </SelectTrigger>
                <SelectContent>
                  {fournisseurs.map(f => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {error && (
          <p className="whitespace-pre-wrap break-words rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={busy || !form.key.trim() || !form.label.trim()} onClick={save}>
            {busy && <Loader2 className="animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
