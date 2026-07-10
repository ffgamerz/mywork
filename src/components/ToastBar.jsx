export default function ToastBar({ toast, onClose }) {
  if (!toast.visible) return null

  const bgColor = toast.type === 'success'
    ? 'alert-success'
    : toast.type === 'error'
    ? 'alert-error'
    : 'alert-info'

  return (
    <div className="fixed top-16 right-0 z-50 p-4">
      <div className={`alert ${bgColor} shadow-lg text-white font-bold rounded-xl flex items-center gap-2`}>
        <span>{toast.message}</span>
        <button onClick={onClose} className="btn btn-ghost btn-xs btn-circle">✕</button>
      </div>
    </div>
  )
}