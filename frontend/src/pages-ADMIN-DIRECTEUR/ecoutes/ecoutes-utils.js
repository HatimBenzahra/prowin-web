export function buildUserLookup(users) {
  const lookup = new Map()
  for (const user of users) {
    const safeRoom = `room_${(user.userType || '').toLowerCase()}_${user.id}`
    lookup.set(safeRoom, user)
  }
  return lookup
}

export function enrichRecordingWithUser(recording, userLookup, formatSize) {
  const keyParts = recording.key.split('/').filter(Boolean)
  const safeRoom = keyParts.length >= 2 ? keyParts[keyParts.length - 2] : ''
  const user = userLookup.get(safeRoom)

  const userName = user ? `${user.prenom || ''} ${user.nom || ''}`.trim() : ''
  return {
    id: recording.key,
    key: recording.key,
    url: null,
    rawUrl: null,
    size: recording.size,
    lastModified: recording.lastModified,
    filename: recording.key.split('/').pop() || '',
    date: recording.lastModified
      ? new Date(recording.lastModified).toLocaleDateString()
      : '',
    time: recording.lastModified
      ? new Date(recording.lastModified).toLocaleTimeString()
      : '',
    duration: formatSize(recording.size),
    userId: user?.id,
    userType: user?.userType,
    userName,
    userPrenom: user?.prenom,
    userNom: user?.nom,
  }
}

export function filterRecordings(recordings, searchTerm, dateFrom, dateTo) {
  if (!recordings) return []
  return recordings.filter(recording => {
    const searchMatch =
      !searchTerm || recording.filename.toLowerCase().includes(searchTerm.toLowerCase())

    const dateMatch = (() => {
      if (!dateFrom && !dateTo) return true
      const recDate = new Date(recording.lastModified).getTime()
      const from = dateFrom ? new Date(dateFrom).setHours(0, 0, 0, 0) : -Infinity
      const to = dateTo ? new Date(dateTo).setHours(23, 59, 59, 999) : Infinity
      return recDate >= from && recDate <= to
    })()

    return searchMatch && dateMatch
  })
}

export function sortRecordings(recordings, sortConfig, speechScores) {
  if (!recordings?.length) return []

  const sorted = [...recordings].sort((a, b) => {
    let leftValue
    let rightValue

    if (sortConfig.key === 'filename') {
      leftValue = a.filename.toLowerCase()
      rightValue = b.filename.toLowerCase()
    } else if (sortConfig.key === 'size') {
      leftValue = a.size
      rightValue = b.size
    } else if (sortConfig.key === 'speechScore') {
      leftValue = speechScores.get(a.key)?.score ?? -1
      rightValue = speechScores.get(b.key)?.score ?? -1
    } else {
      leftValue = new Date(a.lastModified).getTime()
      rightValue = new Date(b.lastModified).getTime()
    }

    if (leftValue < rightValue) return -1
    if (leftValue > rightValue) return 1
    return 0
  })

  return sortConfig.direction === 'asc' ? sorted : sorted.reverse()
}

export function filterEcouteUsers(users, searchTerm, showOnlyOnline, isUserOnlineFn, statusFilter) {
  if (!users) return []
  return users.filter(user => {
    const searchMatch =
      user.nom?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.prenom?.toLowerCase().includes(searchTerm.toLowerCase())

    const onlineMatch = showOnlyOnline ? isUserOnlineFn(user.id, user.userType) : true
    const statusMatch = statusFilter === 'ALL' ? true : user?.status === statusFilter

    return searchMatch && onlineMatch && statusMatch
  })
}
