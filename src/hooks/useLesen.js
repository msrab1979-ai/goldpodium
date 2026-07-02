import { useState, useEffect } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'

// Returns { expired: bool, lessenTamat: string|null, baкиHari: number|null, loading: bool }
export function useLesen(schoolId) {
  const [state, setState] = useState({ expired: false, lessenTamat: null, bakiHari: null, loading: true })

  useEffect(() => {
    if (!schoolId) { setState(s => ({ ...s, loading: false })); return }

    const unsub = onSnapshot(
      doc(db, 'tenants', schoolId),
      snap => {
        if (!snap.exists()) { setState({ expired: false, lessenTamat: null, bakiHari: null, loading: false }); return }
        const d = snap.data()

        // tarikhExpiry boleh jadi Firestore Timestamp atau string YYYY-MM-DD
        let expDate = null
        if (d.tarikhExpiry?.toDate) {
          expDate = d.tarikhExpiry.toDate()
        } else if (d.tarikhExpiry) {
          expDate = new Date(d.tarikhExpiry + 'T23:59:59')
        }

        const now = new Date()
        const expired = expDate ? expDate < now : false
        const bakiHari = expDate
          ? Math.ceil((expDate - now) / (1000 * 60 * 60 * 24))
          : null
        const lessenTamat = expDate
          ? expDate.toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' })
          : null

        setState({ expired, lessenTamat, bakiHari, loading: false })
      },
      () => setState(s => ({ ...s, loading: false }))
    )
    return () => unsub()
  }, [schoolId])

  return state
}
