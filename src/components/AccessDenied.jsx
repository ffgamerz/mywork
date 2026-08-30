export default function AccessDenied({ message = 'Access Denied: Unauthorized.' }) {
  return (
    <div className="alert-unauthorized">
      <span className="material-symbols-outlined me-1" style={{ fontSize: '14px', verticalAlign: 'middle' }}>lock</span> {message}
    </div>
  )
}
