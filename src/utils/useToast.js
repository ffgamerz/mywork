import { useState, useCallback, useEffect, useRef } from 'react'

export function useToast() {
  const [toast, setToast] = useState({ message: '', type: 'success', visible: false })
  const timerRef = useRef(null)

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, visible: true })
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }))
    }, 4000)
  }, [])

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, visible: false }))
  }, [])

  // Clear pending timer on unmount to avoid setState on unmounted component
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return { toast, showToast, hideToast }
}
