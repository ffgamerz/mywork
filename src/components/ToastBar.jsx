export default function ToastBar({ toast, onClose }) {
  if (!toast.visible) return null

  const isSuccess = toast.type === 'success'
  const bgClass = isSuccess ? 'bg-success'
    : toast.type === 'error' ? 'bg-error'
    : 'bg-blue'
  // Light green bg needs dark text for readability; error/info keep white text
  const textClass = isSuccess ? 'text-dark' : 'text-white'

  return (
    <div className="toast-container-custom">
      <div className={`d-flex align-items-center gap-2 px-3 py-2 shadow-lg rounded-pill ${bgClass} ${textClass} fw-600 text-14`}>
        <span>{toast.message}</span>
        <button onClick={onClose} className={`btn btn-sm p-0 border-0 d-flex align-items-center justify-content-center ${textClass} bg-white-20 w-24 h-24 rounded-circle`}>
          <span className="material-symbols-outlined" style={{fontSize:'14px'}}>close</span>
        </button>
      </div>
    </div>
  )
}