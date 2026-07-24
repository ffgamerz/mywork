export default function ToastBar({ toast, onClose }) {
  if (!toast.visible) return null

  const bgClass = toast.type === 'success' ? 'bg-success'
    : toast.type === 'error' ? 'bg-error'
    : 'bg-blue'

  return (
    <div className="pos-fixed top-8 z-9999">
      <div className={`d-flex align-items-center gap-2 px-3 py-2 shadow-lg rounded-pill ${bgClass} text-white fw-600 text-14`}>
        <span>{toast.message}</span>
        <button onClick={onClose} className="btn btn-sm p-0 border-0 d-flex align-items-center justify-content-center text-white bg-white-20 w-24 h-24 rounded-circle">
          <span className="material-symbols-outlined" style={{fontSize:'14px'}}>close</span>
        </button>
      </div>
    </div>
  )
}