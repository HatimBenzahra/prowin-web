import { StatTile } from '@/components/details/DetailPrimitives'
import { delta, formatNumber, formatPercent } from '../stats-format'

/**
 * Les cinq chiffres qui ouvrent la page, chacun avec son écart vs la période
 * précédente de même durée.
 *
 * « Contrats signés » (déclaré terrain) et « Contrats validés » (confirmé
 * back-office WinLeadPlus) sont volontairement côte à côte : c'est l'écart entre
 * les deux qui porte l'information, et il n'était visible nulle part au global.
 */
export default function StatsKpiRow({ current, previous, contratsValides }) {
  if (!current) return null

  const signes = current.contratsSignes
  const valides = contratsValides?.total ?? null
  const validesPrevious = contratsValides?.totalPrevious ?? null

  // Part des contrats annoncés qui finissent confirmés. Au-delà de 100 %, le
  // back-office a validé des contrats signés avant la période : on le dit plutôt
  // que d'afficher un taux qui laisse croire à une erreur de calcul.
  const tauxValidation = signes > 0 && valides != null ? (valides / signes) * 100 : null

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <StatTile
        iconName="contract-doc"
        label="Contrats signés"
        value={formatNumber(signes)}
        hint="Déclarés terrain"
        delta={delta(signes, previous?.contratsSignes)}
        deltaGoodDirection="up"
      />
      <StatTile
        iconName="stamper"
        label="Contrats validés"
        value={valides == null ? '—' : formatNumber(valides)}
        hint="Confirmés back-office"
        delta={delta(valides, validesPrevious)}
        deltaGoodDirection="up"
      />
      <StatTile
        iconName="door"
        label="Portes prospectées"
        value={formatNumber(current.nbPortesProspectes)}
        hint={`${formatNumber(current.nbPortesDistinctes)} porte${
          current.nbPortesDistinctes > 1 ? 's' : ''
        } distincte${current.nbPortesDistinctes > 1 ? 's' : ''} — hors repassages sans changement`}
        delta={delta(current.nbPortesProspectes, previous?.nbPortesProspectes)}
        deltaGoodDirection="up"
      />
      <StatTile
        iconName="chart"
        label="Taux de conversion"
        value={formatPercent(current.tauxConversion)}
        hint="Signés / (signés + RDV + refus)"
        delta={delta(current.tauxConversion, previous?.tauxConversion)}
        deltaSuffix=" pt"
        deltaGoodDirection="up"
      />
      <StatTile
        iconName="stopwatch"
        label="Taux de validation"
        value={tauxValidation == null ? '—' : formatPercent(tauxValidation)}
        hint={
          tauxValidation != null && tauxValidation > 100
            ? 'Inclut des signatures antérieures'
            : 'Validés / signés'
        }
      />
    </div>
  )
}
