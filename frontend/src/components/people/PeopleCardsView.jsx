import { useState } from 'react'
import { Users } from 'lucide-react'
import EditModal from '@/components/EditModal'
import { ActionConfirmation } from '@/components/ActionConfirmation'
import PersonListCard from './PersonListCard'

/**
 * Liste de personnes en cards pleine largeur, empilées.
 *
 * `factsOf` reçoit une personne et renvoie les informations à afficher sous son nom :
 * les trois pages décrivent ce qu'elles veulent montrer, ce composant ne connaît pas
 * les rôles.
 *
 * `onSave` **soumet** la mise à jour, ce n'est pas un ouvreur de formulaire — d'où la
 * réutilisation d'`EditModal`, appelée seulement à la validation.
 */
export default function PeopleCardsView({
  people,
  detailsPath,
  factsOf,
  showRanking = true,
  canEdit,
  editFields,
  onSave,
  editTitle = 'Modifier la fiche',
  canArchive,
  onArchive,
  emptyLabel = 'Aucun résultat',
}) {
  const [editing, setEditing] = useState(null)
  const [archiving, setArchiving] = useState(null)
  const [archivePending, setArchivePending] = useState(false)
  const editable = Boolean(canEdit && (editFields || onSave !== undefined))
  // Le handler peut venir de la prop ou de la personne (liste fusionnée).
  const archivable = Boolean(canArchive)

  if (!people || people.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 py-12 text-center">
        <Users className="h-5 w-5 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      </div>
    )
  }

  return (
    <>
      {/* `@container/list` : c'est CETTE largeur — celle que la grille de la page laisse
          à la liste — qui décide de la forme d'une rangée, pas celle de la fenêtre. Les
          deux divergent de plusieurs centaines de pixels dès que la sidebar est ouverte
          ou qu'un panneau occupe la colonne de droite. `PersonListCard` s'y replie. */}
      <div className="@container/list space-y-3">
        {people.map(person => (
          <PersonListCard
            key={person.rowKey || person.id}
            person={person}
            detailsPath={detailsPath}
            facts={factsOf ? factsOf(person) : []}
            showRanking={showRanking}
            canEdit={editable}
            onEdit={setEditing}
            canArchive={archivable}
            onArchive={setArchiving}
          />
        ))}
      </div>

      {editable && editing && (
        <EditModal
          open={Boolean(editing)}
          onOpenChange={open => {
            if (!open) setEditing(null)
          }}
          title={editTitle}
          description="Modifiez les informations ci-dessous"
          data={editing}
          fields={editing.editFields || editFields}
          onSave={async editedData => {
            // Liste fusionnée : chaque personne peut porter son propre handler, les
            // rôles ne partageant ni les champs ni la mutation.
            await (editing.onSaveEdit || onSave)(editedData)
            setEditing(null)
          }}
        />
      )}

      <ActionConfirmation
        isOpen={Boolean(archiving)}
        onClose={() => setArchiving(null)}
        type="info"
        title="Archiver ce membre"
        description="Son statut passera à « Contrat fini ». Il disparaîtra des listes filtrées sur les actifs, mais sa fiche et son historique sont conservés. L'opération est réversible en modifiant son statut."
        itemName={archiving ? `${archiving.prenom || ''} ${archiving.nom || ''}`.trim() : undefined}
        confirmText="Archiver"
        isLoading={archivePending}
        onConfirm={async () => {
          setArchivePending(true)
          try {
            await (archiving.onArchive || onArchive)(archiving.id)
            setArchiving(null)
          } finally {
            setArchivePending(false)
          }
        }}
      />
    </>
  )
}
