import { SeverityPill } from './CoachingComponents'

/** Ce qu'une fiche autorise et ce qu'elle surveille : version active ou ancienne version. */
export default function ProductSheetContent({ sheet }) {
  return (
    <>
      <div className="px-4 py-3">
        <h4 className="mb-1.5 text-sm font-semibold">Ce que le commercial peut affirmer</h4>
        <ul className="space-y-1">
          {(sheet.facts || []).map((fact, i) => (
            <li key={i} className="flex gap-2 text-sm text-foreground/90">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
              {fact}
            </li>
          ))}
        </ul>
      </div>

      {(sheet.forbidden || []).length > 0 && (
        <div className="border-t border-dashed border-border/60 px-4 py-3">
          <h4 className="mb-1.5 text-sm font-semibold">Affirmations surveillées</h4>
          <ul className="space-y-1.5">
            {sheet.forbidden.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <SeverityPill severity={f.severity} />
                <span className="text-foreground/90">« {f.say} »</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
